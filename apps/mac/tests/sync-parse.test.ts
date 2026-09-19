import { describe, expect, it } from 'vitest'
import { parseIntent } from '../src/main/mobile-sync/readIntent.js'
import { parseReceipts } from '../../mobile/src/sync/receipts.js'
import { parseSnapshot } from '../../mobile/src/sync/readSnapshot.js'
import { SYNC_VERSION } from '../src/main/mobile-sync/protocol.js'
import type { SyncSnapshot } from '../src/main/mobile-sync/protocol.js'

/**
 * What is being read is "a file another device wrote with another version", and iCloud
 * may have brought only part of it down. What is checked is that **one broken entry does not stop it**.
 */

const snapshot: SyncSnapshot = {
  version: SYNC_VERSION,
  rev: 7,
  generatedAt: '2026-08-23T10:00:00.000Z',
  omittedDone: 0,
  scheduler: { running: true, activeRuns: 1, queued: 2 },
  projects: [{ id: 'p1', name: 'Quuu', color: '#4EA8DE', priority: 2, enabled: true }],
  tasks: [
    {
      id: 't1',
      projectId: 'p1',
      title: 'やること',
      excerpt: '本文',
      status: 'review',
      priority: 1,
      order: 0,
      updatedAt: '2026-08-23T09:00:00.000Z',
      runSeq: 2,
      lastRun: { status: 'succeeded', endedAt: '2026-08-23T09:00:00.000Z', errorKind: '' },
      hasPending: false,
      hasReserved: false,
      detailHash: 'abc'
    }
  ]
}

describe('reading a snapshot', () => {
  it('gives back exactly what was written', () => {
    const r = parseSnapshot(JSON.stringify(snapshot))
    expect(r.ok && r.value).toEqual(snapshot)
  })

  it('refuses a truncated file as "not arrived yet" (it does not throw)', () => {
    const half = JSON.stringify(snapshot).slice(0, 120)
    const r = parseSnapshot(half)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain('may not have arrived yet')
  })

  it('reads a project whose priority lies outside the task scale, since the Mac orders projects by an open number', () => {
    const wide = {
      ...snapshot,
      projects: [...snapshot.projects, { id: 'p2', name: 'Later', color: '#9D7CD8', priority: 5, enabled: true }]
    }
    const r = parseSnapshot(JSON.stringify(wide))
    expect(r.ok, 'one such project used to sink the whole snapshot').toBe(true)
    expect(r.ok && r.value.projects.map((p) => p.priority)).toEqual([2, 5])
  })

  it('does not read an unknown version - never read a new meaning with old rules', () => {
    const future = { ...snapshot, version: SYNC_VERSION + 1 }
    expect(parseSnapshot(JSON.stringify(future)).ok).toBe(false)
  })

  it('does not apply a snapshot that contains an unknown status', () => {
    const broken = {
      ...snapshot,
      tasks: [{ id: 'x', status: 'そんな状態はない' }, ...snapshot.tasks]
    }
    const r = parseSnapshot(JSON.stringify(broken))
    expect(r.ok).toBe(false)
  })

  it('does not fill a missing required field with a default meaning', () => {
    const minimal = { version: 1, tasks: [{ id: 't9', status: 'draft' }] }
    const r = parseSnapshot(JSON.stringify(minimal))
    expect(r.ok).toBe(false)
  })
})

it('skips extra fields it does not need and keeps the information it knows', () => {
  const r = parseSnapshot(JSON.stringify({ ...snapshot, future: true, tasks: snapshot.tasks.map(t => ({ ...t, future: 1 })) }))
  expect(r.ok && r.value).toEqual(snapshot)
})

describe('reading an intent', () => {
  it('round-trips to the same thing', () => {
    const intent = {
      version: 1,
      id: 'i1',
      device: 'iphone',
      seq: 3,
      createdAt: '2026-08-23T10:00:00.000Z',
      baseRev: 7,
      op: { kind: 'task.sendBack', taskId: 't1', message: 'もう少し' },
      expect: { status: 'review', updatedAt: '2026-08-23T09:00:00.000Z', runSeq: 2 }
    }
    const r = parseIntent(JSON.stringify(intent))
    expect(r.ok && r.value).toEqual(intent)
  })

  it('does not read an unknown operation (it never silently does something else)', () => {
    const bad = { version: 1, id: 'i1', op: { kind: 'task.delete', taskId: 't1' } }
    expect(parseIntent(JSON.stringify(bad)).ok).toBe(false)
  })

  it('reads a version 2 create down to what happens right after it is added', () => {
    const intent = {
      version: 2,
      id: 'i-create',
      device: 'iphone',
      seq: 4,
      createdAt: 'x',
      baseRev: 7,
      op: {
        kind: 'task.create',
        taskId: 't-new',
        projectId: 'p1',
        title: 'あとでやる',
        prompt: '指示',
        priority: 2,
        enqueue: false,
        action: 'held'
      },
      expect: null
    }

    const r = parseIntent(JSON.stringify(intent))
    expect(r.ok && r.value).toEqual(intent)
  })

  it('does not read a version 2 create with no add action (it never assumes draft)', () => {
    const bad = {
      version: 2,
      id: 'i-create',
      op: { kind: 'task.create', taskId: 't-new', enqueue: false }
    }
    expect(parseIntent(JSON.stringify(bad)).ok).toBe(false)
  })

  it('does not read one with no id (without an idempotency key it could be applied twice)', () => {
    const bad = { version: 1, op: { kind: 'task.done', taskId: 't1' } }
    expect(parseIntent(JSON.stringify(bad)).ok).toBe(false)
  })

  it('keeps only the fields it was given on an edit (an unspecified one is not crushed to an empty string)', () => {
    const intent = {
      version: 1,
      id: 'i2',
      device: 'iphone',
      seq: 1,
      createdAt: 'x',
      baseRev: 0,
      op: { kind: 'task.edit', taskId: 't1', title: '新しい名前' },
      expect: null
    }
    const r = parseIntent(JSON.stringify(intent))
    expect(r.ok && r.value.op).toEqual({ kind: 'task.edit', taskId: 't1', title: '新しい名前' })
  })
})

describe('reading receipts', () => {
  it('drops a row with an unknown outcome', () => {
    const receipts = {
      version: 1,
      updatedAt: 'x',
      entries: [
        { intentId: 'a', outcome: 'applied', device: 'd', seq: 1, taskId: 't', at: 'x', reason: '' },
        { intentId: 'b', outcome: 'なにか', device: 'd', seq: 2, taskId: 't', at: 'x', reason: '' }
      ]
    }
    const r = parseReceipts(JSON.stringify(receipts))
    expect(r.ok && r.value.entries.map((e) => e.intentId)).toEqual(['a'])
  })
})
