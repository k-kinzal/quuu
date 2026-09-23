import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { settleReport } from '../src/main/report/generator.js'
import { ReportOperations, alreadyReported } from '../src/main/report/operations.js'
import type { StoredReport } from '../src/main/report/types.js'
import type { Project } from '../src/main/projects/types.js'
import { REPORT_ASSETS, REPORT_STYLE_FILE, writeReportAssets } from '../src/main/report/assets.js'
import { reportPrompt } from '../src/main/report/prompt.js'
import { captureReviewBaseline, snapshotWorktree } from '../src/main/review/git.js'
import type { ReviewSnapshot } from '../src/main/review/types.js'
import type { Run } from '../src/main/execution/types.js'
import type { AppSettings } from '../src/main/settings/types.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { isoPlusSeconds } from '../src/main/util.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

/** A shell "agent" that writes the page the instructions named, signed so its writer is readable. */
function writesAPage(signature: string): string[] {
  return [
    '-c',
    `printf '<html>${signature}</html>' > "$(printf '%s' "$1" | sed -n 's/^Write the page to: //p')"`,
    'quuu',
    '{{prompt}}'
  ]
}
const WRITES_A_PAGE = writesAPage('report')
/** Writes the instructions themselves to the page, so what the writer was told can be read back. */
const WRITES_THE_PROMPT = [
  '-c',
  `printf '%s' "$1" > "$(printf '%s' "$1" | sed -n 's/^Write the page to: //p')"`,
  'quuu',
  '{{prompt}}'
]
/**
 * These launch a real process, and the first one also resolves the login PATH (a login shell,
 * which is allowed five seconds of its own).
 */
const LAUNCHES = 30_000

/** One that ends cleanly and writes nothing. */
const WRITES_NOTHING = ['-c', 'exit 0', 'quuu', '{{prompt}}']

function addRun(taskId: string, over: Partial<Run> = {}): Run {
  const attempt = repo.listRunsByTask(db, taskId).length + 1
  return repo.insertRun(db, {
    id: `${taskId}-${attempt}`, taskId, agentId: settings.reportTargetId,
    resolvedFromGroupId: null, sessionId: `session-${attempt}`, kind: attempt === 1 ? 'initial' : 'followup',
    status: 'succeeded', attempt, fallbackFromRunId: null, pid: null, cwd: work,
    command: '/bin/sh', args: [], promptPreview: '', exitCode: 0, errorKind: null,
    errorMessage: '', sessionLogPath: join(data, `session-${attempt}.jsonl`),
    stdoutLogPath: join(data, `run-${attempt}.log`), ...over
  })
}

function cachedReview(over: Partial<ReviewSnapshot> = {}): ReviewSnapshot {
  return {
    cwd: work, branch: 'main', repository: null, tree: [], changes: [], localChanges: [],
    stagedChanges: [], revision: null, localRevision: null, stagedRevision: null,
    commits: [], pullRequests: [], coverage: null, projectTasks: [], ...over
  }
}

let db: Db
let data: string
let work: string
let settings: AppSettings
let ops: ReportOperations
let projectId: string
let previousUserData: string | undefined

function place(taskId: string): { dir: string; project: Project } {
  const task = repo.getTask(db, taskId)!
  return { dir: work, project: repo.getProject(db, task.projectId)! }
}

/** Make the working directory a repository, so a report gets a revision to be compared by. */
function initGit(): void {
  const git = (...args: string[]): string => execFileSync('/usr/bin/git', args, { cwd: work, encoding: 'utf8' })
  git('init', '-q')
  git('config', 'user.name', 'Quuu Test')
  git('config', 'user.email', 'quuu@example.invalid')
  writeFileSync(join(work, 'queue.ts'), 'export const queue = 1\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'Start')
}

function stored(over: Partial<StoredReport> = {}): StoredReport {
  return {
    taskId: 'task-1',
    status: 'ready',
    revision: 'a'.repeat(40),
    path: '/tmp/reports/task-1/rpt.html',
    logPath: '/tmp/reports/task-1/rpt.log',
    error: '',
    startedAt: '2026-09-14T00:00:00.000Z',
    endedAt: '2026-09-14T00:01:00.000Z',
    cwd: '/tmp/work',
    pid: null,
    pending: '',
    exitPath: '',
    ...over
  }
}

async function settled(taskId: string): Promise<ReturnType<ReportOperations['report']>> {
  for (let attempt = 0; attempt < 200; attempt++) {
    ops.settle()
    const report = ops.report(taskId)
    if (report && report.status !== 'generating') return report
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return ops.report(taskId)
}

beforeEach(() => {
  db = memoryDb()
  data = mkdtempSync(join(tmpdir(), 'quuu-report-data-'))
  work = mkdtempSync(join(tmpdir(), 'quuu-report-work-'))
  previousUserData = process.env.QUUU_USER_DATA
  process.env.QUUU_USER_DATA = data
  const agentId = makeAgent(db, { name: 'Reporter', command: '/bin/sh', argsTemplate: WRITES_A_PAGE })
  const runner = makeAgent(db, { name: 'Runner' })
  projectId = makeProject(db, { name: 'Quuu', targetId: runner, path: work })
  settings = { ...DEFAULT_SETTINGS, reportEnabled: true, reportTargetKind: 'agent', reportTargetId: agentId }
  ops = new ReportOperations(db, () => settings, place)
})

afterEach(() => {
  ops.stop()
  if (previousUserData === undefined) delete process.env.QUUU_USER_DATA
  else process.env.QUUU_USER_DATA = previousUserData
  rmSync(data, { recursive: true, force: true })
  rmSync(work, { recursive: true, force: true })
})

describe('what stops a report from being written', () => {
  it('says so instead of starting when reports are turned off', async () => {
    settings = { ...settings, reportEnabled: false }
    const result = await ops.generate(makeTask(db, projectId, 'Rename the queue'))
    expect(result.ok).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('says so instead of starting when nobody is set to write one', async () => {
    settings = { ...settings, reportTargetId: '' }
    const result = await ops.generate(makeTask(db, projectId, 'Rename the queue'))
    expect(result.ok).toBe(false)
  })

  it('does not use an agent whose definition is disabled', async () => {
    const disabled = makeAgent(db, { name: 'Resting', command: '/bin/sh', enabled: false })
    settings = { ...settings, reportTargetId: disabled }
    const result = await ops.generate(makeTask(db, projectId, 'Rename the queue'))
    expect(result.ok).toBe(false)
  })

  it('leaves a project that opted out alone even while the feature is on', async () => {
    repo.updateProject(db, projectId, { reportEnabled: false })
    const result = await ops.generate(makeTask(db, projectId, 'Rename the queue'))
    expect(result.ok).toBe(false)
    expect(ops.report(makeTask(db, projectId, 'Another'))).toBeNull()
  })
})

/**
 * Who writes it.
 *
 * A single name and a group answer two different questions. A name says *that one*; a group says
 * **whoever can take it**, which is the reason the choice exists at all — the agents doing the
 * work are busy, and the report is the job to hand to whichever one is free.
 */
describe('who writes it', () => {
  /** Members that sign their pages, so the one that took the job can be read off the result. */
  function group(strategy: 'priority' | 'round-robin' | 'least-busy'): { id: string; first: string; second: string } {
    const first = makeAgent(db, { name: 'First', command: '/bin/sh', argsTemplate: writesAPage('first') })
    const second = makeAgent(db, { name: 'Second', command: '/bin/sh', argsTemplate: writesAPage('second') })
    const id = repo.insertGroup(db, {
      name: 'Writers',
      description: '',
      strategy,
      memberIds: [first, second],
      sortOrder: 0
    }).id
    settings = { ...settings, reportTargetKind: 'group', reportTargetId: id }
    return { id, first, second }
  }

  async function wroteBy(taskId: string): Promise<string> {
    const report = await settled(taskId)
    expect(report?.status).toBe('ready')
    return readFileSync(report!.path, 'utf8')
  }

  it('hands it to the member the strategy puts first', async () => {
    group('priority')
    const taskId = makeTask(db, projectId, 'Rename the queue')
    expect((await ops.generate(taskId)).ok).toBe(true)
    expect(await wroteBy(taskId)).toContain('first')
  }, LAUNCHES)

  it('passes over a member that is waiting out a limit', async () => {
    const writers = group('priority')
    repo.setCooldown(db, writers.first, isoPlusSeconds(600), 'Limit')
    const taskId = makeTask(db, projectId, 'Rename the queue')
    expect((await ops.generate(taskId)).ok).toBe(true)
    expect(await wroteBy(taskId)).toContain('second')
  }, LAUNCHES)

  it('leaves out a member whose definition is disabled', async () => {
    const writers = group('priority')
    repo.updateAgent(db, writers.first, { enabled: false })
    const taskId = makeTask(db, projectId, 'Rename the queue')
    expect((await ops.generate(taskId)).ok).toBe(true)
    expect(await wroteBy(taskId)).toContain('second')
  }, LAUNCHES)

  it('says so instead of starting when every member is waiting out a limit', async () => {
    const writers = group('priority')
    repo.setCooldown(db, writers.first, isoPlusSeconds(600), 'Limit')
    repo.setCooldown(db, writers.second, isoPlusSeconds(600), 'Limit')
    const result = await ops.generate(makeTask(db, projectId, 'Rename the queue'))
    expect(result.ok).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('says so instead of starting when the group has nobody left to write', async () => {
    const writers = group('priority')
    repo.updateAgent(db, writers.first, { enabled: false })
    repo.updateAgent(db, writers.second, { enabled: false })
    expect((await ops.generate(makeTask(db, projectId, 'Rename the queue'))).ok).toBe(false)
  })

  // A report is a launch on the group, so it moves the same rotation a task's run does
  it('moves a round-robin group on, so the next launch is somebody else', async () => {
    const writers = group('round-robin')
    const taskId = makeTask(db, projectId, 'Rename the queue')
    await ops.generate(taskId)
    expect(await wroteBy(taskId)).toContain('first')
    expect(repo.groupRotation(db, writers.id)).toBe(writers.first)

    await ops.generate(taskId)
    expect(await wroteBy(taskId)).toContain('second')
  }, LAUNCHES)
})

describe('how a generation ends', () => {
  it('keeps waiting while the generator is still running', () => {
    expect(settleReport({ alive: true, exitCode: null, pageExists: false, timedOut: false })).toBeNull()
  })

  it('keeps a page that was written even when the generator exited non-zero', () => {
    const result = settleReport({ alive: false, exitCode: 1, pageExists: true, timedOut: false })
    expect(result).toMatchObject({ status: 'ready', reason: 'exit' })
  })

  it('fails when the generator ended without writing a page', () => {
    const result = settleReport({ alive: false, exitCode: 0, pageExists: false, timedOut: false })
    expect(result).toMatchObject({ status: 'failed', reason: 'no-page' })
  })

  it('fails a generation that ran past its bound even while it still looks alive', () => {
    const result = settleReport({ alive: true, exitCode: null, pageExists: false, timedOut: true })
    expect(result).toMatchObject({ status: 'failed', reason: 'timeout' })
  })
})

describe('writing one', () => {
  async function generatedPrompt(taskId: string): Promise<string> {
    repo.updateAgent(db, settings.reportTargetId, { argsTemplate: WRITES_THE_PROMPT })
    expect((await ops.generate(taskId)).ok).toBe(true)
    const report = await settled(taskId)
    expect(report?.status).toBe('ready')
    return readFileSync(report!.path, 'utf8')
  }

  it('includes the original request and every run across follow-ups and agent fallbacks', async () => {
    const taskId = makeTask(db, projectId, 'Rename the queue')
    repo.patchTask(db, taskId, { prompt: 'Rename the queue and preserve existing entries.' })
    const first = addRun(taskId, { status: 'limited', promptPreview: 'Original attempt' })
    const second = addRun(taskId, { kind: 'initial', fallbackFromRunId: first.id, promptPreview: 'Fallback attempt' })
    const third = addRun(taskId, { sessionLogPath: second.sessionLogPath, sessionId: second.sessionId, promptPreview: 'Also update the help' })
    const last = addRun(taskId, { sessionLogPath: null, promptPreview: 'Verify the migration' })
    const prompt = await generatedPrompt(taskId)
    expect(prompt).toContain('Task title: Rename the queue')
    expect(prompt).toContain('Rename the queue and preserve existing entries.')
    for (const run of [first, second, third, last]) {
      expect(prompt).toContain(run.promptPreview)
      expect(prompt).toContain(run.stdoutLogPath)
      if (run.sessionLogPath) expect(prompt).toContain(run.sessionLogPath)
    }
    expect(prompt.indexOf(first.promptPreview)).toBeLessThan(prompt.indexOf(second.promptPreview))
    expect(prompt.indexOf(second.promptPreview)).toBeLessThan(prompt.indexOf(third.promptPreview))
    expect(prompt.indexOf(third.promptPreview)).toBeLessThan(prompt.indexOf(last.promptPreview))
  }, LAUNCHES)

  it('regenerates from the task start through the latest work even when the review cache is stale', async () => {
    initGit()
    const git = (...args: string[]): string => execFileSync('/usr/bin/git', args, { cwd: work, encoding: 'utf8' }).trim()
    const taskId = makeTask(db, projectId, 'Rename the queue')
    const first = addRun(taskId)
    writeFileSync(join(work, 'preexisting.txt'), 'Unrelated work already present\n')
    const baseline = await captureReviewBaseline(work, taskId, first.startedAt)
    repo.insertTaskReviewBase(db, { taskId, cwd: work, ...baseline })
    writeFileSync(join(work, 'queue.ts'), 'export const queue = 2\n')
    git('commit', '-qam', 'Rename the queue')
    const firstCommit = git('rev-parse', 'HEAD')
    const initialPrompt = await generatedPrompt(taskId)
    expect(initialPrompt).toContain('+-queue.ts')
    const previous = ops.report(taskId)!
    repo.saveReviewSnapshot(db, taskId, cachedReview({
      revision: { base: baseline.baseTree!, head: previous.revision },
      changes: [{ path: 'stale-only.ts', change: 'added' }]
    }))

    addRun(taskId)
    writeFileSync(join(work, 'help.ts'), 'export const help = "queue"\n')
    git('add', 'help.ts')
    git('commit', '-qm', 'Explain the renamed queue')
    const finalCommit = git('rev-parse', 'HEAD')
    writeFileSync(join(work, 'uncommitted.ts'), 'export const verified = true\n')
    const finalTree = (await snapshotWorktree(work))!.tree
    const prompt = await generatedPrompt(taskId)
    expect(prompt).toContain(`Task start tree: ${baseline.baseTree}`)
    expect(prompt).toContain(`Report end tree: ${finalTree}`)
    expect(prompt).toContain('+-queue.ts')
    expect(prompt).toContain('+help.ts')
    expect(prompt).toContain('+uncommitted.ts')
    expect(prompt).toContain(`${firstCommit.slice(0, 7)} Rename the queue`)
    expect(prompt).toContain(`${finalCommit.slice(0, 7)} Explain the renamed queue`)
    expect(prompt).not.toContain('preexisting.txt')
    expect(prompt).not.toContain('stale-only.ts')
    expect(prompt).not.toContain(`Task start tree: ${previous.revision}`)
    expect(ops.report(taskId)?.revision).toBe(finalTree)
  }, LAUNCHES)

  it('does not pass review material from a different working directory as this task result', async () => {
    const taskId = makeTask(db, projectId, 'Rename the queue')
    repo.saveReviewSnapshot(db, taskId, cachedReview({
      cwd: '/another/checkout', changes: [{ path: 'foreign.ts', change: 'added' }],
      commits: [{ sha: 'f'.repeat(40), shortSha: 'fffffff', subject: 'Foreign work', author: '', committedAt: '', files: [] }]
    }))
    const prompt = await generatedPrompt(taskId)
    expect(prompt).not.toContain('foreign.ts')
    expect(prompt).not.toContain('Foreign work')
    expect(prompt).toContain('Task-wide Git comparison: unavailable')
  }, LAUNCHES)

  it('infers older tasks from the first run instead of the latest follow-up and identifies the estimate', async () => {
    initGit()
    const git = (...args: string[]): string => execFileSync('/usr/bin/git', args, {
      cwd: work, encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_DATE: '2030-01-02T00:00:00Z', GIT_COMMITTER_DATE: '2030-01-02T00:00:00Z' }
    }).trim()
    const baseTree = git('rev-parse', 'HEAD^{tree}')
    const taskId = makeTask(db, projectId, 'Rename the queue')
    addRun(taskId, { startedAt: '2030-01-01T00:00:00Z' })
    writeFileSync(join(work, 'queue.ts'), 'export const queue = 2\n')
    git('commit', '-qam', 'First attempt')
    addRun(taskId, { startedAt: '2030-01-03T00:00:00Z' })
    writeFileSync(join(work, 'help.ts'), 'export const help = "queue"\n')
    const prompt = await generatedPrompt(taskId)
    expect(prompt).toContain(`Task start tree: ${baseTree}`)
    expect(prompt).toContain('starting tree is inferred')
    expect(prompt).toContain('+-queue.ts')
    expect(prompt).toContain('+help.ts')
    expect(prompt).toContain('First attempt')
  }, LAUNCHES)

  it('does not treat the whole repository history as task work when its start cannot be inferred', async () => {
    initGit()
    const taskId = makeTask(db, projectId, 'Rename the queue')
    addRun(taskId, { startedAt: '2000-01-01T00:00:00Z' })
    const prompt = await generatedPrompt(taskId)
    expect(prompt).toContain('Task-wide Git comparison: unavailable')
    expect(prompt).toContain('Commit log:\n- (none)')
  }, LAUNCHES)

  it('hands the generator a page path it can write to, and shows what it wrote', async () => {
    const taskId = makeTask(db, projectId, 'Rename the queue')
    expect((await ops.generate(taskId)).ok).toBe(true)

    const report = await settled(taskId)
    expect(report?.status).toBe('ready')
    expect(readFileSync(report!.path, 'utf8')).toContain('report')
    // The look is Quuu's. Without the sheet beside it a page opens undressed
    const assets = join(dirname(dirname(report!.path)), REPORT_ASSETS)
    expect(existsSync(join(assets, REPORT_STYLE_FILE))).toBe(true)
  }, LAUNCHES)

  it('reports a generator that wrote nothing as a failure, not as an empty report', async () => {
    const silent = makeAgent(db, { name: 'Silent', command: '/bin/sh', argsTemplate: WRITES_NOTHING })
    settings = { ...settings, reportTargetId: silent }
    const taskId = makeTask(db, projectId, 'Rename the queue')
    expect((await ops.generate(taskId)).ok).toBe(true)

    const report = await settled(taskId)
    expect(report?.status).toBe('failed')
    expect(report?.error).toBeTruthy()
    expect(report?.path).toBe('')
  }, LAUNCHES)

  it('keeps the readable report on screen while the next one is being written', async () => {
    const taskId = makeTask(db, projectId, 'Rename the queue')
    await ops.generate(taskId)
    const first = await settled(taskId)
    expect(first?.status).toBe('ready')

    const slow = makeAgent(db, { name: 'Slow', command: '/bin/sh', argsTemplate: ['-c', 'sleep 30', 'quuu', '{{prompt}}'] })
    settings = { ...settings, reportTargetId: slow }
    await ops.generate(taskId)

    const during = ops.report(taskId)
    expect(during?.status).toBe('generating')
    expect(during?.path).toBe(first?.path)

    const row = repo.getTaskReport(db, taskId)!
    if (row.pid !== null) process.kill(-row.pid, 'SIGKILL')
  }, LAUNCHES)

  /**
   * What the writer is told the work produced has to hold in the repository it is standing in.
   *
   * A receipt is a string a CLI printed: a commit made in another checkout, and the odd
   * `[Run 31947246760]` that looks like one, both survive as far as the prompt. Named there they
   * are either a line the writer cannot look up or a short id that resolves to a different
   * commit - and the page comes back describing somebody else's work.
   */
  it('names only the commits the repository the report is written in actually has', async () => {
    initGit()
    const git = (...args: string[]): string => execFileSync('/usr/bin/git', args, { cwd: work, encoding: 'utf8' })
    writeFileSync(join(work, 'queue.ts'), 'export const queue = 2\n')
    git('commit', '-qam', 'Rename the queue')
    const mine = git('rev-parse', 'HEAD').trim()
    const taskId = makeTask(db, projectId, 'Rename the queue')
    repo.recordReviewEvidence(db, taskId, 'commit', mine)
    repo.recordReviewEvidence(db, taskId, 'commit', 'f'.repeat(40))
    repo.recordReviewEvidence(db, taskId, 'commit', '31947246760')
    const writer = makeAgent(db, { name: 'Prompt', command: '/bin/sh', argsTemplate: WRITES_THE_PROMPT })
    settings = { ...settings, reportTargetId: writer }
    expect((await ops.generate(taskId)).ok).toBe(true)

    const report = await settled(taskId)
    const prompt = readFileSync(report!.path, 'utf8')
    expect(prompt).toContain(`${mine.slice(0, 7)} Rename the queue`)
    expect(prompt).not.toContain('f'.repeat(40))
    expect(prompt).not.toContain('31947246760')
  }, LAUNCHES)

  it('throws away the page it replaced, so a task keeps one report', async () => {
    const taskId = makeTask(db, projectId, 'Rename the queue')
    await ops.generate(taskId)
    const first = await settled(taskId)
    await ops.generate(taskId)
    const second = await settled(taskId)

    expect(second?.status).toBe('ready')
    expect(second?.path).not.toBe(first?.path)
    expect(existsSync(first!.path)).toBe(false)
  }, LAUNCHES)
})

/*
 * What import is told about the agent that wrote a report.
 *
 * The generator runs the same CLI in the same directory as the work itself, so import has to be
 * able to say "that one was ours". The fact is kept apart from the task's report row on purpose:
 * that row holds the report a task has **now** and is replaced every time one is written again,
 * and reading the window off it meant a regenerated report handed the generation before it to
 * import — which filed it as a task nobody asked for, in a project named after the worktree it
 * ran in. That actually happened, 27 times.
 */
describe('what import is told about a generation', () => {
  it('keeps the window of a generation that has since been written over', async () => {
    const taskId = makeTask(db, projectId, 'Rename the queue')
    await ops.generate(taskId)
    const first = await settled(taskId)
    expect(repo.hasOwnReportCovering(db, work, first!.startedAt)).toBe(true)

    await ops.generate(taskId)
    await settled(taskId)

    expect(repo.hasOwnReportCovering(db, work, first!.startedAt)).toBe(true)
  }, LAUNCHES)

  it('keeps it after the task the report described is gone', async () => {
    const taskId = makeTask(db, projectId, 'Rename the queue')
    await ops.generate(taskId)
    const report = await settled(taskId)

    repo.deleteTask(db, taskId)

    expect(repo.hasOwnReportCovering(db, work, report!.startedAt)).toBe(true)
  }, LAUNCHES)

  it('stops covering the directory the moment the generator is done', async () => {
    const taskId = makeTask(db, projectId, 'Rename the queue')
    await ops.generate(taskId)
    const report = await settled(taskId)

    const after = new Date(Date.parse(report!.endedAt!) + 1000).toISOString()
    // Work somebody starts there next is theirs, and import must list it
    expect(repo.hasOwnReportCovering(db, work, after)).toBe(false)
  }, LAUNCHES)
})

describe('whether reaching review again writes one', () => {
  it('counts a worktree as reported only when a page exists for exactly that tree', () => {
    const tree = 'a'.repeat(40)
    expect(alreadyReported(stored({ revision: tree }), tree)).toBe(true)
    expect(alreadyReported(stored({ revision: tree }), 'b'.repeat(40))).toBe(false)
    expect(alreadyReported(stored({ revision: tree, status: 'failed', path: '' }), tree)).toBe(false)
    expect(alreadyReported(null, tree)).toBe(false)
  })

  it('never mistakes a tree Git could not read for an unchanged one', () => {
    expect(alreadyReported(stored({ revision: '' }), '')).toBe(false)
    expect(alreadyReported(stored({ revision: 'a'.repeat(40) }), null)).toBe(false)
    expect(alreadyReported(stored({ revision: 'a'.repeat(40) }), undefined)).toBe(false)
  })

  it('does not write a second report for a worktree the last one already describes', async () => {
    initGit()
    const taskId = makeTask(db, projectId, 'Rename the queue')
    await ops.generate(taskId)
    const first = await settled(taskId)
    expect(first?.status).toBe('ready')
    expect(first?.revision).toMatch(/^[a-f0-9]{40}$/)

    // Sent back and returned without touching a file: the same tree, the same report
    await ops.requestReport(taskId)
    const after = ops.report(taskId)
    expect(after?.status).toBe('ready')
    expect(after?.path).toBe(first?.path)
    expect(after?.startedAt).toBe(first?.startedAt)
  }, LAUNCHES)

  it('writes again on its own once the worktree moved on', async () => {
    initGit()
    const taskId = makeTask(db, projectId, 'Rename the queue')
    await ops.generate(taskId)
    const first = await settled(taskId)

    writeFileSync(join(work, 'queue.ts'), 'export const queue = 2\n')
    await ops.requestReport(taskId)
    const second = await settled(taskId)
    expect(second?.status).toBe('ready')
    expect(second?.path).not.toBe(first?.path)
    expect(second?.revision).not.toBe(first?.revision)
  }, LAUNCHES)

  it('writes again when asked by hand, even for the same worktree', async () => {
    initGit()
    const taskId = makeTask(db, projectId, 'Rename the queue')
    await ops.generate(taskId)
    const first = await settled(taskId)

    expect((await ops.generate(taskId)).ok).toBe(true)
    const second = await settled(taskId)
    expect(second?.status).toBe('ready')
    expect(second?.path).not.toBe(first?.path)
    expect(second?.revision).toBe(first?.revision)
  }, LAUNCHES)

  it('tries again on its own when the last generation for this tree wrote no page', async () => {
    initGit()
    const writer = settings.reportTargetId
    const silent = makeAgent(db, { name: 'Silent', command: '/bin/sh', argsTemplate: WRITES_NOTHING })
    settings = { ...settings, reportTargetId: silent }
    const taskId = makeTask(db, projectId, 'Rename the queue')
    await ops.generate(taskId)
    expect((await settled(taskId))?.status).toBe('failed')

    settings = { ...settings, reportTargetId: writer }
    await ops.requestReport(taskId)
    const report = await settled(taskId)
    expect(report?.status).toBe('ready')
    expect(report?.path).not.toBe('')
  }, LAUNCHES)
})

describe('the shared assets', () => {
  it('restores the pinned CSS without overwriting an older report stylesheet', () => {
    writeReportAssets()
    const assets = join(data, 'reports', REPORT_ASSETS)
    const stylesheet = join(assets, REPORT_STYLE_FILE)
    const bundled = readFileSync(new URL('../src/main/report/vendor/document-design/v1.0.0/document-design.css', import.meta.url))
    expect(readFileSync(stylesheet).equals(bundled)).toBe(true)
    writeFileSync(join(assets, 'report.css'), 'legacy report styles')
    writeFileSync(stylesheet, 'damaged')
    writeReportAssets()
    expect(readFileSync(stylesheet).equals(bundled)).toBe(true)
    expect(readFileSync(join(assets, 'report.css'), 'utf8')).toBe('legacy report styles')
  })

  it('survive the sweep that clears reports of deleted tasks', async () => {
    const taskId = makeTask(db, projectId, 'Rename the queue')
    await ops.generate(taskId)
    await settled(taskId)
    const assets = join(data, 'reports', REPORT_ASSETS)
    expect(existsSync(join(assets, REPORT_STYLE_FILE))).toBe(true)

    // A start is where the sweep runs. The assets belong to no task and must not read as an orphan
    repo.deleteTask(db, taskId)
    ops.start()
    expect(existsSync(join(assets, REPORT_STYLE_FILE))).toBe(true)
    expect(existsSync(join(data, 'reports', taskId))).toBe(false)
  }, LAUNCHES)
})

describe('what the generator is told', () => {
  function prompt(over: Partial<Parameters<typeof reportPrompt>[0]> = {}): string {
    return reportPrompt({
      cwd: '/Users/me/Projects/taskd',
      title: 'Rename the queue',
      prompt: 'Rename the queue and preserve existing entries.',
      revision: { base: 'a'.repeat(40), head: 'b'.repeat(40), inferred: false },
      changes: [{ path: 'src/queue.ts', mark: '+-' }, { path: 'src/inbox.ts', mark: '+' }],
      commits: ['1f4c9ab Rename the queue'],
      pullRequests: ['https://github.com/me/taskd/pull/12'],
      runs: [{
        id: 'run-1', kind: 'initial', status: 'succeeded', cwd: '/Users/me/Projects/taskd',
        startedAt: '2026-09-21T00:00:00.000Z', endedAt: '2026-09-21T01:00:00.000Z',
        promptPreview: 'Rename the queue', sessionId: 'abc',
        sessionLogPath: '/Users/me/.claude/projects/taskd/abc.jsonl', stdoutLogPath: '/tmp/run-1.log'
      }],
      page: '/tmp/report.html',
      instructions: '',
      ...over
    })
  }

  it('asks for an infographic, and says what one is', () => {
    const text = prompt()
    expect(text).toContain('Please create an infographic of the changed intent in HTML.')
    // The word alone was being read as "a report, illustrated"
    expect(text).toContain('visual representation of information')
    expect(text).toContain('Keep text usage to a minimum')
  })

  it('hands over what the work touched, so the writer starts from facts rather than a search', () => {
    const text = prompt()
    expect(text).toContain('Working directory: /Users/me/Projects/taskd')
    expect(text).toContain('- +-src/queue.ts')
    expect(text).toContain('- +src/inbox.ts')
    expect(text).toContain('- 1f4c9ab Rename the queue')
    expect(text).toContain('- https://github.com/me/taskd/pull/12')
    expect(text).toContain('"sessionLogPath": "/Users/me/.claude/projects/taskd/abc.jsonl"')
    expect(text).toContain('Write the page to: /tmp/report.html')
  })

  it('says so rather than leaving a heading with nothing under it', () => {
    const text = prompt({ changes: [], commits: [], pullRequests: [], runs: [], revision: null })
    expect(text).toContain('Run history (oldest first; JSON):\n[]')
    expect(text).toContain('Task-wide Git comparison: unavailable')
    expect(text).toMatch(/Commit log:\n- \(none\)/)
  })

  it('defines the whole task as the scope and uses its start and end trees for comparison', () => {
    const text = prompt()
    expect(text).toContain('Scope: the entire task')
    expect(text).toContain('Never limit it to changes since the previous report')
    expect(text).toContain('Read every distinct session listed below from the beginning')
    expect(text).toContain('only excerpts, not complete instructions')
    expect(text).toContain(`git diff ${'a'.repeat(40)} ${'b'.repeat(40)} --`)
  })

  it('hands over the sheet, the components and the shape of the page', () => {
    const text = prompt()
    expect(text).toContain(REPORT_STYLE_FILE)
    expect(text).toContain('Components the stylesheet draws')
    expect(text).toContain('Structure:')
    expect(text).toContain('document-design (doc-ui) v1.0.0, bundled locally')
    expect(text).toContain('<article class="sheet">')
    expect(text).toContain('href="../assets/document-design-v1.0.0.css"')
  })

  it('says the page is static, so nothing is written against a CDN or a script', () => {
    const text = prompt()
    expect(text).toContain('cannot reach the network')
    expect(text).toContain('does not run script')
  })

  it('gives the shape as a skeleton, with nothing written in it', () => {
    const text = prompt()
    /*
     * The design is Quuu's; what goes in it is the writer's. A skeleton carrying real headings
     * would be a taxonomy again — every version that named the sections got them filled in and
     * little else.
     */
    expect(text).toContain('<h1>...</h1>')
    expect(text).toContain('<div class="label"><h2 id="section-1">01 / ...</h2></div>')
    // No upper bound: a change with more to say must not be told to stop
    expect(text).toMatch(/As many sections as the change needs/)
    expect(text).not.toMatch(/Two to four/)
  })
})
