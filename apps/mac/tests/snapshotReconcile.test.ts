// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSnapshot } from '../src/main/snapshot.js'
import type { Project } from '../src/main/projects/types.js'
import type { Task } from '../src/main/tasks/types.js'
import { reconcileSnapshot } from '../src/renderer/src/state/reconcile.js'
import { useStore } from '../src/renderer/src/state/store.js'

function task(over: Partial<Task> & { id: string }): Task {
  return {
    projectId: 'p1', title: over.id, prompt: '', status: 'queued', priority: 2, seq: 0, scheduledAt: null,
    currentRunId: null, sessionId: null, agentOverrideId: null, pendingMessage: '', reservedMessage: '',
    reviewNote: '', dependsOn: [], source: 'user', ruleId: null, externalKey: null,
    archived: false, createdAt: '', updatedAt: '', doneAt: null, ...over
  }
}

function project(id: string, name: string): Project {
  return {
    id, name, path: '/tmp', color: '#fff', priority: 2, targetKind: 'agent', targetId: null, maxConcurrent: 1,
    enabled: true, deletedAt: null, importSince: null, editorApp: '', reportEnabled: true,
    commitIdentityMode: 'inherit', commitIdentity: { appSlug: '', botUserId: '' }, source: 'user', sortOrder: 0,
    createdAt: '', updatedAt: ''
  }
}

function picture(): AppSnapshot {
  return {
    resumeCommands: { a: 'claude', b: null },
    projects: [project('p1', 'alpha'), project('p2', 'beta')],
    tasks: [task({ id: 'a', title: 'first' }), task({ id: 'b', title: 'second' }), task({ id: 'c', title: 'third' })],
    rules: [],
    agents: [],
    groups: [],
    runs: [],
    scheduler: {
      running: true, activeRuns: 0, totalSlots: 1, queued: 3, review: 0, failed: 0,
      agents: [], holds: [], warnings: [], lastTickAt: '2026-09-13T09:00:00.000Z'
    }
  }
}

let current: AppSnapshot
beforeEach(() => {
  current = picture()
  useStore.setState({ snapshot: current, cursorTaskId: null, detailOpen: false })
})

describe('applying the picture main sends', () => {
  it('a picture with nothing new leaves the store untouched, so no screen redraws', () => {
    const listener = vi.fn()
    const unsubscribe = useStore.subscribe(listener)
    useStore.getState().applySnapshot(picture())
    unsubscribe()
    expect(listener).not.toHaveBeenCalled()
    expect(useStore.getState().snapshot).toBe(current)
  })

  it('only the row that changed gets a new object; every other row and list keeps its own', () => {
    const next = picture()
    next.tasks[1] = { ...next.tasks[1], title: 'renamed' }
    useStore.getState().applySnapshot(next)
    const applied = useStore.getState().snapshot!
    expect(applied).not.toBe(current)
    expect(applied.tasks[0]).toBe(current.tasks[0])
    expect(applied.tasks[1].title).toBe('renamed')
    expect(applied.tasks[2]).toBe(current.tasks[2])
    expect(applied.projects).toBe(current.projects)
    expect(applied.runs).toBe(current.runs)
    expect(applied.scheduler).toBe(current.scheduler)
    expect(applied.resumeCommands).toBe(current.resumeCommands)
  })

  it('a scheduler status that reads the same as the current one is ignored', () => {
    const listener = vi.fn()
    const unsubscribe = useStore.subscribe(listener)
    useStore.getState().applyScheduler({ ...current.scheduler })
    expect(listener).not.toHaveBeenCalled()
    useStore.getState().applyScheduler({ ...current.scheduler, activeRuns: 1 })
    unsubscribe()
    expect(listener).toHaveBeenCalledOnce()
    expect(useStore.getState().snapshot?.scheduler.activeRuns).toBe(1)
    expect(useStore.getState().snapshot?.tasks).toBe(current.tasks)
  })
})

describe('reconciling two pictures', () => {
  it('a list that lost or reordered rows is replaced while its surviving rows keep their objects', () => {
    const next = picture()
    next.tasks = [next.tasks[2], next.tasks[0]]
    const merged = reconcileSnapshot(current, next)
    expect(merged.tasks).not.toBe(current.tasks)
    expect(merged.tasks.map((row) => row.id)).toEqual(['c', 'a'])
    expect(merged.tasks[0]).toBe(current.tasks[2])
    expect(merged.tasks[1]).toBe(current.tasks[0])
  })

  it('the first picture is taken as it is', () => {
    const first = picture()
    expect(reconcileSnapshot(null, first)).toBe(first)
  })
})
