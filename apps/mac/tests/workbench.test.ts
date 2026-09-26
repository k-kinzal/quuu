import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { Project } from '../src/main/projects/types.js'
import { ReviewService } from '../src/main/review/service.js'
import { aggregateTaskChanges, captureReviewBaseline, inferReviewBaseline } from '../src/main/review/git.js'
import { discoverProjectTasks } from '../src/main/projects/tasks.js'
import { readCoverage } from '../src/main/review/coverage.js'
import { buildFileTree } from '../src/main/review/tree.js'
import { extractSymbols, parseUnifiedDiff } from '../src/main/review/code.js'
import { parseStatusEntries } from '../src/main/review/gitFormat.js'

let dir: string

function runGit(...args: string[]): string {
  return execFileSync('/usr/bin/git', args, { cwd: dir, encoding: 'utf8' })
}

function initGit(): void {
  runGit('init', '-q')
  runGit('config', 'user.name', 'Quuu Test')
  runGit('config', 'user.email', 'quuu@example.invalid')
}

function project(): Project {
  return {
    id: 'project-1',
    name: 'fixture',
    path: dir,
    color: '#fff',
    priority: 2,
    targetKind: 'agent',
    targetId: null,
    maxConcurrent: 1,
    enabled: true,
    deletedAt: null,
    importSince: null,
    commitIdentityMode: 'off',
    commitIdentity: { appSlug: '', botUserId: '' },
    editorApp: '',
    reportEnabled: true,
    source: 'user',
    sortOrder: 0,
    createdAt: '',
    updatedAt: ''
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-workbench-'))
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('the review workbench', () => {
  it('gathers the files into a directory-first tree and leaves the change marks on the leaves', () => {
    expect(
      buildFileTree([
        { path: 'README.md', change: 'modified' },
        { path: 'src/z.ts', change: 'deleted' },
        { path: 'src/a.ts', change: 'added' }
      ])
    ).toMatchObject([
      {
        name: 'src',
        kind: 'directory',
        children: [
          { name: 'a.ts', kind: 'file', change: 'added' },
          { name: 'z.ts', kind: 'file', change: 'deleted' }
        ]
      },
      { name: 'README.md', kind: 'file', change: 'modified' }
    ])
  })

  it('makes a porcelain -z rename put the path after the rename under review', () => {
    expect(parseStatusEntries('R  src/new.ts\0src/old.ts\0?? added.ts\0')).toEqual([
      { path: 'added.ts', change: 'untracked' },
      { path: 'src/new.ts', change: 'renamed', previousPath: 'src/old.ts' }
    ])
  })

  it('compares against the contents at the start, keeping renames and deletions without mixing in uncommitted work from before it', async () => {
    initGit()
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'README.md'), 'before\n')
    writeFileSync(join(dir, 'src', 'old.ts'), 'same\n')
    writeFileSync(join(dir, 'src', 'gone.ts'), 'delete me\n')
    writeFileSync(join(dir, 'human.ts'), 'clean\n')
    runGit('add', '-A')
    runGit('commit', '-qm', 'before task')
    writeFileSync(join(dir, 'human.ts'), 'already dirty\n')

    const baseline = await captureReviewBaseline(
      dir,
      'task-1',
      '2026-08-30T00:00:00.000Z'
    )
    writeFileSync(join(dir, 'README.md'), 'after\n')
    writeFileSync(join(dir, 'added.ts'), 'new\n')
    renameSync(join(dir, 'src', 'old.ts'), join(dir, 'src', 'new.ts'))
    unlinkSync(join(dir, 'src', 'gone.ts'))

    const snapshot = await new ReviewService().snapshot(
      dir,
      project(),
      DEFAULT_SETTINGS,
      baseline
    )
    expect(snapshot.changes).toEqual([
      { path: 'README.md', change: 'modified', previousPath: undefined },
      { path: 'added.ts', change: 'added', previousPath: undefined },
      { path: 'src/gone.ts', change: 'deleted', previousPath: undefined },
      { path: 'src/new.ts', change: 'renamed', previousPath: 'src/old.ts' }
    ])
    expect(snapshot.localChanges).toEqual(snapshot.changes)
    expect(snapshot.changes.some((file) => file.path === 'human.ts')).toBe(false)
  })

  it('reads the body and the diff of the same revision as the listing, however much editing, committing and deleting happens afterwards', async () => {
    initGit()
    writeFileSync(join(dir, 'result.ts'), 'before\n')
    runGit('add', '-A')
    runGit('commit', '-qm', 'before')
    const baseline = await captureReviewBaseline(dir, 'stable', new Date().toISOString())
    writeFileSync(join(dir, 'result.ts'), 'reviewed\n')
    const service = new ReviewService()
    const snapshot = await service.snapshot(dir, project(), DEFAULT_SETTINGS, baseline)
    if (!snapshot.revision) throw new Error('no review revision')
    writeFileSync(join(dir, 'result.ts'), 'later task\n')
    runGit('add', '-A')
    runGit('commit', '-qm', 'later')
    unlinkSync(join(dir, 'result.ts'))

    const file = await service.file(dir, project(), DEFAULT_SETTINGS, {
      source: 'task', path: 'result.ts', revision: snapshot.revision
    })
    expect(file.content).toBe('reviewed\n')
    expect(file.diff.filter((line) => line.kind === 'added').map((line) => line.text)).toEqual(['reviewed'])
    expect(file.diff.filter((line) => line.kind === 'deleted').map((line) => line.text)).toEqual(['before'])
  })

  it('reads the body of a deletion or a rename from the listing revision too, never mixing in a same-named file from the working directory', async () => {
    initGit()
    writeFileSync(join(dir, 'old.ts'), 'renamed content\n')
    writeFileSync(join(dir, 'gone.ts'), 'deleted content\n')
    runGit('add', '-A')
    runGit('commit', '-qm', 'before')
    const baseline = await captureReviewBaseline(dir, 'rename', new Date().toISOString())
    renameSync(join(dir, 'old.ts'), join(dir, 'new.ts'))
    unlinkSync(join(dir, 'gone.ts'))
    const service = new ReviewService()
    const snapshot = await service.snapshot(dir, project(), DEFAULT_SETTINGS, baseline)
    if (!snapshot.revision) throw new Error('no review revision')
    writeFileSync(join(dir, 'new.ts'), 'unrelated\n')
    writeFileSync(join(dir, 'gone.ts'), 'recreated\n')
    const renamed = await service.file(dir, project(), DEFAULT_SETTINGS, {
      source: 'task', path: 'new.ts', previousPath: 'old.ts', revision: snapshot.revision
    })
    const deleted = await service.file(dir, project(), DEFAULT_SETTINGS, {
      source: 'task', path: 'gone.ts', revision: snapshot.revision
    })
    expect(renamed.content).toBe('renamed content\n')
    expect(deleted.content).toBe('deleted content\n')
    expect(deleted.diff).toContainEqual({ kind: 'deleted', oldLine: 1, newLine: null, text: 'deleted content' })
  })

  it('does not carry a large file over IPC even with the revision pinned', async () => {
    initGit()
    writeFileSync(join(dir, 'large.txt'), 'x'.repeat(9 * 1024 * 1024))
    runGit('add', '-A')
    runGit('commit', '-qm', 'large')
    const baseline = await captureReviewBaseline(dir, 'large', new Date().toISOString())
    const service = new ReviewService()
    const snapshot = await service.snapshot(dir, project(), DEFAULT_SETTINGS, baseline)
    if (!snapshot.revision) throw new Error('no review revision')
    const file = await service.file(dir, project(), DEFAULT_SETTINGS, {
      source: 'task', path: 'large.txt', revision: snapshot.revision
    })
    expect(file.binary).toBe(true)
    expect(file.content).toBe('')
  })

  it('fails the fetch instead of falling back to HEAD when the diff revision is invalid', async () => {
    const service = new ReviewService()
    await expect(service.file(dir, project(), DEFAULT_SETTINGS, {
      source: 'task', path: 'result.ts', revision: { base: '', head: 'HEAD' }
    })).rejects.toThrow('Cannot read the revision of the task diff')
  })

  it('splits the commit screen into commits made after the start and the current uncommitted work', async () => {
    initGit()
    writeFileSync(join(dir, 'committed.ts'), 'before\n')
    writeFileSync(join(dir, 'working.ts'), 'before\n')
    runGit('add', '-A')
    runGit('commit', '-qm', 'before task')
    const baseline = await captureReviewBaseline(
      dir,
      'task-2',
      '2026-08-30T00:00:00.000Z'
    )

    writeFileSync(join(dir, 'committed.ts'), 'committed\n')
    runGit('add', 'committed.ts')
    runGit('commit', '-qm', 'AI commit')
    writeFileSync(join(dir, 'working.ts'), 'working\n')

    const snapshot = await new ReviewService().snapshot(
      dir,
      project(),
      DEFAULT_SETTINGS,
      baseline
    )
    expect(snapshot.commits).toHaveLength(1)
    expect(snapshot.commits[0]).toMatchObject({
      subject: 'AI commit',
      files: [{ path: 'committed.ts', change: 'modified' }]
    })
    expect(snapshot.localChanges).toEqual([
      { path: 'working.ts', change: 'modified', previousPath: undefined }
    ])
    expect(snapshot.changes.map((file) => file.path)).toEqual(['committed.ts', 'working.ts'])
  })

  it('does not put existing changes, commits or PRs on a draft that has no Run yet', async () => {
    initGit()
    writeFileSync(join(dir, 'existing.ts'), 'committed\n')
    runGit('add', '-A')
    runGit('commit', '-qm', 'existing commit')
    writeFileSync(join(dir, 'existing.ts'), 'dirty\n')

    const snapshot = await new ReviewService().snapshot(
      dir,
      project(),
      DEFAULT_SETTINGS,
      null
    )
    expect(snapshot.changes).toEqual([])
    expect(snapshot.localChanges).toEqual([])
    expect(snapshot.stagedChanges).toEqual([])
    expect(snapshot.commits).toEqual([])
    expect(snapshot.pullRequests).toEqual([])
    expect(snapshot.revision).toBeNull()
  })

  it.each([false, true])('separates partial staging and new files without changing the index, and retains both diffs after later commits (%s)', async (splitIndex) => {
    initGit()
    writeFileSync(join(dir, 'result.ts'), 'before\n')
    writeFileSync(join(dir, 'human.ts'), 'human before\n')
    runGit('add', '-A')
    runGit('commit', '-qm', 'before task')
    writeFileSync(join(dir, 'human.ts'), 'already staged\n')
    runGit('add', 'human.ts')
    writeFileSync(join(dir, 'human.ts'), 'already unstaged\n')
    const baseline = await captureReviewBaseline(dir, 'partial', new Date().toISOString())
    writeFileSync(join(dir, 'result.ts'), 'staged\n')
    writeFileSync(join(dir, 'staged-only.ts'), 'staged file\n')
    runGit('add', 'result.ts', 'staged-only.ts')
    writeFileSync(join(dir, 'result.ts'), 'local\n')
    writeFileSync(join(dir, 'new.ts'), 'untracked\n')
    writeFileSync(join(dir, 'intent.ts'), 'intent to add\n')
    runGit('add', '-N', 'intent.ts')
    if (splitIndex) runGit('update-index', '--split-index')
    const indexBefore = readFileSync(join(dir, '.git/index'))

    const service = new ReviewService()
    const snapshot = await service.snapshot(dir, project(), DEFAULT_SETTINGS, baseline)
    expect(snapshot.localChanges.map(file => file.path)).toEqual(['intent.ts', 'new.ts', 'result.ts'])
    expect(snapshot.stagedChanges.map(file => file.path)).toEqual(['result.ts', 'staged-only.ts'])
    expect(readFileSync(join(dir, '.git/index'))).toEqual(indexBefore)
    if (!snapshot.localRevision || !snapshot.stagedRevision) throw new Error('missing split revisions')
    await service.retain('partial', snapshot)
    runGit('add', '-A')
    runGit('commit', '-qm', 'later')
    runGit('gc', '--prune=now')

    const local = await service.file(dir, project(), DEFAULT_SETTINGS, {
      source: 'task', path: 'result.ts', revision: snapshot.localRevision
    })
    const staged = await service.file(dir, project(), DEFAULT_SETTINGS, {
      source: 'task', path: 'result.ts', revision: snapshot.stagedRevision
    })
    expect(local.content).toBe('local\n')
    expect(local.diff.filter(line => line.kind === 'deleted').map(line => line.text)).toEqual(['staged'])
    expect(staged.content).toBe('staged\n')
    expect(staged.diff.filter(line => line.kind === 'deleted').map(line => line.text)).toEqual(['before'])
  })

  it('keeps staged work visible when unstaged edits cancel it out in the total task diff', async () => {
    initGit()
    writeFileSync(join(dir, 'result.ts'), 'before\n')
    runGit('add', '-A')
    runGit('commit', '-qm', 'before task')
    const baseline = await captureReviewBaseline(dir, 'cancel-out', new Date().toISOString())
    writeFileSync(join(dir, 'result.ts'), 'staged\n')
    runGit('add', 'result.ts')
    writeFileSync(join(dir, 'result.ts'), 'before\n')
    const snapshot = await new ReviewService().snapshot(dir, project(), DEFAULT_SETTINGS, baseline)
    expect(snapshot.changes).toEqual([])
    expect(snapshot.stagedChanges).toMatchObject([{ path: 'result.ts', change: 'modified' }])
    expect(snapshot.localChanges).toMatchObject([{ path: 'result.ts', change: 'modified' }])
  })

  it('separates staged and local files before the first commit exists', async () => {
    initGit()
    const baseline = await captureReviewBaseline(dir, 'unborn', new Date().toISOString())
    writeFileSync(join(dir, 'staged.ts'), 'staged\n')
    runGit('add', 'staged.ts')
    writeFileSync(join(dir, 'local.ts'), 'local\n')
    const snapshot = await new ReviewService().snapshot(dir, project(), DEFAULT_SETTINGS, baseline)
    expect(snapshot.stagedChanges).toMatchObject([{ path: 'staged.ts', change: 'added' }])
    expect(snapshot.localChanges).toMatchObject([{ path: 'local.ts', change: 'added' }])
    expect(snapshot.commits).toEqual([])
  })

  it('keeps changes committed during the task under review by merging them with the uncommitted diff', () => {
    expect(
      aggregateTaskChanges(
        [
          { path: 'src/working.ts', change: 'modified' },
          { path: 'src/shared.ts', change: 'modified' }
        ],
        [
          {
            sha: 'a'.repeat(40),
            shortSha: 'aaaaaaa',
            subject: '変更',
            author: 'Quuu',
            committedAt: '2026-08-29T00:00:00Z',
            files: [
              { path: 'src/committed.ts', change: 'added' },
              { path: 'src/shared.ts', change: 'added' }
            ]
          }
        ]
      )
    ).toEqual([
      { path: 'src/committed.ts', change: 'added' },
      { path: 'src/shared.ts', change: 'modified' },
      { path: 'src/working.ts', change: 'modified' }
    ])
  })

  it('turns a unified diff into display rows that keep the old and new line numbers', () => {
    expect(
      parseUnifiedDiff('@@ -10,2 +10,3 @@ title\n same\n-old\n+new\n+more\n')
    ).toEqual([
      { kind: 'hunk', oldLine: null, newLine: null, text: 'title' },
      { kind: 'context', oldLine: 10, newLine: 10, text: 'same' },
      { kind: 'deleted', oldLine: 11, newLine: null, text: 'old' },
      { kind: 'added', oldLine: null, newLine: 11, text: 'new' },
      { kind: 'added', oldLine: null, newLine: 12, text: 'more' }
    ])
  })

  it('reads the code structure and the package, composer and Make run definitions from the same working directory', () => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest', build: 'tsc' } })
    )
    writeFileSync(join(dir, 'composer.json'), JSON.stringify({ scripts: { check: 'phpunit' } }))
    writeFileSync(join(dir, 'Makefile'), 'release:\n\t@echo ok\n.internal:\n\t@echo no\n')

    expect(discoverProjectTasks(dir)).toEqual([
      { id: 'package:build', label: 'build', source: 'package', command: "npm run 'build'" },
      { id: 'package:test', label: 'test', source: 'package', command: "npm run 'test'" },
      { id: 'composer:check', label: 'check', source: 'composer', command: "composer run-script 'check'" },
      { id: 'make:release', label: 'release', source: 'make', command: "make 'release'" }
    ])
    expect(
      extractSymbols(
        'work.ts',
        'export interface Item {}\nexport function run() {}\nconst later = () => {}\nif (ready) {}\n'
      )
    ).toEqual([
      { name: 'Item', kind: 'interface', line: 1, depth: 0 },
      { name: 'run', kind: 'function', line: 2, depth: 0 },
      { name: 'later', kind: 'function', line: 3, depth: 0 }
    ])
  })

  it('reads coverage as a per-file ratio plus uncovered lines that can be moved to the code', () => {
    mkdirSync(join(dir, 'coverage'))
    writeFileSync(
      join(dir, 'coverage', 'coverage-summary.json'),
      JSON.stringify({
        total: {
          lines: { covered: 3, total: 5, pct: 60 },
          functions: { covered: 1, total: 2, pct: 50 },
          branches: { covered: 0, total: 0, pct: 100 },
          statements: { covered: 3, total: 5, pct: 60 }
        },
        [join(dir, 'src', 'work.ts')]: {
          lines: { covered: 3, total: 5, pct: 60 },
          functions: { covered: 1, total: 2, pct: 50 },
          branches: { covered: 0, total: 0, pct: 100 },
          statements: { covered: 3, total: 5, pct: 60 }
        }
      })
    )
    writeFileSync(
      join(dir, 'coverage', 'lcov.info'),
      `SF:${join(dir, 'src', 'work.ts')}\nDA:1,1\nDA:2,0\nDA:3,1\nDA:7,0\nDA:8,1\nFNF:2\nFNH:1\nend_of_record\n`
    )

    expect(readCoverage(dir)).toMatchObject({
      source: 'coverage/coverage-summary.json',
      lines: { covered: 3, total: 5, percent: 60 },
      files: [
        {
          path: 'src/work.ts',
          lines: { covered: 3, total: 5, percent: 60 },
          uncoveredLines: [2, 7]
        }
      ]
    })
  })

})


it('reads and retains a session commit after checkout moves HEAD back before it', async () => {
  initGit()
  writeFileSync(join(dir, 'result.txt'), 'before\n')
  runGit('add', '.')
  runGit('commit', '-qm', 'before')
  const before = runGit('rev-parse', 'HEAD').trim()
  const baseline = await captureReviewBaseline(dir, 'checkout-receipt', new Date().toISOString())
  writeFileSync(join(dir, 'result.txt'), 'session result\n')
  runGit('add', '.')
  runGit('commit', '-qm', 'session result')
  const sha = runGit('rev-parse', 'HEAD').trim()
  runGit('checkout', '--detach', '-q', before)
  const service = new ReviewService()
  const snapshot = await service.snapshot(dir, project(), DEFAULT_SETTINGS, baseline, { commits: [sha.slice(0, 7)], pullRequests: [] })
  expect(snapshot.commits.map(commit => commit.sha)).toEqual([sha])
  await service.retain('checkout-receipt', snapshot)
  expect(runGit('rev-parse', `refs/quuu/results/checkout-receipt/commits/${sha}`).trim()).toBe(sha)
  const file = await service.file(dir, project(), DEFAULT_SETTINGS, { source: 'commit', ref: sha, path: 'result.txt' })
  expect(file.content).toBe('session result\n')
})

/*
 * Tasks of one project take turns on the same `main`, pull what the others merged and merge
 * `origin/main` into their branches. Measured on this machine: a task that changed a handful of
 * files was described by 9,116 - a fuzz corpus another task had landed in between - and by 25
 * commits, none of them its own. The checkout's reflog says what was created in it and when.
 */
describe('whose work the checkout holds', () => {
  function upstreamCommit(subject: string, file: string): void {
    const upstream = mkdtempSync(join(tmpdir(), 'taskd-review-upstream-'))
    try {
      execFileSync('/usr/bin/git', ['clone', '-q', dir, upstream])
      writeFileSync(join(upstream, file), `${subject}\n`)
      const other = ['-C', upstream, '-c', 'user.name=Other', '-c', 'user.email=other@example.invalid']
      execFileSync('/usr/bin/git', [...other, 'add', '-A'])
      execFileSync('/usr/bin/git', [...other, 'commit', '-qm', subject])
      runGit('pull', '-q', '--ff-only', upstream, 'HEAD')
    } finally {
      rmSync(upstream, { recursive: true, force: true })
    }
  }

  /** A repository with one commit, and the one run window of a task that starts now and is still going. */
  function startTask(): { windows: Array<{ from: string; to: string | null }> } {
    initGit()
    writeFileSync(join(dir, 'result.ts'), 'before\n')
    runGit('add', '-A')
    runGit('commit', '-qm', 'before task')
    return { windows: [{ from: new Date().toISOString(), to: null }] }
  }

  it("does not count commits that arrived by pull as the task's once its runs are known", async () => {
    const { windows } = startTask()
    const baseline = await captureReviewBaseline(dir, 'shared-main', windows[0].from)
    upstreamCommit('Rebuild the fuzz corpus', 'corpus.sql')
    writeFileSync(join(dir, 'result.ts'), 'after\n')
    runGit('commit', '-qam', 'task work')
    writeFileSync(join(dir, 'notes.md'), 'uncommitted\n')
    const snapshot = await new ReviewService().snapshot(dir, project(), DEFAULT_SETTINGS, baseline, undefined, undefined, { windows, recorded: [] })
    expect(snapshot.commits.map((commit) => commit.subject)).toEqual(['task work'])
    expect(snapshot.changes.map((file) => file.path)).toEqual(['notes.md', 'result.ts'])
    expect(snapshot.localChanges.map((file) => file.path)).toEqual(['notes.md'])
  })

  it('keeps a commit the task made on a branch the checkout has since left, and drops other work the last review had named', async () => {
    const { windows } = startTask()
    const baseline = await captureReviewBaseline(dir, 'moved-on', windows[0].from)
    runGit('checkout', '-qb', 'task/branch')
    writeFileSync(join(dir, 'result.ts'), 'on the branch\n')
    runGit('commit', '-qam', 'task work on a branch')
    const own = runGit('rev-parse', 'HEAD').trim()
    runGit('checkout', '-q', '-')
    upstreamCommit('Somebody else', 'other.ts')
    const foreign = runGit('rev-parse', 'HEAD').trim()
    const snapshot = await new ReviewService().snapshot(dir, project(), DEFAULT_SETTINGS, baseline, undefined, undefined, { windows, recorded: [own, foreign] })
    expect(snapshot.commits.map((commit) => commit.sha)).toEqual([own])
    expect(snapshot.changes).toEqual([{ path: 'result.ts', change: 'modified', previousPath: undefined }])
  })

  it('takes every commit since the start as the task\'s when the checkout was not there to see the task run', async () => {
    startTask()
    const baseline = await captureReviewBaseline(dir, 'long-ago', '2000-01-01T00:00:00.000Z')
    upstreamCommit('Arrived by pull', 'other.ts')
    const windows = [{ from: '2000-01-01T00:00:00.000Z', to: '2000-01-01T01:00:00.000Z' }]
    const snapshot = await new ReviewService().snapshot(dir, project(), DEFAULT_SETTINGS, baseline, undefined, undefined, { windows, recorded: [] })
    expect(snapshot.commits.map((commit) => commit.subject)).toEqual(['Arrived by pull'])
    expect(snapshot.changes.map((file) => file.path)).toEqual(['other.ts'])
  })

  it('does not take the commit the task started from as its own when it landed within the same second', async () => {
    const { windows } = startTask()
    const baseline = await captureReviewBaseline(dir, 'same-second', windows[0].from)
    const snapshot = await new ReviewService().snapshot(dir, project(), DEFAULT_SETTINGS, baseline, undefined, undefined, { windows, recorded: [] })
    expect(snapshot.commits).toEqual([])
    expect(snapshot.changes).toEqual([])
  })
})

/*
 * A merge brings in commits whose dates predate it. "The newest commit before the start" over
 * the whole history then lands on a branch merged later - measured: another task's fuzz branch,
 * five seconds before the first run - and the comparison carries that branch's whole difference.
 */
it('infers the start along the first parents, not from a side branch that was merged later', async () => {
  initGit()
  const at = (date: string): NodeJS.ProcessEnv => ({ ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date })
  const dated = (date: string, ...args: string[]): string =>
    execFileSync('/usr/bin/git', args, { cwd: dir, encoding: 'utf8', env: at(date) }).trim()
  writeFileSync(join(dir, 'main.ts'), 'main\n')
  runGit('add', '-A')
  dated('2030-01-01T00:00:00Z', 'commit', '-qm', 'main before the task')
  const mainBefore = runGit('rev-parse', 'HEAD').trim()
  runGit('checkout', '-qb', 'side')
  writeFileSync(join(dir, 'side.ts'), 'side\n')
  runGit('add', '-A')
  dated('2030-01-03T00:00:00Z', 'commit', '-qm', 'side work, dated before the task start')
  runGit('checkout', '-q', '-')
  dated('2030-01-04T00:00:00Z', 'merge', '-q', '--no-ff', '-m', 'merge side', 'side')
  const baseline = await inferReviewBaseline(dir, '2030-01-03T12:00:00Z')
  expect(baseline.baseHead).toBe(mainBefore)
})
