import { describe, expect, it } from 'vitest'
import { contentHash } from '../src/sync/hash.js'
import { projectView, unsentTurns } from '../src/sync/projection.js'
import { makeIntent } from '../src/sync/writeIntent.js'
import { SYNC_VERSION } from '../src/sync/protocol.js'
import type { SyncIntent, SyncSnapshot, SyncTask, SyncTaskDetail } from '../src/sync/protocol.js'

/**
 * Draw the result of the press first (an optimistic overlay).
 *
 * Make people wait for the iCloud round trip and pressing changes nothing on screen.
 * A screen that does not change **gets pressed again.**
 */

function task(id: string, over: Partial<SyncTask> = {}): SyncTask {
  return {
    id,
    projectId: 'p1',
    title: id,
    excerpt: '',
    status: 'review',
    priority: 2,
    order: 0,
    updatedAt: '2026-08-23T09:00:00.000Z',
    runSeq: 1,
    lastRun: null,
    hasPending: false,
    hasReserved: false,
    detailHash: '',
    ...over
  }
}

function snapshot(tasks: SyncTask[]): SyncSnapshot {
  return {
    version: SYNC_VERSION,
    rev: 3,
    generatedAt: '2026-08-23T10:00:00.000Z',
    omittedDone: 0,
    scheduler: { running: true, activeRuns: 0, queued: 0 },
    projects: [{ id: 'p1', name: 'Quuu', color: '#4EA8DE', priority: 2, enabled: true }],
    tasks
  }
}

function intent(seq: number, op: SyncIntent['op']): SyncIntent {
  return {
    version: op.kind === 'task.create' && op.action ? 2 : 1,
    id: `i${seq}`,
    device: 'iphone',
    seq,
    createdAt: `2026-08-23T10:00:0${seq}.000Z`,
    baseRev: 3,
    op,
    expect: null
  }
}

describe('overlaying operations that have not arrived yet', () => {
  it('a row whose done was pressed looks done on the spot', () => {
    const view = projectView(snapshot([task('t1')]), [intent(1, { kind: 'task.done', taskId: 't1' })])
    expect(view.tasks[0].status).toBe('done')
    expect(view.tasks[0].pending).toBe(1)
  })

  it('a task created on the device appears at the top, so what was written is never invisible', () => {
    const view = projectView(snapshot([task('t1')]), [
      intent(1, {
        kind: 'task.create',
        taskId: 'new',
        projectId: 'p1',
        title: '思いついた',
        prompt: '本文\n続き',
        priority: 2,
        enqueue: true
      })
    ])
    expect(view.tasks[0].id).toBe('new')
    expect(view.tasks[0].local).toBe(true)
    expect(view.tasks[0].status).toBe('queued')
    expect(view.tasks[0].excerpt).toBe('本文')
  })

  it('hold and run-now also show the chosen landing without waiting for the Mac', () => {
    const held = projectView(snapshot([]), [
      intent(1, {
        kind: 'task.create',
        taskId: 'held',
        projectId: 'p1',
        title: 'あとで',
        prompt: '',
        priority: 2,
        enqueue: false,
        action: 'held'
      })
    ])
    const now = projectView(snapshot([]), [
      intent(1, {
        kind: 'task.create',
        taskId: 'now',
        projectId: 'p1',
        title: 'いま',
        prompt: '',
        priority: 2,
        enqueue: false,
        action: 'now'
      })
    ])

    expect(held.tasks[0].status).toBe('held')
    expect(now.tasks[0].status).toBe('running')
  })

  it('a follow-up to a running task reads as send-when-finished, matching the Mac', () => {
    const view = projectView(snapshot([task('t1', { status: 'running' })]), [
      intent(1, { kind: 'task.sendBack', taskId: 't1', message: 'あとで' })
    ])
    expect(view.tasks[0].hasReserved).toBe(true)
    expect(view.tasks[0].hasPending).toBe(false)
  })

  it('a follow-up to a task in review reads as waiting to send', () => {
    const view = projectView(snapshot([task('t1')]), [
      intent(1, { kind: 'task.sendBack', taskId: 't1', message: 'あとで' })
    ])
    expect(view.tasks[0].hasPending).toBe(true)
  })

  it('re-queuing a running task changes nothing, so what the Mac would refuse is never drawn first', () => {
    const view = projectView(snapshot([task('t1', { status: 'running' })]), [
      intent(1, { kind: 'task.enqueue', taskId: 't1' })
    ])
    expect(view.tasks[0].status).toBe('running')
  })

  it('an archived row disappears from the list', () => {
    const view = projectView(snapshot([task('t1'), task('t2')]), [
      intent(1, { kind: 'task.archive', taskId: 't1' })
    ])
    expect(view.tasks.map((t) => t.id)).toEqual(['t2'])
  })

  it('counts the operations overlaid on one row, so it can show "2 not synced"', () => {
    const view = projectView(snapshot([task('t1')]), [
      intent(1, { kind: 'task.edit', taskId: 't1', title: '直した' }),
      intent(2, { kind: 'task.done', taskId: 't1' })
    ])
    expect(view.tasks[0].title).toBe('直した')
    expect(view.tasks[0].status).toBe('done')
    expect(view.tasks[0].pending).toBe(2)
  })

  it('removing an imported intent returns the real state', () => {
    const applied = projectView(snapshot([task('t1')]), [])
    expect(applied.tasks[0].status).toBe('review')
    expect(applied.tasks[0].pending).toBe(0)
  })
})

describe('the content fingerprint', () => {
  it('is identical for identical content, so it can decide not to rewrite', () => {
    expect(contentHash('{"a":1}')).toBe(contentHash('{"a":1}'))
  })

  it('changes when a single character differs', () => {
    expect(contentHash('{"a":1}')).not.toBe(contentHash('{"a":2}'))
  })

  it('changes on reordering alone, since order is part of the content', () => {
    expect(contentHash('ab')).not.toBe(contentHash('ba'))
  })
})

/**
 * Utterances not yet sent. Pins down that **they appear in the conversation the instant
 * they are pressed**.
 *
 * Without that, sending changes nothing on screen. To the person who pressed, it is
 * indistinguishable from a press that did not land, so they press again.
 */
describe('unsent utterances placed at the end of the conversation', () => {
  const detail = (over: Partial<SyncTaskDetail> = {}): SyncTaskDetail => ({
    version: SYNC_VERSION,
    taskId: 't1',
    hash: 'h',
    generatedAt: '2026-08-23T10:00:00.000Z',
    title: 'やること',
    prompt: '',
    status: 'review',
    runSeq: 1,
    pendingMessage: '',
    reservedMessage: '',
    messages: [],
    truncated: false,
    runs: [],
    ...over
  })

  const sendBack = (id: string, seq: number, message: string, taskId = 't1'): SyncIntent =>
    makeIntent({
      id,
      device: 'phone',
      seq,
      createdAt: '2026-08-23T10:01:00.000Z',
      baseRev: 1,
      op: { kind: 'task.sendBack', taskId, message },
      expect: null
    })

  it('something just pressed appears carrying the not-arrived mark', () => {
    const out = unsentTurns(detail(), 't1', 'review', [sendBack('i1', 1, 'あとで直して')])
    expect(out).toEqual([
      { id: 'i1', text: 'あとで直して', arrived: false, reserved: false }
    ])
  })

  it('what was written during a run goes into the send-after-it-finishes side', () => {
    const out = unsentTurns(detail({ status: 'running' }), 't1', 'running', [
      sendBack('i1', 1, 'ついでにこれも')
    ])
    expect(out[0].reserved).toBe(true)
  })

  it('what the Mac is holding comes first, what was just pressed comes after', () => {
    const out = unsentTurns(
      detail({ reservedMessage: 'よやく', pendingMessage: 'つぎ' }),
      't1',
      'review',
      [sendBack('i1', 1, 'いま押した')]
    )
    expect(out.map((u) => u.text)).toEqual(['よやく', 'つぎ', 'いま押した'])
    expect(out.map((u) => u.arrived)).toEqual([true, true, false])
  })

  it('does not show two copies right after import, keeping identical text as one', () => {
    const out = unsentTurns(detail({ pendingMessage: 'おなじ文面' }), 't1', 'review', [
      sendBack('i1', 1, 'おなじ文面')
    ])
    expect(out).toHaveLength(1)
    expect(out[0].arrived).toBe(true)
  })

  it('does not mix in a follow-up meant for another task', () => {
    const out = unsentTurns(detail(), 't1', 'review', [sendBack('i1', 1, 'よそ', 't2')])
    expect(out).toEqual([])
  })

  it('stacks downward in the order pressed', () => {
    const out = unsentTurns(detail(), 't1', 'review', [
      sendBack('i2', 2, 'あと'),
      sendBack('i1', 1, 'さき')
    ])
    expect(out.map((u) => u.text)).toEqual(['さき', 'あと'])
  })
})
