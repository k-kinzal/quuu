import { describe, expect, it } from 'vitest'
import type { TaskStatus } from '../src/main/tasks/status.js'
import { decide } from '../src/main/tasks/delayedRequest.js'
import type { CurrentTask } from '../src/main/tasks/delayedRequest.js'
import type { SyncExpect, SyncOp } from '../src/main/mobile-sync/protocol.js'

/**
 * The rule for "which came first". **How to treat something pressed far away.**
 *
 * The iPhone gets used from the bath, from bed, from a train. Minutes can pass between the press
 * and the Mac reading it, and the Mac keeps moving the whole time. This is the only place
 * where "what was assumed at the press" is matched against "the state right now".
 */

function current(status: TaskStatus, over: Partial<CurrentTask> = {}): CurrentTask {
  return {
    status,
    updatedAt: '2026-08-23T10:00:00.000Z',
    runSeq: 1,
    archived: false,
    hasSession: true,
    ...over
  }
}

function expectOf(status: TaskStatus, runSeq = 1): SyncExpect {
  return { status, updatedAt: '2026-08-23T10:00:00.000Z', runSeq }
}

const done: SyncOp = { kind: 'task.done', taskId: 't1' }

describe('marking done - the path only human authority may take', () => {
  it('marks it done when it is in review and still on the run that was read', () => {
    expect(decide(done, expectOf('review', 3), current('review', { runSeq: 3 })).outcome).toBe(
      'applied'
    )
  })

  it('lets a human read a failure and mark it done too (it is waiting on a human all the same)', () => {
    expect(decide(done, expectOf('failed', 2), current('failed', { runSeq: 2 })).outcome).toBe(
      'applied'
    )
  })

  it('does not mark it done when it ran again after being read - an unread result is never erased', () => {
    const d = decide(done, expectOf('review', 3), current('review', { runSeq: 4 }))
    expect(d.outcome).toBe('conflict')
    expect(d.reason).toContain('run again')
  })

  it('does not mark it done when the next run began before the press', () => {
    expect(decide(done, expectOf('review', 3), current('running', { runSeq: 4 })).outcome).toBe(
      'conflict'
    )
  })

  it('passes through when it is already done (the same intent twice is not applied twice)', () => {
    expect(decide(done, expectOf('review'), current('done')).outcome).toBe('skipped')
  })

  it('does not mark something done that never even ran', () => {
    for (const status of ['draft', 'held', 'queued'] as TaskStatus[]) {
      expect(decide(done, expectOf('review'), current(status)).outcome).toBe('conflict')
    }
  })

  it('reports crossed paths when the task is gone (never discards it silently)', () => {
    expect(decide(done, expectOf('review'), null).outcome).toBe('conflict')
  })
})

describe('sending back with a follow-up', () => {
  const back: SyncOp = { kind: 'task.sendBack', taskId: 't1', message: 'もう少し詳しく' }

  it('sends it on the next run when it sits in review', () => {
    expect(decide(back, expectOf('review'), current('review')).outcome).toBe('applied')
  })

  it('holds what was written mid-run as "send it when it finishes" instead of discarding it', () => {
    const d = decide(back, expectOf('review'), current('running'))
    expect(d.outcome).toBe('deferred')
    expect(d.reason).toContain('send when it finishes')
  })

  it('accepts a follow-up on a task that has not run yet (it can ride along as more prompt)', () => {
    for (const status of ['draft', 'held', 'queued'] as TaskStatus[]) {
      expect(decide(back, expectOf(status), current(status)).outcome).toBe('applied')
    }
  })

  it('does not send back a task that has been marked done', () => {
    expect(decide(back, expectOf('review'), current('done')).outcome).toBe('conflict')
  })
})

describe('rewriting the prompt', () => {
  it('allows a rewrite before it is sent', () => {
    const op: SyncOp = { kind: 'task.edit', taskId: 't1', prompt: '直した指示' }
    for (const status of ['draft', 'held', 'queued'] as TaskStatus[]) {
      expect(decide(op, expectOf(status), current(status)).outcome).toBe('applied')
    }
  })

  it('refuses a rewrite after the run started - never leave someone believing a fix landed when it did not', () => {
    const op: SyncOp = { kind: 'task.edit', taskId: 't1', prompt: '直した指示' }
    for (const status of ['running', 'review', 'failed', 'done'] as TaskStatus[]) {
      expect(decide(op, expectOf(status), current(status)).outcome).toBe('conflict')
    }
  })

  it('always allows the title and the priority, which do not affect the run', () => {
    const op: SyncOp = { kind: 'task.edit', taskId: 't1', title: '名前を直す', priority: 0 }
    for (const status of ['draft', 'queued', 'running', 'review', 'done'] as TaskStatus[]) {
      expect(decide(op, expectOf(status), current(status)).outcome).toBe('applied')
    }
  })
})

describe('queueing and unqueueing', () => {
  const enqueue: SyncOp = { kind: 'task.enqueue', taskId: 't1' }
  const unqueue: SyncOp = { kind: 'task.unqueue', taskId: 't1' }

  it('can queue a draft and a held task', () => {
    expect(decide(enqueue, expectOf('draft'), current('draft')).outcome).toBe('applied')
    expect(decide(enqueue, expectOf('held'), current('held')).outcome).toBe('applied')
  })

  it('does not re-queue something that has already moved on (it passes through)', () => {
    for (const status of ['queued', 'running', 'review', 'failed'] as TaskStatus[]) {
      expect(decide(enqueue, expectOf('draft'), current(status)).outcome).toBe('skipped')
    }
  })

  it('does not re-queue a task marked done, and reports crossed paths', () => {
    expect(decide(enqueue, expectOf('draft'), current('done')).outcome).toBe('conflict')
  })

  it('refuses when the run started before the unqueue (a running task is never stopped)', () => {
    const d = decide(unqueue, expectOf('queued'), current('running'))
    expect(d.outcome).toBe('conflict')
    expect(d.reason).toContain('started running')
  })

  it('can unqueue a task that is waiting', () => {
    expect(decide(unqueue, expectOf('queued'), current('queued')).outcome).toBe('applied')
  })
})

describe('creating', () => {
  const create: SyncOp = {
    kind: 'task.create',
    taskId: 't-new',
    projectId: 'p1',
    title: '思いついたこと',
    prompt: '',
    priority: 2,
    enqueue: false
  }

  it('creates with the id the device assigned', () => {
    expect(decide(create, null, null).outcome).toBe('applied')
  })

  it('does not create twice when the same intent arrives twice', () => {
    expect(decide(create, null, current('draft')).outcome).toBe('skipped')
  })
})

describe('archiving', () => {
  const archive: SyncOp = { kind: 'task.archive', taskId: 't1' }

  it('does not archive while it is running', () => {
    expect(decide(archive, expectOf('review'), current('running')).outcome).toBe('conflict')
  })

  it('passes through an archive of something already gone (not reported as crossed paths)', () => {
    expect(decide(archive, expectOf('review'), null).outcome).toBe('skipped')
  })

  it('passes through a duplicate archive of something already archived', () => {
    expect(decide(archive, expectOf('review'), current('review', { archived: true })).outcome).toBe(
      'skipped'
    )
  })
})

describe('an intent that carries no assumption', () => {
  it('decides from the current state alone when there is no expect (the run count is not read)', () => {
    expect(decide(done, null, current('review', { runSeq: 99 })).outcome).toBe('applied')
  })
})
