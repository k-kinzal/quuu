import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import { makeAgent, makeProject, makeTask, occupy, sessioned } from './helpers.js'

let workdir: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'taskd-test-'))
  process.env.QUUU_USER_DATA = workdir
})

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

/** Keep the scheduler stopped. A test about editing must not actually launch an agent. */
function makeApp(): QuuuApp {
  const app = new QuuuApp(':memory:')
  app.scheduler.pause()
  return app
}

describe('fixing a queued task', () => {
  it('can rewrite the prompt of a queued task', () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(app.db, project, 't')

    app.tasks.updateTask(task, { prompt: '直した指示' })

    const after = repo.getTask(app.db, task)!
    expect(after.prompt).toBe('直した指示')
    // Fixing it alone does not take it out of the queue
    expect(after.status).toBe('queued')
  })

  it('can rewrite or cancel a queued follow-up', () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(app.db, project, 't')
    repo.setPendingMessage(app.db, task, 'ここを直して')

    app.tasks.updateTask(task, { pendingMessage: 'やっぱりこっちを直して' })
    expect(repo.getTask(app.db, task)?.pendingMessage).toBe('やっぱりこっちを直して')

    app.tasks.updateTask(task, { pendingMessage: '' })
    expect(repo.getTask(app.db, task)?.pendingMessage).toBe('')
  })

  it('does not clear a queued follow-up when another attribute changes', () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(app.db, project, 't')
    repo.setPendingMessage(app.db, task, '追記')

    app.tasks.updateTask(task, { title: '名前を変えただけ' })

    const after = repo.getTask(app.db, task)!
    expect(after.title).toBe('名前を変えただけ')
    expect(after.pendingMessage).toBe('追記')
  })

  it('cannot change what gets sent while it runs (never pretend a fix landed)', () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(app.db, project, 't')
    occupy(app.db, task, agent)

    expect(() => app.tasks.updateTask(task, { prompt: 'いま直す' })).toThrow('while running')
    expect(() => app.tasks.updateTask(task, { pendingMessage: 'いま直す' })).toThrow('while running')
    // Anything other than what gets sent can still be changed while running
    expect(() => app.tasks.updateTask(task, { priority: 0 })).not.toThrow()
    expect(repo.getTask(app.db, task)?.prompt).toBe('t')
  })
})

describe('stacking follow-ups while queued', () => {
  it('concatenates a send into the prompt for a task that has not run', () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(app.db, project, 't')

    expect(app.tasks.send(task, '足したいこと').ok).toBe(true)
    expect(repo.getTask(app.db, task)?.prompt).toBe('t\n\n足したいこと')
  })

  it('does not lose the first follow-up when written twice while queued', () => {
    const app = makeApp()
    const agent = makeAgent(app.db, {
      name: 'a',
      resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '{{prompt}}']
    })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(app.db, project, 't')
    // Put it into the state of having run once and holding a session
    sessioned(app.db, task, agent, 'review')

    expect(app.tasks.send(task, '1 つ目').ok).toBe(true)
    expect(app.tasks.send(task, '2 つ目').ok).toBe(true)

    const after = repo.getTask(app.db, task)!
    expect(after.pendingMessage).toBe('1 つ目\n\n2 つ目')
    expect(after.status).toBe('queued')
  })
})

describe('scheduling a task for later', () => {
  it('stores the moment in UTC, whatever notation it arrived in', () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(app.db, project, 't')

    app.tasks.updateTask(task, { scheduledAt: '2026-09-19T19:13:00+09:00' })

    // Kept as written it sorts nine hours after the instant it names, and every read of
    // scheduled_at is a string comparison against nowIso()
    expect(repo.getTask(app.db, task)?.scheduledAt).toBe('2026-09-19T10:13:00.000Z')
  })

  it('carries a schedule given at creation through the same normalization', () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })

    const task = app.tasks.createTask({
      projectId: project,
      title: 't',
      status: 'queued',
      scheduledAt: '2026-09-19T19:13:00+09:00'
    })

    expect(task.scheduledAt).toBe('2026-09-19T10:13:00.000Z')
  })

  it('leaves a schedule alone when it is cleared or unreadable', () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(app.db, project, 't')

    app.tasks.updateTask(task, { scheduledAt: '2026-09-19T19:13:00Z' })
    app.tasks.updateTask(task, { scheduledAt: null })

    expect(repo.getTask(app.db, task)?.scheduledAt).toBeNull()
  })
})
