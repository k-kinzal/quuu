import { describe, expect, it } from 'vitest'
import type { AppSnapshot } from '../src/main/snapshot.js'
import type { Task, TaskDependency } from '../src/main/tasks/types.js'
import type { TaskStatus } from '../src/main/tasks/status.js'
import { filterTasks, projectMap, queuePositions } from '../src/renderer/src/model/derive.js'
import { groupByStatus } from '../src/renderer/src/model/statusGroups.js'

function task(
  id: string,
  status: TaskStatus,
  priority: 0 | 1 | 2 | 3,
  seq: number,
  dependsOn: TaskDependency[] = []
): Task {
  return {
    id,
    projectId: 'p',
    title: id,
    prompt: '',
    status,
    priority,
    seq,
    scheduledAt: null,
    currentRunId: null,
    sessionId: null,
    agentOverrideId: null,
    pendingMessage: '',
    reservedMessage: '',
    reviewNote: '',
    dependsOn,
    source: 'user',
    ruleId: null,
    externalKey: null,
    archived: false,
    createdAt: '',
    updatedAt: '',
    doneAt: null
  }
}

const snapshot = (tasks: Task[]): AppSnapshot => ({
  rules: [],
  projects: [
    {
      id: 'p',
      name: 'p',
      path: '/tmp',
      color: '#fff',
      priority: 0,
      targetKind: 'agent',
      targetId: null,
      maxConcurrent: 1,
      enabled: true,
      deletedAt: null,
      importSince: null,
      commitIdentityMode: 'inherit',
      editorApp: '',
      reportEnabled: true,
      commitIdentity: { appSlug: '', botUserId: '' },
      source: 'user',
      sortOrder: 0,
      createdAt: '',
      updatedAt: ''
    }
  ],
  tasks,
  agents: [],
  groups: [],
  runs: [],
  scheduler: {
    running: true,
    activeRuns: 0,
    totalSlots: 0,
    queued: 0,
    review: 0,
    failed: 0,
    agents: [],
    holds: [],
    warnings: [],
    lastTickAt: null
  }
})

/** Order them the way the screen does (grouped by status). */
function visibleOrder(tasks: Task[]): string[] {
  const filtered = filterTasks(snapshot(tasks), { kind: 'all', showDone: false })
  return groupByStatus(filtered).flatMap((g) => g.tasks.map((t) => t.id))
}

describe('the order things move in', () => {
  it('lists the screen grouped by status', () => {
    const tasks = [
      task('draft-p0', 'draft', 0, 1),
      task('review-p3', 'review', 3, 2),
      task('running-p2', 'running', 2, 3),
      task('failed-p1', 'failed', 1, 4),
      task('queued-p0', 'queued', 0, 5)
    ]
    // Not by priority: review -> failed -> running -> queued -> draft
    expect(visibleOrder(tasks)).toEqual([
      'review-p3',
      'failed-p1',
      'running-p2',
      'queued-p0',
      'draft-p0'
    ])
  })

  it('follows priority and insertion order within the same status', () => {
    const tasks = [
      task('a', 'queued', 2, 1),
      task('b', 'queued', 0, 2),
      task('c', 'queued', 2, 0)
    ]
    expect(visibleOrder(tasks)).toEqual(['b', 'c', 'a'])
  })

  it('puts a follow-up at the head among the queued ones', () => {
    const followup: Task = {
      ...task('followup', 'queued', 3, 9),
      sessionId: 'sess-1',
      pendingMessage: 'ここを直して'
    }
    const tasks = [task('a', 'queued', 0, 1), task('b', 'queued', 2, 2), followup]
    expect(visibleOrder(tasks)).toEqual(['followup', 'a', 'b'])
  })

  it('counts a follow-up as number one in the queue position display too', () => {
    const followup: Task = {
      ...task('followup', 'queued', 3, 9),
      sessionId: 'sess-1',
      pendingMessage: 'ここを直して'
    }
    const snap = snapshot([task('a', 'queued', 0, 1), followup])
    const positions = queuePositions(snap.tasks, projectMap(snap.projects))
    expect(positions.get('followup')).toBe(1)
    expect(positions.get('a')).toBe(2)
  })

  it('leaves the order alone for a follow-up still sitting in review (it is not in the queue)', () => {
    const stale: Task = {
      ...task('review-stale', 'review', 3, 9),
      sessionId: 'sess-1',
      pendingMessage: '中断した追記'
    }
    const tasks = [task('review-p0', 'review', 0, 1), stale]
    expect(visibleOrder(tasks)).toEqual(['review-p0', 'review-stale'])
  })

  it('leaves done out of the order by default', () => {
    const tasks = [task('done', 'done', 0, 1), task('open', 'queued', 2, 2)]
    expect(visibleOrder(tasks)).toEqual(['open'])
  })
})

describe('the order of preceding tasks', () => {
  const waits = (id: string): TaskDependency[] => [{ taskId: id, mode: 'done' }]

  it('puts a preceding task ahead of its follower regardless of priority', () => {
    const tasks = [
      task('待つ方', 'queued', 0, 1, waits('先にやる方')),
      task('先にやる方', 'queued', 3, 2)
    ]
    // On priority alone the waiting one comes first. Never let a drawn dependency leave the order unchanged
    expect(visibleOrder(tasks)).toEqual(['先にやる方', '待つ方'])
  })

  it('orders a chain of them in sequence', () => {
    const tasks = [
      task('c', 'queued', 0, 3, waits('b')),
      task('b', 'queued', 0, 2, waits('a')),
      task('a', 'queued', 0, 1)
    ]
    expect(visibleOrder(tasks)).toEqual(['a', 'b', 'c'])
  })

  it('puts every one of them ahead when several are waited on', () => {
    const tasks = [
      task('last', 'queued', 0, 1, [
        { taskId: 'x', mode: 'done' },
        { taskId: 'y', mode: 'finished' }
      ]),
      task('x', 'queued', 2, 2),
      task('y', 'queued', 2, 3)
    ]
    expect(visibleOrder(tasks)).toEqual(['x', 'y', 'last'])
  })

  it('keeps the relative order of tasks that have no dependency', () => {
    const tasks = [
      task('free-p0', 'queued', 0, 4),
      task('待つ方', 'queued', 1, 1, waits('先にやる方')),
      task('先にやる方', 'queued', 3, 2),
      task('free-p3', 'queued', 3, 3)
    ]
    expect(visibleOrder(tasks)).toEqual(['free-p0', '先にやる方', '待つ方', 'free-p3'])
  })

  it('takes dependencies into account for the queue position too (the same rule as the main side)', () => {
    const tasks = [
      task('待つ方', 'queued', 0, 1, waits('先にやる方')),
      task('先にやる方', 'queued', 3, 2)
    ]
    const positions = queuePositions(tasks, projectMap(snapshot(tasks).projects))
    expect(positions.get('先にやる方')).toBe(1)
    expect(positions.get('待つ方')).toBe(2)
  })

  it('does not break the order on a cycle', () => {
    const tasks = [task('a', 'queued', 0, 1, waits('b')), task('b', 'queued', 0, 2, waits('a'))]
    expect(visibleOrder(tasks).sort()).toEqual(['a', 'b'])
  })
})
