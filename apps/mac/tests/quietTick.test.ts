import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

// This verifies scheduler notifications, independent of the developer's login-shell startup time.
vi.mock('../src/main/platform/shellEnv.js', () => ({ resolveLoginPath: () => Promise.resolve(process.env.PATH ?? '/usr/bin:/bin') }))

let workdir: string

beforeEach(() => {
  // Never touch the production data directory (the Run that does start logs here)
  workdir = mkdtempSync(join(tmpdir(), 'taskd-test-'))
  process.env.QUUU_USER_DATA = workdir
})

describe('automatic tick failures', () => {
  let db: ReturnType<typeof memoryDb>
  let runner: Runner
  let scheduler: Scheduler
  let unhandled: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    db = memoryDb()
    runner = new Runner(db)
    scheduler = new Scheduler(db, runner)
    unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
  })

  afterEach(() => {
    scheduler.stop()
    runner.shutdown()
    db.close()
    process.off('unhandledRejection', unhandled)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each(['start', 'resume', 'interval', 'kick', 'nextTick'] as const)(
    'catches a claim failure from %s without an unhandled rejection or toast', async (origin) => {
      await scheduler.tick()
      if (origin === 'resume') scheduler.pause()
      if (origin === 'interval') scheduler.start(500)
      const failure = new Error('database or disk is full')
      vi.spyOn(scheduler, 'claimNext').mockImplementation(() => { throw failure })
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const status = vi.fn()
      const notify = vi.fn()
      scheduler.on('status', status)
      scheduler.on('notify', notify)
      const settings = repo.getAppSettings(db)

      if (origin === 'start') scheduler.start(500)
      if (origin === 'resume') scheduler.resume()
      if (origin === 'interval') await vi.advanceTimersByTimeAsync(500)
      if (origin === 'kick') scheduler.kick()
      if (origin === 'nextTick') {
        scheduler.holdSlot({ taskId: 'released', title: '', projectId: 'project', agentId: null })
        scheduler.releaseSlot('released')
        await vi.advanceTimersByTimeAsync(0)
      }
      // Await an actual event-loop turn: draining Promise jobs alone cannot observe this event.
      await nextTurn()

      expect(unhandled).not.toHaveBeenCalled()
      expect(notify).not.toHaveBeenCalled()
      expect(log.mock.calls).toEqual([['Scheduler tick failed', failure]])
      expect(status).toHaveBeenLastCalledWith(expect.objectContaining({
        running: true, warnings: [expect.stringContaining(failure.message)]
      }))
      expect(scheduler.isEnabled).toBe(true)
      expect(repo.getAppSettings(db)).toEqual(settings)
    }
  )

  it('announces each changed failure once, clears it on recovery, and reports a later recurrence', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const status = vi.fn()
    scheduler.on('status', status)
    const claim = vi.spyOn(scheduler, 'claimNext').mockImplementation(() => { throw new Error('save failed') })

    scheduler.start(500)
    await vi.advanceTimersByTimeAsync(2000)
    scheduler.kick()
    expect(log).toHaveBeenCalledTimes(1)
    expect(status).toHaveBeenCalledTimes(1)

    claim.mockImplementation(() => { throw new Error('database is locked') })
    await vi.advanceTimersByTimeAsync(1500)
    expect(log).toHaveBeenCalledTimes(2)
    expect(status).toHaveBeenCalledTimes(2)

    claim.mockRestore()
    await vi.advanceTimersByTimeAsync(1500)
    expect(scheduler.status().warnings).toEqual([])
    expect(status).toHaveBeenCalledTimes(3)

    vi.spyOn(scheduler, 'claimNext').mockImplementation(() => { throw new Error('database is locked') })
    await vi.advanceTimersByTimeAsync(1500)
    await nextTurn()
    expect(log).toHaveBeenCalledTimes(3)
    expect(status).toHaveBeenCalledTimes(4)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('retains the original failure even when reading status also fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failure = new Error('claim save failed')
    vi.spyOn(scheduler, 'claimNext').mockImplementation(() => { throw failure })
    const read = vi.spyOn(repo, 'listAgents').mockImplementation(() => { throw new Error('cannot read DB') })
    scheduler.start(500)
    await vi.advanceTimersByTimeAsync(1500)
    await nextTurn()
    expect(unhandled).not.toHaveBeenCalled()
    expect(log.mock.calls).toEqual([['Scheduler tick failed', failure]])
    read.mockRestore()
    expect(scheduler.status().warnings).toEqual([expect.stringContaining(failure.message)])
  })

  it('does not treat a repeated status read failure as recovery', async () => {
    const failure = new Error('cannot read DB')
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const read = vi.spyOn(repo, 'countTasksByStatus').mockImplementation(() => { throw failure })
    scheduler.start(500)
    await vi.advanceTimersByTimeAsync(1500)
    await nextTurn()
    expect(unhandled).not.toHaveBeenCalled()
    expect(log.mock.calls).toEqual([['Scheduler tick failed', failure]])
    read.mockRestore()
    expect(scheduler.status().warnings).toEqual([expect.stringContaining(failure.message)])
    await vi.advanceTimersByTimeAsync(500)
    expect(scheduler.status().warnings).toEqual([])
  })

  it('catches a rejection after awaiting launch without claiming the committed run twice', async () => {
    const agent = makeAgent(db, { name: 'a' })
    const project = makeProject(db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(db, project, 'queued work')
    const failure = new Error('launch preparation save failed')
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const start = vi.spyOn(runner, 'start').mockRejectedValue(failure)
    scheduler.start(500)
    await nextTurn()
    expect(unhandled).not.toHaveBeenCalled()
    expect(log.mock.calls).toEqual([['Scheduler tick failed', failure]])
    expect(scheduler.status().warnings).toEqual([expect.stringContaining(failure.message)])
    await vi.advanceTimersByTimeAsync(1500)
    expect(start).toHaveBeenCalledTimes(1)
    expect(repo.listRunsByTask(db, task)).toHaveLength(1)
  })
})

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

describe('what a scheduler tick announces', () => {
  it('a tick that finds nothing to do announces neither a change nor a status', async () => {
    const db = memoryDb()
    const scheduler = new Scheduler(db, new Runner(db))
    // The first tick hands out the initial status; every quiet tick after it must stay silent.
    await scheduler.tick()
    const changed = vi.fn()
    const status = vi.fn()
    scheduler.on('changed', changed)
    scheduler.on('status', status)

    await scheduler.tick()
    await scheduler.tick()

    expect(changed).not.toHaveBeenCalled()
    expect(status).not.toHaveBeenCalled()
  })

  it('a tick that starts a run still announces the change and the new status', async () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', command: '/usr/bin/true', argsTemplate: [] })
    const project = makeProject(db, { name: 'p', targetId: agent, path: workdir })
    const scheduler = new Scheduler(db, new Runner(db))
    await scheduler.tick()
    const changed = vi.fn()
    const status = vi.fn()
    scheduler.on('changed', changed)
    scheduler.on('status', status)

    makeTask(db, project, 'queued work')
    await scheduler.tick()

    expect(changed).toHaveBeenCalled()
    expect(status).toHaveBeenCalledOnce()
    expect(status.mock.calls[0][0]).toMatchObject({ activeRuns: 1 })
    scheduler.stop()
  })

  it('pausing and resuming still reach the screen even though nothing else moved', async () => {
    const db = memoryDb()
    const scheduler = new Scheduler(db, new Runner(db))
    await scheduler.tick()
    const status = vi.fn()
    scheduler.on('status', status)

    scheduler.pause()
    scheduler.resume()

    expect(status.mock.calls.map(([value]) => (value as { running: boolean }).running)).toEqual([false, true])
  })
})
