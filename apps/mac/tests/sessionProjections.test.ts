import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate as yieldToApp } from 'node:timers/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { SessionIndex } from '../src/main/session/index.js'
import { SessionProjections } from '../src/main/session/projections.js'
import { isolateSessionDirs, makeAgent, makeProject, makeTask, memoryDb, occupy, releaseSessionDirs } from './helpers.js'

let dir: string
let db: ReturnType<typeof memoryDb>
let index: SessionIndex
let projections: SessionProjections
let runs: string[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-projections-'))
  isolateSessionDirs(dir)
  db = memoryDb()
  index = new SessionIndex(db)
  projections = new SessionProjections(db, index)
  const agent = makeAgent(db, { name: 'fixture' })
  const project = makeProject(db, { name: 'fixture', path: dir, targetId: agent })
  runs = Array.from({ length: 8 }, (_, i) => {
    const task = makeTask(db, project, `Task ${i}`)
    const id = occupy(db, task, agent)
    repo.updateRun(db, id, { status: i === 0 ? 'running' : 'succeeded' })
    return id
  })
})

afterEach(() => {
  projections.stop()
  index.stop()
  if (db.isOpen) db.close()
  releaseSessionDirs()
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

it('returns before discovery, prioritizes live work and lets the app respond between historical runs', async () => {
  const request = vi.spyOn(index, 'request').mockImplementation(() => {})
  const work = projections.refresh()
  expect(request).not.toHaveBeenCalled()
  expect(projections.refresh()).toBe(work)
  await yieldToApp()
  expect(request.mock.calls.map(([run]) => run.id)).toEqual([runs[0]])
  await work
  expect(request).toHaveBeenCalledTimes(runs.length)
})

it('checks active and changed runs each round, and unchanged history only once a minute', async () => {
  let now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const request = vi.spyOn(index, 'request').mockImplementation(() => {})
  await projections.refresh()
  request.mockClear()
  repo.updateRun(db, runs[1], { sessionLogPath: join(dir, 'relocated.jsonl') })
  now += 5000
  await projections.refresh()
  expect(request.mock.calls.map(([run]) => run.id).sort()).toEqual([runs[0], runs[1]].sort())
  request.mockClear()
  now += 60_000
  await projections.refresh()
  expect(request).toHaveBeenCalledTimes(runs.length)
})

it('uses current run data after yielding and does not recreate a deleted task', async () => {
  const request = vi.spyOn(index, 'request').mockImplementation(() => {})
  const work = projections.refresh()
  await yieldToApp()
  const removed = repo.getRun(db, runs[1])!
  repo.deleteTask(db, removed.taskId)
  repo.updateRun(db, runs[2], { sessionId: 'rebound' })
  await work
  expect(request.mock.calls.some(([run]) => run.id === runs[1])).toBe(false)
  expect(request.mock.calls.find(([run]) => run.id === runs[2])?.[0].sessionId).toBe('rebound')
})

it.each([false, true])('stops discovery before the database closes, including before its first turn (%s)', async started => {
  const request = vi.spyOn(index, 'request').mockImplementation(() => {})
  const work = projections.refresh()
  if (started) await yieldToApp()
  projections.stop()
  db.close()
  await work
  await projections.refresh()
  expect(request).toHaveBeenCalledTimes(started ? 1 : 0)
})
