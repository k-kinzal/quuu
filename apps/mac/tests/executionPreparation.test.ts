import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { inTransaction } from '../src/main/db/database.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
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
afterEach(() => { scheduler.stop(); runner.shutdown(); db.close(); rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs() })

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
