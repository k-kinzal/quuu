// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Agent } from '../src/main/agents/types.js'
import type { AppSnapshot } from '../src/main/snapshot.js'
import type { Project } from '../src/main/projects/types.js'
import type { Run } from '../src/main/execution/types.js'
import type { Task } from '../src/main/tasks/types.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { useTaskView } from '../src/renderer/src/interaction/useTasks.js'
import { DONE_PAGE_SIZE, loadedCount, nearEnd } from '../src/renderer/src/model/paging.js'
import { filterOptions, NO_FILTERS } from '../src/renderer/src/model/table.js'

/**
 * Everything the list shows is decided in one place by `useTaskView`.
 * What is checked here is that **the screen order and the arrow-key order agree**.
 * If they drift, the flow of "check the task that moved, then go to the next" breaks.
 */

function task(over: Partial<Task> & { id: string }): Task {
  return {
    projectId: 'p1',
    title: over.id,
    prompt: '',
    status: 'queued',
    priority: 2,
    seq: 0,
    scheduledAt: null,
    currentRunId: null,
    sessionId: null,
    agentOverrideId: null,
    pendingMessage: '',
    reservedMessage: '',
    reviewNote: '',
    dependsOn: [],
    source: 'user',
    ruleId: null,
    externalKey: null,
    archived: false,
    createdAt: '',
    updatedAt: '',
    doneAt: null,
    ...over
  }
}

function project(id: string, name: string): Project {
  return {
    id,
    name,
    path: '/tmp',
    color: '#fff',
    priority: 2,
    targetKind: 'agent',
    targetId: null,
    maxConcurrent: 1,
    enabled: true,
    deletedAt: null,
    importSince: null, worktreeMode: 'inherit', taskHooks: [],
    editorApp: '',
    reportEnabled: true,
    pullRequestPromptMode: 'inherit', pullRequestFailurePrompt: '', pullRequestPendingPrompt: '', pullRequestConflictPrompt: '', pullRequestFailureEnabled: false, pullRequestPendingEnabled: false, pullRequestConflictEnabled: false,
    commitIdentityMode: 'inherit',
    commitIdentity: { appSlug: '', botUserId: '' },
    builtIn: false, source: 'user',
    sortOrder: 0,
    createdAt: '',
    updatedAt: ''
  }
}

function agent(id: string, name: string): Agent {
  return {
    id,
    name,
    description: '',
    command: 'true',
    argsTemplate: [],
    resumeArgsTemplate: [],
    env: {},
    concurrency: 1,
    fallbackAgentId: null,
    limitPatterns: [],
    cooldownSeconds: 0,
    timeoutSeconds: 0,
    logAdapter: 'stdout',
    enabled: true,
    source: 'user',
    sortOrder: 0,
    createdAt: '',
    updatedAt: ''
  }
}

function run(taskId: string, agentId: string): Run {
  return {
    id: `run-${taskId}`,
    taskId,
    agentId,
    resolvedFromGroupId: 'g1',
    sessionId: '',
    kind: 'initial',
    status: 'running',
    attempt: 1,
    fallbackFromRunId: null,
    pid: null,
    cwd: '/tmp',
    command: 'true',
    args: [],
    promptPreview: '',
    exitCode: null,
    errorKind: null,
    errorMessage: '',
    sessionLogPath: null,
    stdoutLogPath: '',
    source: 'user',
    externalKey: null,
    startedAt: '2026-08-24T00:00:00.000Z',
    endedAt: null
  }
}

const TASKS = [
  task({ id: 'r1', title: 'そ', status: 'review', priority: 2, seq: 1 }),
  task({ id: 'q1', title: 'あ', status: 'queued', priority: 0, seq: 2 }),
  task({ id: 'q2', title: 'か', status: 'queued', priority: 3, seq: 3, projectId: 'p2' }),
  task({ id: 'd1', title: 'ん', status: 'draft', priority: 2, seq: 4 }),
  task({ id: 'x1', title: 'こ', status: 'done', priority: 2, seq: 5 })
]

const SNAPSHOT: AppSnapshot = {
  projects: [project('p1', 'alpha'), project('p2', 'beta')],
  tasks: TASKS,
  rules: [],
  agents: [],
  groups: [],
  runs: [],
  scheduler: {
    running: true,
    activeRuns: 0,
    totalSlots: 1,
    queued: 2,
    review: 1,
    failed: 0,
    agents: [],
    holds: [],
    warnings: [],
    lastTickAt: null
  }
}

beforeEach(() => {
  useStore.setState({
    snapshot: SNAPSHOT,
    section: { kind: 'all' },
    filters: NO_FILTERS,
    table: { sort: null, widths: {} },
    cursorTaskId: null,
    doneLoaded: DONE_PAGE_SIZE
  })
})

const view = (): ReturnType<typeof useTaskView> => renderHook(() => useTaskView()).result.current

describe('what the list shows', () => {
  it('passes full-history project usage to the filters even when completed tasks are hidden', () => {
    useStore.setState({ snapshot: { ...SNAPSHOT, projectRecentRunCounts: { p1: 2, p2: 8 } } })
    const current = view()
    expect(filterOptions('project', current.candidates, current.context).map(option => option.value)).toEqual(['p2', 'p1'])
  })

  it('shows the agent name actually assigned once it starts through a group', () => {
    const groupProject = {
      ...project('p1', 'alpha'),
      targetKind: 'group' as const,
      targetId: 'g1'
    }
    const moving = task({ id: 'moving', status: 'running', currentRunId: 'run-moving' })
    const waiting = task({ id: 'waiting', status: 'queued' })
    useStore.setState({
      snapshot: {
        ...SNAPSHOT,
        projects: [groupProject],
        tasks: [moving, waiting],
        agents: [agent('opus', 'Claude Opus'), agent('codex', 'Codex')],
        groups: [
          {
            id: 'g1',
            name: 'Opus → Codex',
            description: '',
            strategy: 'priority',
            memberIds: ['opus', 'codex'],
            isDefault: false,
            sortOrder: 0,
            createdAt: '',
            updatedAt: ''
          }
        ],
        runs: [run(moving.id, 'codex')]
      }
    })

    const context = view().context
    expect(context.agentLabel(moving)).toBe('Codex')
    expect(context.agentKey(moving)).toBe('agent:codex')
    // Anything with no Run yet has only the run target it would use next
    expect(context.agentLabel(waiting)).toBe('Opus → Codex')
  })

  it('groups by status by default, and lists in the order the groups are read top to bottom', () => {
    const v = view()
    expect(v.groups?.map((g) => g.status)).toEqual(['review', 'queued', 'draft'])
    expect(v.ordered.map((t) => t.id)).toEqual(v.groups?.flatMap((g) => g.tasks.map((t) => t.id)))
    expect(v.ordered.map((t) => t.id)).toEqual(['r1', 'q1', 'q2', 'd1'])
  })

  it('does not group when sorted by a column (re-grouping would drift from the arrow-key order)', () => {
    useStore.setState({ table: { sort: { key: 'title', direction: 'asc' }, widths: {} } })
    const v = view()
    expect(v.groups).toBeNull()
    expect(v.ordered.map((t) => t.id)).toEqual(['q1', 'q2', 'r1', 'd1'])
  })

  it('reverses the order when the sort direction is flipped', () => {
    useStore.setState({ table: { sort: { key: 'title', direction: 'desc' }, widths: {} } })
    expect(view().ordered.map((t) => t.id)).toEqual(['d1', 'r1', 'q2', 'q1'])
  })

  it('applies the filter to the display order too, while the denominator stays the pre-filter count', () => {
    useStore.setState({ filters: { ...NO_FILTERS, statuses: ['queued'] } })
    const v = view()
    expect(v.ordered.map((t) => t.id)).toEqual(['q1', 'q2'])
    expect(v.total).toBe(4)
    expect(v.narrowed).toBe(true)
  })

  it('does not raise narrowed when nothing is filtered', () => {
    expect(view().narrowed).toBe(false)
  })

  it('builds the filter options from the pre-filter set (it never erases itself)', () => {
    useStore.setState({ filters: { ...NO_FILTERS, statuses: ['queued'] } })
    expect(view().candidates.map((t) => t.id).sort()).toEqual(['d1', 'q1', 'q2', 'r1'])
  })

  it('makes only that project the denominator in a project section', () => {
    useStore.setState({ section: { kind: 'project', id: 'p2' } })
    const v = view()
    expect(v.total).toBe(1)
    expect(v.ordered.map((t) => t.id)).toEqual(['q2'])
  })
})

/**
 * Done belongs to **the filter** (`filters.includeDone`).
 * It is turned on and off from the same place as the status axis, not from a button on the header band.
 */
describe('how done is handled', () => {
  it('leaves it out of range by default, while counting how many are hidden', () => {
    const v = view()
    expect(v.ordered.map((t) => t.id)).not.toContain('x1')
    expect(v.total).toBe(4)
    expect(v.doneHidden).toBe(1)
  })

  it('brings it into the groups and the denominator when the filter includes it', () => {
    useStore.setState({ filters: { ...NO_FILTERS, includeDone: true } })
    const v = view()
    expect(v.groups?.map((g) => g.status)).toEqual(['review', 'queued', 'draft', 'done'])
    expect(v.ordered.map((t) => t.id)).toEqual(['r1', 'q1', 'q2', 'd1', 'x1'])
    expect(v.total).toBe(5)
    // It is in range now, so nothing is hidden any more
    expect(v.doneHidden).toBe(0)
  })

  it('can narrow to done alone once it is included (picking a value works inside the range)', () => {
    useStore.setState({ filters: { ...NO_FILTERS, includeDone: true, statuses: ['done'] } })
    const v = view()
    expect(v.ordered.map((t) => t.id)).toEqual(['x1'])
    expect(v.narrowed).toBe(true)
  })

  it('adds nothing when narrowing to done without including it (it is outside the range)', () => {
    useStore.setState({ filters: { ...NO_FILTERS, statuses: ['done'] } })
    expect(view().ordered).toHaveLength(0)
  })

  it('rewrites the filter on toggle, dropping the leftover "done" selection when it goes off', () => {
    useStore.setState({ filters: { ...NO_FILTERS, statuses: ['queued'] } })
    useStore.getState().toggleShowDone()
    expect(useStore.getState().filters).toMatchObject({
      includeDone: true,
      statuses: ['queued']
    })

    useStore.setState({ filters: { ...NO_FILTERS, includeDone: true, statuses: ['queued', 'done'] } })
    useStore.getState().toggleShowDone()
    expect(useStore.getState().filters).toMatchObject({
      includeDone: false,
      statuses: ['queued']
    })
  })

  it('keeps the hidden count even on a surface where everything is done (it is the grounds for the band)', () => {
    useStore.setState({
      snapshot: { ...SNAPSHOT, tasks: [task({ id: 'x2', status: 'done', projectId: 'p2' })] },
      section: { kind: 'project', id: 'p2' }
    })
    const v = view()
    expect(v.total).toBe(0)
    expect(v.doneHidden).toBe(1)
  })

  it('takes done out of range too with "reset display"', () => {
    useStore.setState({ filters: { ...NO_FILTERS, includeDone: true } })
    useStore.getState().resetTableView()
    expect(useStore.getState().filters.includeDone).toBe(false)
  })
})

/**
 * The Done section: only finished work, newest first, a page at a time.
 * Toggling "include done" on another list is not how a person goes looking for what they finished.
 */
describe('the Done section', () => {
  /** `n` done tasks, `done-0` finished most recently. */
  const finished = (n: number): Task[] =>
    Array.from({ length: n }, (_, i) =>
      task({
        id: `done-${i}`,
        status: 'done',
        projectId: i % 2 === 0 ? 'p1' : 'p2',
        doneAt: new Date(Date.UTC(2026, 0, 1) - i * 60_000).toISOString()
      })
    )

  it('lists only done tasks from every project, the most recently done first, without groups', () => {
    const older = task({ id: 'older', status: 'done', doneAt: '2026-01-01T00:00:00.000Z' })
    const newer = task({ id: 'newer', status: 'done', projectId: 'p2', doneAt: '2026-01-02T00:00:00.000Z' })
    // Done before the time was recorded: goes by its last update, the time its row shows
    const unstamped = task({ id: 'unstamped', status: 'done', updatedAt: '2025-12-31T00:00:00.000Z' })
    useStore.setState({
      snapshot: { ...SNAPSHOT, tasks: [...TASKS, older, unstamped, newer] },
      section: { kind: 'done' }
    })
    const v = view()
    expect(v.ordered.map((t) => t.id)).toEqual(['newer', 'older', 'unstamped', 'x1'])
    // Every row has the one status; a header saying it again is noise
    expect(v.groups).toBeNull()
    expect(v.rules).toEqual([])
    expect(v.doneHidden).toBe(0)
  })

  it('draws one page, counts every match, and grows a page at a time to the end', () => {
    useStore.setState({ snapshot: { ...SNAPSHOT, tasks: finished(120) }, section: { kind: 'done' } })
    let v = view()
    expect(v.ordered).toHaveLength(DONE_PAGE_SIZE)
    expect(v.ordered[0].id).toBe('done-0')
    expect(v.matched).toBe(120)
    expect(v.total).toBe(120)
    expect(v.hasMore).toBe(true)

    useStore.getState().loadMoreDone(DONE_PAGE_SIZE * 2)
    v = view()
    expect(v.ordered).toHaveLength(DONE_PAGE_SIZE * 2)
    expect(v.hasMore).toBe(true)

    useStore.getState().loadMoreDone()
    v = view()
    expect(v.ordered).toHaveLength(120)
    expect(v.hasMore).toBe(false)
  })

  it('never shrinks what is loaded when asked for less', () => {
    useStore.getState().loadMoreDone(DONE_PAGE_SIZE * 3)
    useStore.getState().loadMoreDone(DONE_PAGE_SIZE)
    expect(useStore.getState().doneLoaded).toBe(DONE_PAGE_SIZE * 3)
  })

  it('keeps a highlighted task past the loaded page on screen, and loaded once the highlight moves on', () => {
    useStore.setState({
      snapshot: { ...SNAPSHOT, tasks: finished(120) },
      section: { kind: 'done' },
      cursorTaskId: 'done-80'
    })
    const { result } = renderHook(() => useTaskView())
    expect(result.current.ordered).toHaveLength(81)
    expect(useStore.getState().doneLoaded).toBe(81)

    // Moving back up does not pull rows out from under the reader
    act(() => useStore.setState({ cursorTaskId: 'done-0' }))
    expect(result.current.ordered).toHaveLength(81)
  })

  it('starts from the first page again on arriving from another section', () => {
    useStore.setState({ snapshot: { ...SNAPSHOT, tasks: finished(120) }, doneLoaded: 120 })
    useStore.getState().setSection({ kind: 'done' })
    expect(useStore.getState().doneLoaded).toBe(DONE_PAGE_SIZE)
    expect(view().ordered).toHaveLength(DONE_PAGE_SIZE)
  })

  it('draws every other section whole, whatever is loaded in Done', () => {
    useStore.setState({ snapshot: { ...SNAPSHOT, tasks: finished(120) }, filters: { ...NO_FILTERS, includeDone: true } })
    const v = view()
    expect(v.ordered).toHaveLength(120)
    expect(v.hasMore).toBe(false)
  })
})

describe('paging', () => {
  const rows = ['a', 'b', 'c', 'd'].map((id) => ({ id }))

  it('counts what is loaded, never past the end', () => {
    expect(loadedCount(rows, 2, null)).toBe(2)
    expect(loadedCount(rows, 10, null)).toBe(4)
  })

  it('stretches to the highlighted row, and ignores one that is not in the list', () => {
    expect(loadedCount(rows, 1, 'c')).toBe(3)
    expect(loadedCount(rows, 1, 'gone')).toBe(1)
  })

  it('asks for more within a screenful of the end', () => {
    expect(nearEnd({ scrollTop: 0, clientHeight: 500, scrollHeight: 2000 })).toBe(false)
    expect(nearEnd({ scrollTop: 1000, clientHeight: 500, scrollHeight: 2000 })).toBe(true)
    // Content shorter than the pane: nothing to scroll, so the next page has to come unasked
    expect(nearEnd({ scrollTop: 0, clientHeight: 500, scrollHeight: 300 })).toBe(true)
  })

  it('never asks from a pane with no height (it would pull in every page)', () => {
    expect(nearEnd({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 })).toBe(false)
  })
})
