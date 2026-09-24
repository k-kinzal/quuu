import { inTransaction } from '../src/main/db/database.js'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { runExitPath } from '../src/main/appPaths.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { isProcessAlive, killProcessGroup } from '../src/main/platform/runProcess.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

/**
 * Quuu gets rebuilt and restarted over and over. If the agents stopped every time,
 * "queue it and forget it" would break, so this guarantees they survive a restart.
 */

let workdir: string
const spawned: number[] = []

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'taskd-restart-'))
  process.env.QUUU_USER_DATA = workdir
})

afterEach(() => {
  for (const pid of spawned.splice(0)) killProcessGroup(pid, 'SIGKILL')
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Wait until the condition holds. Returns false if it never does. */
async function until(fn: () => boolean, timeoutMs = 8000): Promise<boolean> {
  const limit = Date.now() + timeoutMs
  while (Date.now() < limit) {
    if (fn()) return true
    await sleep(50)
  }
  return fn()
}

/** Create one running Run and return its pid. */
async function startRun(
  db: ReturnType<typeof memoryDb>,
  runner: Runner,
  argsTemplate: string[],
  overrides: { timeoutSeconds?: number; limitPatterns?: string[] } = {}
): Promise<{ runId: string; pid: number; taskId: string }> {
  const agentId = makeAgent(db, {
    name: 'a',
    command: '/bin/sh',
    argsTemplate,
    timeoutSeconds: overrides.timeoutSeconds ?? 0,
    limitPatterns: overrides.limitPatterns ?? []
  })
  const projectId = makeProject(db, { name: 'p', targetId: agentId, path: workdir })
  const taskId = makeTask(db, projectId, 't')

  const run = await runner.start({
    task: repo.getTask(db, taskId)!,
    project: repo.getProject(db, projectId)!,
    agent: repo.getAgent(db, agentId)!,
    groupId: null,
    kind: 'initial',
    fallbackFromRunId: null
  })

  expect(run.pid).not.toBeNull()
  spawned.push(run.pid!)
  return { runId: run.id, pid: run.pid!, taskId }
}

describe('restarting the app and the agents', () => {
  it('the rebuild script leaves detached GitHub auth supervisors running', () => {
    const script = readFileSync(join(import.meta.dirname, '../scripts/restart-app.sh'), 'utf8')
    const matcher = script.slice(script.indexOf('running_pids()'), script.indexOf('quit_running()'))
    const output = execFileSync('/bin/sh', ['-c', `ps() { printf '%s\\n' "$QUUU_PROBE_PROCESSES"; }\n${matcher}\nrunning_pids`], {
      encoding: 'utf8',
      env: { ...process.env, QUUU_PROBE_PROCESSES: [
        '101 /Applications/Quuu.app/Contents/MacOS/Quuu',
        '102 /Applications/Quuu.app/Contents/MacOS/Quuu /tmp/quuu-github-AbCd/runtime.mjs /bin/sh',
        '103 /Applications/Quuu.app/Contents/Frameworks/Quuu Helper.app/Contents/MacOS/Quuu Helper',
        '104 /Applications/taskd.app/Contents/MacOS/taskd'
      ].join('\n') }
    })
    expect(output.trim().split('\n')).toEqual(['101', '104'])
  })

  it('runs an agent in its own process group', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const { pid } = await startRun(db, runner, ['-c', 'sleep 5'])

    // It is its own group leader, i.e. detached from the process group of Quuu
    expect(() => process.kill(-pid, 0)).not.toThrow()
    expect(pid).not.toBe(process.pid)

    runner.shutdown()
  })

  it('keeps an agent running after the app quits', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const { pid, runId } = await startRun(db, runner, ['-c', 'sleep 5'])

    // The app quits (before-quit -> shutdown)
    runner.shutdown()
    await sleep(300)

    expect(isProcessAlive(pid)).toBe(true)
    // The DB still says running. The next launch takes it over again.
    expect(repo.getRun(db, runId)?.status).toBe('running')
  })

  it('settles a Run that ended while the app was down, exit code and all, on the next launch', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const { runId, taskId } = await startRun(db, runner, ['-c', 'echo boom >&2; exit 3'])

    // Build the situation where the app died before it finished
    runner.shutdown()
    expect(await until(() => existsSync(runExitPath(runId)))).toBe(true)

    // Restart
    const runner2 = new Runner(db)
    const scheduler2 = new Scheduler(db, runner2)
    scheduler2.reconcile()

    const run = repo.getRun(db, runId)!
    expect(run.status).toBe('failed')
    expect(run.exitCode).toBe(3)
    expect(repo.getTask(db, taskId)?.status).toBe('failed')
    // The execution slot has been released
    expect(repo.countActiveRuns(db)).toBe(0)
    // Clean up (so the next Run does not read a stale exit code)
    expect(existsSync(runExitPath(runId))).toBe(false)
  })

  it('puts a Run that ended normally while the app was down into review', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const { runId, taskId } = await startRun(db, runner, ['-c', 'echo done'])

    runner.shutdown()
    expect(await until(() => existsSync(runExitPath(runId)))).toBe(true)

    const runner2 = new Runner(db)
    const scheduler2 = new Scheduler(db, runner2)
    scheduler2.reconcile()

    expect(repo.getRun(db, runId)?.status).toBe('succeeded')
    expect(repo.getTask(db, taskId)?.status).toBe('review')
  })

  it('takes over an agent that is still running and settles it once it ends', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const { runId, taskId, pid } = await startRun(db, runner, ['-c', 'sleep 1; echo ok'])

    runner.shutdown()

    // Restart. It is still running, so it carries on as running.
    const runner2 = new Runner(db)
    const scheduler2 = new Scheduler(db, runner2)
    scheduler2.reconcile()

    expect(repo.getRun(db, runId)?.status).toBe('running')
    expect(repo.getTask(db, taskId)?.status).toBe('running')
    expect(isProcessAlive(pid)).toBe(true)

    // Watch it finish and settle it
    expect(await until(() => repo.getTask(db, taskId)?.status === 'review')).toBe(true)
    expect(repo.getRun(db, runId)?.status).toBe('succeeded')
    scheduler2.stop()
  }, 15_000)

  it('still catches a Limit across a restart, so the fallback works', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const { runId, taskId } = await startRun(db, runner, [
      '-c',
      'echo "Claude usage limit reached" >&2; exit 1'
    ])

    runner.shutdown()
    expect(await until(() => existsSync(runExitPath(runId)))).toBe(true)

    const runner2 = new Runner(db)
    const scheduler2 = new Scheduler(db, runner2)
    scheduler2.reconcile()

    const run = repo.getRun(db, runId)!
    expect(run.status).toBe('limited')
    expect(run.errorKind).toBe('limit')
    // It is re-queued automatically without going to a human (the same policy as a normal exit)
    expect(repo.getTask(db, taskId)?.status).toBe('queued')
    scheduler2.stop()
  })

  it('can cancel a Run that crossed a restart', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const { runId, taskId, pid } = await startRun(db, runner, ['-c', 'sleep 30'])

    runner.shutdown()

    const runner2 = new Runner(db)
    const scheduler2 = new Scheduler(db, runner2)
    scheduler2.reconcile()

    // It is not in live, but the recorded pid is followed to kill it
    runner2.cancel(runId)

    expect(await until(() => !isProcessAlive(pid))).toBe(true)
    expect(repo.getRun(db, runId)?.status).toBe('canceled')
    // The task is not left stranded as running
    expect(repo.getTask(db, taskId)?.status).toBe('review')
    scheduler2.stop()
  }, 15_000)

  it('cleans up grandchild processes on cancel', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const marker = join(workdir, 'grandchild.pid')
    const { runId } = await startRun(db, runner, [
      '-c',
      `sh -c 'echo $$ > "${marker}"; sleep 30' & sleep 30`
    ])

    expect(await until(() => existsSync(marker))).toBe(true)
    const grandchild = Number(readFileSync(marker, 'utf8').trim())
    spawned.push(grandchild)

    runner.cancel(runId)

    expect(await until(() => !isProcessAlive(grandchild))).toBe(true)
  }, 15_000)
})


describe('cancelling and settling the save', () => {
  it.each([false, true])('keeps the process, the state and the notification when the cancel save is rolled back (restarted: %s)', async (restarted) => {
    const db = memoryDb()
    let runner = new Runner(db)
    const { pid, runId, taskId } = await startRun(db, runner, ['-c', 'sleep 30'])
    if (restarted) {
      runner.shutdown()
      runner = new Runner(db)
    }
    const scheduler = new Scheduler(db, runner)
    const changed = vi.fn()
    const notify = vi.fn()
    scheduler.on('changed', changed)
    scheduler.on('notify', notify)
    try {
      expect(() => inTransaction(db, () => {
        runner.cancel(runId)
        throw new Error('cancel the save')
      })).toThrow('cancel the save')
      await sleep(250)
      expect(isProcessAlive(pid)).toBe(true)
      expect(repo.getRun(db, runId)?.status).toBe('running')
      expect(repo.getTask(db, taskId)?.status).toBe('running')
      expect(changed).not.toHaveBeenCalled()
      expect(notify).not.toHaveBeenCalled()

      runner.cancel(runId)
      expect(await until(() => !isProcessAlive(pid))).toBe(true)
      expect(repo.getRun(db, runId)?.status).toBe('canceled')
      expect(repo.getTask(db, taskId)?.status).toBe('review')
    } finally {
      scheduler.stop()
      runner.shutdown()
      db.close()
    }
  })
})
