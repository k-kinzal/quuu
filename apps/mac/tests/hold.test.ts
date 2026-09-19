import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { makeAgent, makeProject, makeTask, memoryDb, occupy } from './helpers.js'

let workdir: string

beforeEach(() => {
  // Never touch the production data directory (even if a Run does start, its log lands here)
  workdir = mkdtempSync(join(tmpdir(), 'taskd-test-'))
  process.env.QUUU_USER_DATA = workdir
})

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

function scheduler(db: ReturnType<typeof memoryDb>): Scheduler {
  return new Scheduler(db, new Runner(db))
}

/**
 * Only the state transitions matter here, so the scheduler stays stopped.
 * Left running, anything put back on the queue is picked up at once and turns `running`.
 */
function pausedApp(): QuuuApp {
  const app = new QuuuApp(':memory:')
  app.scheduler.pause()
  return app
}

describe('holding (taken off the queue, queued again later)', () => {
  it('does not pick up a held task from the queue', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 5 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 5 })
    const later = makeTask(db, p, 'あとでやる', 0)
    const now = makeTask(db, p, 'いまやる', 1)

    repo.setTaskStatus(db, later, 'held')

    // later comes first on priority, but being held takes it out of the pickup set
    const s = scheduler(db)
    expect(s.claimNext()?.task.id).toBe(now)
    expect(s.claimNext()).toBeNull()
  })

  it('picks it up once it is queued again', () => {
    const app = pausedApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const p = makeProject(app.db, { name: 'p', targetId: agent })
    const task = makeTask(app.db, p, 'あとでやる')

    app.tasks.holdTask(task)
    expect(app.scheduler.claimNext()).toBeNull()

    app.tasks.enqueueTask(task)
    expect(app.scheduler.claimNext()?.task.id).toBe(task)
  })

  it('takes a held task out of the queue positions', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const p = makeProject(db, { name: 'p', targetId: agent })
    const first = makeTask(db, p, '1 番目', 0)
    const second = makeTask(db, p, '2 番目', 1)
    const third = makeTask(db, p, '3 番目', 2)

    repo.setTaskStatus(db, first, 'held')

    const positions = repo.queuePositions(db)
    expect(positions.has(first)).toBe(false)
    expect(positions.get(second)).toBe(1)
    expect(positions.get(third)).toBe(2)
  })

  it('keeps held as a state distinct from draft', () => {
    const app = pausedApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const p = makeProject(app.db, { name: 'p', targetId: agent })
    const task = makeTask(app.db, p, '指示は書けている')

    expect(app.tasks.holdTask(task).status).toBe('held')
    // Only sending it back to draft makes it a draft (held never mixes with work in progress)
    expect(app.tasks.unqueueTask(task).status).toBe('draft')
    expect(app.tasks.holdTask(task).status).toBe('held')
    expect(app.tasks.enqueueTask(task).status).toBe('queued')
  })

  it('cannot hold a running task (stopping one is what cancel is for)', () => {
    const app = pausedApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const p = makeProject(app.db, { name: 'p', targetId: agent })
    const task = makeTask(app.db, p, '走っている')
    occupy(app.db, task, agent)

    expect(() => app.tasks.holdTask(task)).toThrow()
    expect(repo.getTask(app.db, task)?.status).toBe('running')
  })

  it('returns to the queue along with the prompt when sent to while held', () => {
    const app = pausedApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const p = makeProject(app.db, { name: 'p', targetId: agent })
    const task = makeTask(app.db, p, 'あとでやる')

    app.tasks.holdTask(task)
    expect(app.tasks.send(task, '追加の指示').ok).toBe(true)

    const after = repo.getTask(app.db, task)!
    expect(after.status).toBe('queued')
    expect(after.prompt).toContain('追加の指示')
  })

  it('speaks up about held tasks once the queue is empty', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const p = makeProject(db, { name: 'p', targetId: agent })
    const waiting = makeTask(db, p, '待機中')
    const later = makeTask(db, p, 'あとでやる')
    repo.setTaskStatus(db, later, 'held')

    const s = scheduler(db)
    // It stays quiet while anything is still waiting
    expect(s.status().warnings.some((w) => w.includes('held'))).toBe(false)

    repo.setTaskStatus(db, waiting, 'done')
    expect(s.status().warnings).toContain('The queue is empty (1 held)')
  })

  it('does not satisfy a preceding-task condition while held (the follower keeps waiting)', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 5 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 5 })
    const first = makeTask(db, p, '先にやる')
    const second = makeTask(db, p, '後でやる')
    repo.patchTask(db, second, { dependsOn: [{ taskId: first, mode: 'finished' }] })

    repo.setTaskStatus(db, first, 'held')
    expect(scheduler(db).claimNext()).toBeNull()
  })
})
