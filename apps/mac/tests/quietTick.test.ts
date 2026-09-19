import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

let workdir: string

beforeEach(() => {
  // Never touch the production data directory (the Run that does start logs here)
  workdir = mkdtempSync(join(tmpdir(), 'taskd-test-'))
  process.env.QUUU_USER_DATA = workdir
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
