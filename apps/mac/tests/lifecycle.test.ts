import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

let workdir: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'taskd-test-'))
  process.env.QUUU_USER_DATA = workdir
})

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

/** Wait for a Run to end. */
function waitFinished(scheduler: Scheduler, runner: Runner): Promise<void> {
  return new Promise((resolve) => {
    runner.once('finished', () => setTimeout(resolve, 30))
    void scheduler.tick()
  })
}

describe('the task lifecycle', () => {
  it('stops the task at review rather than done even when the agent exits normally', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const scheduler = new Scheduler(db, runner)

    const agent = makeAgent(db, {
      name: 'echo',
      command: '/bin/echo',
      argsTemplate: ['{{prompt}}']
    })
    const project = makeProject(db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(db, project, 'hello')

    await waitFinished(scheduler, runner)

    const after = repo.getTask(db, task)!
    expect(after.status).toBe('review')
    expect(after.doneAt).toBeNull()

    const runs = repo.listRunsByTask(db, task)
    expect(runs).toHaveLength(1)
    expect(runs[0].status).toBe('succeeded')
    expect(runs[0].exitCode).toBe(0)

    // Standard output lands in the run log
    const log = readFileSync(runs[0].stdoutLogPath, 'utf8')
    expect(log).toContain('hello')
  })

  it('reaches done only through a human action', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const project = makeProject(db, { name: 'p', targetId: agent })
    const task = makeTask(db, project, 't')

    repo.setTaskStatus(db, task, 'review')
    expect(repo.getTask(db, task)?.status).toBe('review')

    repo.setTaskStatus(db, task, 'done')
    const done = repo.getTask(db, task)!
    expect(done.status).toBe('done')
    expect(done.doneAt).not.toBeNull()
  })

  it('sends the title when the prompt is empty', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const scheduler = new Scheduler(db, runner)

    const agent = makeAgent(db, {
      name: 'echo',
      command: '/bin/echo',
      argsTemplate: ['{{prompt}}']
    })
    const project = makeProject(db, { name: 'p', targetId: agent, path: workdir })
    const task = repo.insertTask(db, {
      projectId: project,
      title: 'タイトルだけ',
      prompt: '',
      status: 'queued'
    }).id

    await waitFinished(scheduler, runner)
    expect(repo.listRunsByTask(db, task)[0].args).toEqual(['タイトルだけ'])
  })
})

describe('failures and fallback', () => {
  it('puts it into cooldown and re-queues it on detecting a Limit', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const scheduler = new Scheduler(db, runner)

    const backup = makeAgent(db, { name: 'backup', command: '/bin/echo', argsTemplate: ['ok'] })
    const primary = makeAgent(db, {
      name: 'primary',
      command: '/bin/sh',
      argsTemplate: ['-c', 'echo "Claude usage limit reached" >&2; exit 1'],
      fallbackAgentId: backup,
      cooldownSeconds: 600
    })
    const project = makeProject(db, { name: 'p', targetId: primary, path: workdir })
    const task = makeTask(db, project, 't')

    await waitFinished(scheduler, runner)

    const runs = repo.listRunsByTask(db, task)
    expect(runs[0].status).toBe('limited')
    expect(runs[0].errorKind).toBe('limit')
    expect(repo.isCoolingDown(db, primary)).toBe(true)
    // It is re-queued automatically without going to a human
    expect(repo.getTask(db, task)?.status).toBe('queued')

    // The fallback is chosen on the next tick
    await waitFinished(scheduler, runner)
    const after = repo.listRunsByTask(db, task)
    expect(after[0].agentId).toBe(backup)
    expect(after[0].fallbackFromRunId).toBe(runs[0].id)
    expect(repo.getTask(db, task)?.status).toBe('review')
  })

  it('marks an error with no fallback as failed and hands it to a human', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const scheduler = new Scheduler(db, runner)

    const agent = makeAgent(db, {
      name: 'broken',
      command: '/bin/sh',
      argsTemplate: ['-c', 'echo boom >&2; exit 3']
    })
    const project = makeProject(db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(db, project, 't')

    await waitFinished(scheduler, runner)

    expect(repo.getTask(db, task)?.status).toBe('failed')
    const run = repo.listRunsByTask(db, task)[0]
    expect(run.status).toBe('failed')
    expect(run.exitCode).toBe(3)
  })

  it('settles once the main process ends, even with a resident grandchild left behind', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const scheduler = new Scheduler(db, runner)

    // Exit leaving behind a grandchild that keeps holding standard output.
    // 'close' never arrives, so without settling on 'exit' it would stay running forever.
    const agent = makeAgent(db, {
      name: 'leaky',
      command: '/bin/sh',
      argsTemplate: ['-c', 'sleep 30 & echo done; exit 0']
    })
    const project = makeProject(db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(db, project, 't')

    await waitFinished(scheduler, runner)

    const run = repo.listRunsByTask(db, task)[0]
    expect(run.status).toBe('succeeded')
    expect(run.exitCode).toBe(0)
    expect(runner.isLive(run.id)).toBe(false)
    expect(repo.getTask(db, task)?.status).toBe('review')
  }, 10_000)

  it('records a command that does not exist as a launch failure', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const scheduler = new Scheduler(db, runner)

    const agent = makeAgent(db, { name: 'missing', command: 'quuu-no-such-command-xyz' })
    const project = makeProject(db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(db, project, 't')

    await waitFinished(scheduler, runner)

    expect(repo.getTask(db, task)?.status).toBe('failed')
    expect(repo.listRunsByTask(db, task)[0].status).toBe('failed')
  })

  it('fails before launch when the project directory is missing', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const scheduler = new Scheduler(db, runner)

    const agent = makeAgent(db, { name: 'echo', command: '/bin/echo' })
    const project = makeProject(db, {
      name: 'p',
      targetId: agent,
      path: join(workdir, 'does-not-exist')
    })
    const task = makeTask(db, project, 't')

    await waitFinished(scheduler, runner)

    const run = repo.listRunsByTask(db, task)[0]
    expect(run.errorKind).toBe('spawn')
    expect(run.errorMessage).toContain('does not exist')
  })
})

describe('continuation', () => {
  it('continues the same session through the resume template when there is a follow-up', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const scheduler = new Scheduler(db, runner)

    const agent = makeAgent(db, {
      name: 'echo',
      command: '/bin/echo',
      argsTemplate: ['initial', '{{sessionId}}'],
      resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '{{prompt}}']
    })
    const project = makeProject(db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(db, project, 't')

    await waitFinished(scheduler, runner)
    const first = repo.listRunsByTask(db, task)[0]
    expect(first.kind).toBe('initial')

    // Sent back (a follow-up plus a re-queue)
    repo.setPendingMessage(db, task, 'ここを直して')
    repo.setTaskStatus(db, task, 'queued')

    await waitFinished(scheduler, runner)
    const second = repo.listRunsByTask(db, task)[0]

    expect(second.kind).toBe('followup')
    expect(second.sessionId).toBe(first.sessionId)
    expect(second.args).toEqual(['--resume', first.sessionId, '-p', 'ここを直して'])
    // The follow-up is cleared once it completes
    expect(repo.getTask(db, task)?.pendingMessage).toBe('')
  })

  it('cuts a fresh session for every first run', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const scheduler = new Scheduler(db, runner)

    const agent = makeAgent(db, { name: 'echo', command: '/bin/echo', argsTemplate: ['x'] })
    const project = makeProject(db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(db, project, 't')

    await waitFinished(scheduler, runner)
    const first = repo.listRunsByTask(db, task)[0].sessionId

    repo.setTaskStatus(db, task, 'queued')
    await waitFinished(scheduler, runner)
    const second = repo.listRunsByTask(db, task)[0].sessionId

    expect(second).not.toBe(first)
  })
})

describe('startup reconciliation', () => {
  it('settles a running Run whose process is gone', () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const scheduler = new Scheduler(db, runner)

    const agent = makeAgent(db, { name: 'a' })
    const project = makeProject(db, { name: 'p', targetId: agent })
    const task = makeTask(db, project, 't')

    repo.insertRun(db, {
      id: 'run_ghost',
      taskId: task,
      agentId: agent,
      resolvedFromGroupId: null,
      sessionId: 'ghost',
      kind: 'initial',
      status: 'running',
      attempt: 1,
      fallbackFromRunId: null,
      pid: 999999, // a PID that does not exist
      cwd: workdir,
      command: 'echo',
      args: [],
      promptPreview: '',
      exitCode: null,
      errorKind: null,
      errorMessage: '',
      sessionLogPath: null,
      stdoutLogPath: join(workdir, 'ghost.log')
    })
    repo.setTaskStatus(db, task, 'running', { currentRunId: 'run_ghost' })

    scheduler.reconcile()

    expect(repo.getRun(db, 'run_ghost')?.errorKind).toBe('orphaned')
    expect(repo.getTask(db, task)?.status).toBe('failed')
    // The execution slot has been released
    expect(repo.countActiveRuns(db)).toBe(0)
  })
})
