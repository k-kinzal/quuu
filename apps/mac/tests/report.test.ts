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
import { REPORT_ASSETS, REPORT_STYLE_FILE } from '../src/main/report/assets.js'
import { reportPrompt } from '../src/main/report/prompt.js'
import type { AppSettings } from '../src/main/settings/types.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

/** A shell "agent" that writes the page the instructions named. */
const WRITES_A_PAGE = [
  '-c',
  `printf '<html>report</html>' > "$(printf '%s' "$1" | sed -n 's/^Write the page to: //p')"`,
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
  settings = { ...DEFAULT_SETTINGS, reportEnabled: true, reportAgentId: agentId }
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
    settings = { ...settings, reportAgentId: '' }
    const result = await ops.generate(makeTask(db, projectId, 'Rename the queue'))
    expect(result.ok).toBe(false)
  })

  it('does not use an agent whose definition is disabled', async () => {
    const disabled = makeAgent(db, { name: 'Resting', command: '/bin/sh', enabled: false })
    settings = { ...settings, reportAgentId: disabled }
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
    settings = { ...settings, reportAgentId: silent }
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
    settings = { ...settings, reportAgentId: slow }
    await ops.generate(taskId)

    const during = ops.report(taskId)
    expect(during?.status).toBe('generating')
    expect(during?.path).toBe(first?.path)

    const row = repo.getTaskReport(db, taskId)!
    if (row.pid !== null) process.kill(-row.pid, 'SIGKILL')
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
    const writer = settings.reportAgentId
    const silent = makeAgent(db, { name: 'Silent', command: '/bin/sh', argsTemplate: WRITES_NOTHING })
    settings = { ...settings, reportAgentId: silent }
    const taskId = makeTask(db, projectId, 'Rename the queue')
    await ops.generate(taskId)
    expect((await settled(taskId))?.status).toBe('failed')

    settings = { ...settings, reportAgentId: writer }
    await ops.requestReport(taskId)
    const report = await settled(taskId)
    expect(report?.status).toBe('ready')
    expect(report?.path).not.toBe('')
  }, LAUNCHES)
})

describe('the shared assets', () => {
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
      changes: [{ path: 'src/queue.ts', mark: '+-' }, { path: 'src/inbox.ts', mark: '+' }],
      commits: ['1f4c9ab Rename the queue'],
      pullRequests: ['https://github.com/me/taskd/pull/12'],
      sessionLog: '/Users/me/.claude/projects/taskd/abc.jsonl',
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
    expect(text).toContain('Session file: /Users/me/.claude/projects/taskd/abc.jsonl')
    expect(text).toContain('Write the page to: /tmp/report.html')
  })

  it('says so rather than leaving a heading with nothing under it', () => {
    const text = prompt({ changes: [], commits: [], pullRequests: [], sessionLog: '' })
    expect(text).toContain('Session file: (none)')
    expect(text).toMatch(/Commit log:\n- \(none\)/)
  })

  /*
   * Nothing is offered, on purpose.
   *
   * What a writer reaches for unprompted is the only way to tell a page held back by what it was
   * given from a page at the limit of what the writer can do. The assets stay on disk; they are
   * simply not pointed at.
   */
  it('hands over the sheet, the components and the shape of the page', () => {
    const text = prompt()
    expect(text).toContain(REPORT_STYLE_FILE)
    expect(text).toContain('Components the stylesheet draws')
    expect(text).toContain('Structure:')
    expect(text).toContain('<div class="page">')
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
    expect(text).toContain('<div class="label">01<br>...</div>')
    // No upper bound: a change with more to say must not be told to stop
    expect(text).toMatch(/As many sections as the change needs/)
    expect(text).not.toMatch(/Two to four/)
  })
})
