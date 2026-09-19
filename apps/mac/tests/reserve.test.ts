import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { QuuuApp } from '../src/main/bootstrap.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { makeAgent, makeProject, makeTask, memoryDb, occupy, sessioned } from './helpers.js'

let workdir: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'taskd-reserve-'))
  process.env.QUUU_USER_DATA = workdir
})

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

function waitFinished(scheduler: Scheduler, runner: Runner): Promise<void> {
  return new Promise((resolve) => {
    runner.once('finished', () => setTimeout(resolve, 30))
    void scheduler.tick()
  })
}

/** An agent that can continue a run. A reservation is always sent as a continuation. */
function resumableAgent(db: ReturnType<typeof memoryDb>, over: { command?: string; args?: string[] } = {}): string {
  return makeAgent(db, {
    name: 'echo',
    command: over.command ?? '/bin/echo',
    argsTemplate: over.args ?? ['initial'],
    resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '{{prompt}}']
  })
}

describe('sending while a run is in flight (a reserved send)', () => {
  it('does not run it on the spot when sent mid-run, but holds it as a reservation', () => {
    const app = new QuuuApp(':memory:')
    const agent = resumableAgent(app.db)
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(app.db, project, 't')
    occupy(app.db, task, agent)

    const result = app.tasks.send(task, 'これも直して')

    expect(result).toEqual({ ok: true, reserved: true })
    const after = repo.getTask(app.db, task)!
    // Still running. The agent in flight is never interrupted
    expect(after.status).toBe('running')
    expect(after.reservedMessage).toBe('これも直して')
    expect(after.pendingMessage).toBe('')
    app.shutdown()
  })

  it('loses nothing however often it is written mid-run, and merges it into one message in order', () => {
    const app = new QuuuApp(':memory:')
    const agent = resumableAgent(app.db)
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(app.db, project, 't')
    occupy(app.db, task, agent)

    app.tasks.send(task, '1 つ目')
    app.tasks.send(task, '2 つ目')

    expect(repo.getTask(app.db, task)?.reservedMessage).toBe('1 つ目\n\n2 つ目')
    app.shutdown()
  })

  it('reports with a reason that it cannot hold the message when no agent can continue', () => {
    const app = new QuuuApp(':memory:')
    // An empty resumeArgsTemplate means it cannot continue
    const agent = makeAgent(app.db, { name: 'once', command: '/bin/echo' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(app.db, project, 't')
    occupy(app.db, task, agent)

    const result = app.tasks.send(task, 'あとで送りたい')

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('The once that opened this session is unavailable')
    expect(repo.getTask(app.db, task)?.reservedMessage).toBe('')
    app.shutdown()
  })

  it('can cancel a reservation', () => {
    const app = new QuuuApp(':memory:')
    const agent = resumableAgent(app.db)
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(app.db, project, 't')
    occupy(app.db, task, agent)

    app.tasks.send(task, 'やっぱりやめる')
    expect(app.tasks.clearReservation(task).reservedMessage).toBe('')
    app.shutdown()
  })
})

describe('sending the reservation', () => {
  it('sends the reservation as a continuation right after a run ends normally', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const scheduler = new Scheduler(db, runner)

    const agent = resumableAgent(db)
    const project = makeProject(db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(db, project, 't')
    // Assume it was written while the run was in flight
    repo.setReservedMessage(db, task, '続きはこれ')

    await waitFinished(scheduler, runner)
    const first = repo.listRunsByTask(db, task)[0]

    const after = repo.getTask(db, task)!
    // The human already decided "send it when it finishes", so it goes on to the continuation instead of stopping at review
    expect(after.status).toBe('queued')
    expect(after.pendingMessage).toBe('続きはこれ')
    expect(after.reservedMessage).toBe('')

    await waitFinished(scheduler, runner)
    const second = repo.listRunsByTask(db, task)[0]
    expect(second.kind).toBe('followup')
    expect(second.sessionId).toBe(first.sessionId)
    expect(second.args).toEqual(['--resume', first.sessionId, '-p', '続きはこれ'])
    // Once it is sent, it comes back to the human at review as usual
    expect(repo.getTask(db, task)?.status).toBe('review')
  })

  it('keeps holding it without sending when the run failed', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const scheduler = new Scheduler(db, runner)

    const agent = makeAgent(db, {
      name: 'broken',
      command: '/bin/sh',
      argsTemplate: ['-c', 'echo boom >&2; exit 3'],
      resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '{{prompt}}']
    })
    const project = makeProject(db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(db, project, 't')
    repo.setReservedMessage(db, task, '続きはこれ')

    await waitFinished(scheduler, runner)

    const after = repo.getTask(db, task)!
    expect(after.status).toBe('failed')
    // Whether to pile a follow-up onto work that ended midway is for the human to decide
    expect(after.reservedMessage).toBe('続きはこれ')
    expect(after.pendingMessage).toBe('')
  })

  it('sends any leftover reservation along with it when sending while stopped', () => {
    const app = new QuuuApp(':memory:')
    const agent = resumableAgent(app.db)
    // Disable the project so the scheduler cannot pick it up (look only at what was written)
    const project = makeProject(app.db, {
      name: 'p',
      targetId: agent,
      path: workdir,
      enabled: false
    })
    const task = makeTask(app.db, project, 't')
    sessioned(app.db, task, agent, 'review')
    repo.setReservedMessage(app.db, task, '送りそびれた分')

    const result = app.tasks.send(task, 'いま書いた分')

    expect(result.ok).toBe(true)
    const after = repo.getTask(app.db, task)!
    expect(after.pendingMessage).toBe('送りそびれた分\n\nいま書いた分')
    expect(after.reservedMessage).toBe('')
    expect(after.status).toBe('queued')
    app.shutdown()
  })

  it('can send a leftover reservation on its own with an empty send', () => {
    const app = new QuuuApp(':memory:')
    const agent = resumableAgent(app.db)
    const project = makeProject(app.db, {
      name: 'p',
      targetId: agent,
      path: workdir,
      enabled: false
    })
    const task = makeTask(app.db, project, 't')
    sessioned(app.db, task, agent, 'failed')
    repo.setReservedMessage(app.db, task, '送りそびれた分')

    expect(app.tasks.send(task, '').ok).toBe(true)
    const after = repo.getTask(app.db, task)!
    expect(after.pendingMessage).toBe('送りそびれた分')
    expect(after.status).toBe('queued')
    app.shutdown()
  })

  it('fails to send when there is neither a reservation nor input', () => {
    const app = new QuuuApp(':memory:')
    const agent = resumableAgent(app.db)
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(app.db, project, 't', 2, 'draft')

    expect(app.tasks.send(task, '   ').ok).toBe(false)
    app.shutdown()
  })
})
