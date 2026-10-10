import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { inTransaction } from '../src/main/db/database.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { PreparationBlockedError } from '../src/main/execution/preparation.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

let dir: string
let db: ReturnType<typeof memoryDb>
let runner: Runner
let scheduler: Scheduler
let taskId: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-preparation-'))
  vi.stubEnv('QUUU_USER_DATA', dir)
  db = memoryDb()
  runner = new Runner(db)
  scheduler = new Scheduler(db, runner)
  const agent = makeAgent(db, { name: '検証', command: '/bin/sh', argsTemplate: ['-c', `touch '${join(dir, 'spawned')}'`] })
  const project = makeProject(db, { name: '検証', targetId: agent, path: dir, maxConcurrent: 1 })
  taskId = makeTask(db, project, '実行する')
})
afterEach(() => {
  scheduler.stop(); runner.shutdown(); db.close()
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks()
})

it('claims the execution slot together with a starting run record, and never hands the same slot to the next claim', () => {
  const claim = scheduler.claimNext()!
  expect(claim.run.status).toBe('starting')
  expect(claim.run.pid).toBeNull()
  expect(repo.getTask(db, taskId)).toMatchObject({ status: 'running', currentRunId: claim.run.id })
  expect(repo.listActiveRuns(db).map(r => r.id)).toEqual([claim.run.id])
  makeTask(db, claim.task.projectId, '次のタスク')
  expect(scheduler.claimNext()).toBeNull()
  expect(existsSync(join(dir, 'spawned'))).toBe(false)
})

it('when persisting the claim fails, neither the half-claimed task nor the run record survives', () => {
  expect(() => inTransaction(db, () => { scheduler.claimNext(); throw new Error('save failed') })).toThrow('save failed')
  expect(repo.getTask(db, taskId)?.status).toBe('queued')
  expect(repo.listActiveRuns(db)).toEqual([])
  expect(repo.listRunsByTask(db, taskId)).toEqual([])
})

it('keeps a task behind a known launch gate waiting while claiming other eligible work', () => {
  const next = makeTask(db, repo.getTask(db, taskId)!.projectId, 'Available work', 3)
  const prepare = runner.prepare.bind(runner)
  vi.spyOn(runner, 'prepare').mockImplementation(params => {
    if (params.task.id === taskId) throw new PreparationBlockedError('Waiting for the assigned Runner')
    return prepare(params)
  })
  const claim = scheduler.claimNext()!
  expect(claim.task.id).toBe(next)
  expect(repo.getTask(db, taskId)?.status).toBe('queued')
  expect(repo.listRunsByTask(db, taskId)).toEqual([])
  expect(scheduler.status().warnings).toEqual([expect.stringContaining('Waiting for the assigned Runner')])
})

it.each(['task save', 'claim commit', 'SQLITE_FULL'] as const)(
  'recovers from an automatic %s failure without partial claims, duplicate starts or changing settings', async (point) => {
    vi.useFakeTimers()
    const originalTask = repo.getTask(db, taskId)
    const originalSettings = repo.getAppSettings(db)
    const failure = new Error('injected storage failure')
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const start = vi.spyOn(runner, 'start').mockImplementation((_params, run) => Promise.resolve(run!))
    const notify = vi.fn()
    const status = vi.fn()
    const unhandled = vi.fn()
    scheduler.on('notify', notify)
    scheduler.on('status', status)
    process.on('unhandledRejection', unhandled)
    let restore: () => void
    if (point === 'task save') {
      const save = repo.setTaskStatus
      const injected = vi.spyOn(repo, 'setTaskStatus').mockImplementation((...args) => {
        save(...args)
        throw failure
      })
      restore = () => injected.mockRestore()
    } else if (point === 'claim commit') {
      const exec = db.exec.bind(db)
      const injected = vi.spyOn(db, 'exec').mockImplementation(sql => {
        // Automation also opens a transaction, so fail only a claim that has saved a run.
        if (sql === 'COMMIT' && repo.listActiveRuns(db).length > 0) throw failure
        return exec(sql)
      })
      restore = () => injected.mockRestore()
    } else {
      // Fill only this in-memory DB. SQLite itself rolls back the nested claim on SQLITE_FULL.
      db.exec('CREATE TABLE capacity_probe (data BLOB)')
      const pages = Number(db.prepare('PRAGMA page_count').get()!.page_count)
      db.exec(`PRAGMA max_page_count=${pages}`)
      runner.setPrepared(() => db.exec('INSERT INTO capacity_probe VALUES (zeroblob(10000000))'))
      restore = () => {
        runner.setPrepared(() => {})
        db.exec('PRAGMA max_page_count=1073741823')
      }
    }
    try {
      scheduler.start(500)
      await vi.advanceTimersByTimeAsync(1500)
      scheduler.kick()
      await nextTurn()

      expect(unhandled).not.toHaveBeenCalled()
      expect(start).not.toHaveBeenCalled()
      expect(existsSync(join(dir, 'spawned'))).toBe(false)
      expect(repo.getTask(db, taskId)).toEqual(originalTask)
      expect(repo.listRunsByTask(db, taskId)).toEqual([])
      expect(repo.listActiveRuns(db)).toEqual([])
      expect(db.isTransaction).toBe(false)
      expect(notify).not.toHaveBeenCalled()
      expect(log).toHaveBeenCalledTimes(1)
      const loggedError: unknown = log.mock.calls[0][1]
      if (point === 'SQLITE_FULL') {
        expect(loggedError).toMatchObject({ code: 'ERR_SQLITE_ERROR', errcode: 13, message: 'database or disk is full' })
      } else expect(loggedError).toBe(failure)
      expect(status).toHaveBeenCalledTimes(1)
      expect(scheduler.status().warnings).toEqual([expect.stringContaining(
        point === 'SQLITE_FULL' ? 'database or disk is full' : failure.message
      )])
      expect(scheduler.isEnabled).toBe(true)
      expect(repo.getAppSettings(db)).toEqual(originalSettings)

      if (point === 'claim commit') {
        // Recovery needs no human action: the next ordinary interval retries the claim.
        restore()
      } else {
        scheduler.pause()
        restore()
        await vi.advanceTimersByTimeAsync(1500)
        scheduler.kick()
        expect(start).not.toHaveBeenCalled()
        expect(repo.getTask(db, taskId)).toEqual(originalTask)
        expect(scheduler.status().warnings).toHaveLength(2)
        scheduler.resume()
      }
      await vi.advanceTimersByTimeAsync(1500)
      await nextTurn()
      expect(start).toHaveBeenCalledTimes(1)
      expect(repo.listRunsByTask(db, taskId)).toHaveLength(1)
      expect(repo.getTask(db, taskId)).toMatchObject({ status: 'running', currentRunId: repo.listRunsByTask(db, taskId)[0].id })
      expect(scheduler.status().warnings).toEqual([])
      expect(repo.getAppSettings(db)).toEqual(originalSettings)
      expect(unhandled).not.toHaveBeenCalled()
    } finally { process.off('unhandledRejection', unhandled) }
  }
)

it('does not claim another task when paused while awaiting a launch', async () => {
  const projectId = repo.getTask(db, taskId)!.projectId
  const nextTask = makeTask(db, projectId, '次のタスク')
  repo.updateProject(db, projectId, { maxConcurrent: 2 })
  const agentId = repo.getProject(db, projectId)!.targetId!
  repo.updateAgent(db, agentId, { concurrency: 2 })
  const start = vi.spyOn(runner, 'start').mockImplementation((_params, run) => {
    scheduler.pause()
    return Promise.resolve(run!)
  })
  await scheduler.tick()
  expect(start).toHaveBeenCalledTimes(1)
  expect(repo.getTask(db, nextTask)?.status).toBe('queued')
})

it('a run canceled during preparation is not launched after the await', async () => {
  const claim = scheduler.claimNext()!
  const started = runner.start(claim.params, claim.run)
  scheduler.pause()
  runner.cancel(claim.run.id)
  const run = await started
  expect(run.status).toBe('canceled')
  expect(existsSync(join(dir, 'spawned'))).toBe(false)
  expect(repo.getRun(db, run.id)?.pid).toBeNull()
})

it('quitting the app and closing the DB during preparation does not save or launch afterwards', async () => {
  const claim = scheduler.claimNext()!
  const started = runner.start(claim.params, claim.run)
  scheduler.stop()
  runner.shutdown()
  db.close()
  await expect(started).resolves.toMatchObject({ id: claim.run.id, pid: null })
  expect(existsSync(join(dir, 'spawned'))).toBe(false)
  db = memoryDb()
})
