import { describe, expect, it } from 'vitest'
import type { Project } from '../src/main/projects/types.js'
import type { Run } from '../src/main/execution/types.js'
import type { Task } from '../src/main/tasks/types.js'
import type { TaskStatus } from '../src/main/tasks/status.js'
import { NO_FILTERS, activeFilterCount, applyFilters, axisValue, columnWidth, filterOptions, filterValues, isTableViewDirty, nextSort, selectionLabel, setFilterValues, sortTasksBy, taskColumn, toggleValue, visibleColumns } from '../src/renderer/src/model/table.js'
import type { TableContext } from '../src/renderer/src/model/table.js'
import { taskAgentKey } from '../src/renderer/src/model/derive.js'

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
    targetId: `agent-${id}`,
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
}

function run(taskId: string, startedAt: string, endedAt: string | null = null): Run {
  return {
    id: `run-${taskId}`,
    taskId,
    agentId: 'a1',
    resolvedFromGroupId: null,
    sessionId: '',
    kind: 'initial',
    status: 'succeeded',
    attempt: 1,
    fallbackFromRunId: null,
    pid: null,
    cwd: '/tmp',
    command: 'true',
    args: [],
    promptPreview: '',
    exitCode: 0,
    errorKind: null,
    errorMessage: '',
    sessionLogPath: '',
    stdoutLogPath: '',
    source: 'user',
    externalKey: null,
    startedAt,
    endedAt
  }
}

const PROJECTS = new Map([
  ['p1', project('p1', 'alpha')],
  ['p2', project('p2', 'beta')]
])

const AGENT_NAME: Record<string, string> = {
  'agent:agent-p1': 'Claude Opus',
  'agent:agent-p2': 'Codex',
  'agent:override': 'Haiku',
  none: '未割り当て'
}

function context(runs: Run[] = []): TableContext {
  const byTask = new Map(runs.map((r) => [r.taskId, r]))
  return {
    projects: PROJECTS,
    runs: byTask,
    agentKey: (t) => taskAgentKey(t, PROJECTS.get(t.projectId), byTask.get(t.id)),
    agentLabel: (t) =>
      AGENT_NAME[taskAgentKey(t, PROJECTS.get(t.projectId), byTask.get(t.id))] ?? '—'
  }
}

const ids = (tasks: Task[]): string[] => tasks.map((t) => t.id)

describe('columns', () => {
  it('a column without a saved width uses the default', () => {
    expect(columnWidth('title', {})).toBe(taskColumn('title').width)
  })

  it('saved widths are clamped to min and max (a broken value cannot make a column vanish)', () => {
    expect(columnWidth('title', { title: 10 })).toBe(taskColumn('title').min)
    expect(columnWidth('title', { title: 99_999 })).toBe(720)
    expect(columnWidth('title', { title: Number.NaN })).toBe(taskColumn('title').width)
  })

  it('hides the project column while a project is open', () => {
    expect(visibleColumns(true).map((c) => c.id)).toContain('project')
    expect(visibleColumns(false).map((c) => c.id)).not.toContain('project')
  })

  it('filter axes map 1-to-1 to columns (filtering by an axis absent from the table hides why rows disappeared)', () => {
    const axes = visibleColumns(true).map((c) => [c.id, c.filterAxis])
    expect(axes).toEqual([
      ['mark', 'status'],
      ['title', undefined],
      ['project', 'project'],
      ['priority', 'priority'],
      ['agent', 'target'],
      ['state', 'status'],
      ['lastRun', undefined]
    ])
  })
})

describe('table view state', () => {
  it('axis values round-trip through set and get in the same shape', () => {
    const withStatus = setFilterValues(NO_FILTERS, 'status', ['review', 'failed'])
    expect(withStatus.statuses).toEqual(['review', 'failed'])
    expect(filterValues(withStatus, 'status')).toEqual(['review', 'failed'])

    // Priority is stored as numbers, but the entry point deals in strings
    const withPriority = setFilterValues(NO_FILTERS, 'priority', ['0', '2'])
    expect(withPriority.priorities).toEqual([0, 2])
    expect(filterValues(withPriority, 'priority')).toEqual(['0', '2'])
  })

  it('replacing one axis leaves the others intact', () => {
    const both = setFilterValues(
      setFilterValues(NO_FILTERS, 'status', ['review']),
      'project',
      ['p1']
    )
    expect(filterValues(both, 'status')).toEqual(['review'])
    expect(filterValues(setFilterValues(both, 'status', []), 'project')).toEqual(['p1'])
  })

  it('shows no "reset" entry point while everything is at the default', () => {
    expect(isTableViewDirty(null, {}, NO_FILTERS)).toBe(false)
  })

  it('shows "reset" once any one of sort, column widths, or filters is touched', () => {
    expect(isTableViewDirty({ key: 'title', direction: 'asc' }, {}, NO_FILTERS)).toBe(true)
    expect(isTableViewDirty(null, { title: 300 }, NO_FILTERS)).toBe(true)
    expect(isTableViewDirty(null, {}, { ...NO_FILTERS, statuses: ['review'] })).toBe(true)
  })

  it('including done also counts as "touched" (so it cannot get stuck mixed in with no way back)', () => {
    expect(isTableViewDirty(null, {}, { ...NO_FILTERS, includeDone: true })).toBe(true)
    // Not an axis value, so it does not count toward the number of active axes
    expect(activeFilterCount({ ...NO_FILTERS, includeDone: true })).toBe(0)
  })
})

describe('sort cycle', () => {
  it('each press cycles ascending → descending → back to default', () => {
    const first = nextSort(null, 'title')
    expect(first).toEqual({ key: 'title', direction: 'asc' })
    const second = nextSort(first, 'title')
    expect(second).toEqual({ key: 'title', direction: 'desc' })
    expect(nextSort(second, 'title')).toBeNull()
  })

  it('time columns start with newest first', () => {
    expect(nextSort(null, 'lastRun')).toEqual({ key: 'lastRun', direction: 'desc' })
    expect(nextSort({ key: 'lastRun', direction: 'desc' }, 'lastRun')).toEqual({
      key: 'lastRun',
      direction: 'asc'
    })
  })

  it('pressing another column starts from that column\'s default direction', () => {
    expect(nextSort({ key: 'title', direction: 'desc' }, 'priority')).toEqual({
      key: 'priority',
      direction: 'asc'
    })
  })
})

describe('sorting by column', () => {
  const tasks = [
    task({ id: 'a', title: 'あ', priority: 2, projectId: 'p2', status: 'review' }),
    task({ id: 'b', title: 'い', priority: 0, projectId: 'p1', status: 'queued' }),
    task({ id: 'c', title: 'う', priority: 1, projectId: 'p1', status: 'failed' })
  ]

  it('priority sorts by number ascending (P0 first)', () => {
    expect(ids(sortTasksBy(tasks, { key: 'priority', direction: 'asc' }, context()))).toEqual([
      'b',
      'c',
      'a'
    ])
  })

  it('flipping the direction reverses the order', () => {
    expect(ids(sortTasksBy(tasks, { key: 'priority', direction: 'desc' }, context()))).toEqual([
      'a',
      'c',
      'b'
    ])
  })

  it('equal values keep the default order they came in (they do not swap on every sort)', () => {
    const same = [
      task({ id: 'x', priority: 2 }),
      task({ id: 'y', priority: 2 }),
      task({ id: 'z', priority: 2 })
    ]
    expect(ids(sortTasksBy(same, { key: 'priority', direction: 'asc' }, context()))).toEqual([
      'x',
      'y',
      'z'
    ])
    expect(ids(sortTasksBy(same, { key: 'priority', direction: 'desc' }, context()))).toEqual([
      'x',
      'y',
      'z'
    ])
  })

  it('last run sorts by finish time; tasks with no run fall to the end', () => {
    const runs = [
      run('a', '2026-08-17T10:00:00.000Z', '2026-08-17T10:05:00.000Z'),
      run('b', '2026-08-17T11:00:00.000Z', '2026-08-17T11:05:00.000Z')
    ]
    expect(ids(sortTasksBy(tasks, { key: 'lastRun', direction: 'desc' }, context(runs)))).toEqual([
      'b',
      'a',
      'c'
    ])
  })

  it('a running run sorts by its start time even though it has not finished', () => {
    const runs = [
      run('a', '2026-08-17T12:00:00.000Z', null),
      run('b', '2026-08-17T11:00:00.000Z', '2026-08-17T11:05:00.000Z')
    ]
    expect(ids(sortTasksBy(tasks, { key: 'lastRun', direction: 'desc' }, context(runs)))).toEqual([
      'a',
      'b',
      'c'
    ])
  })

  it('projects sort by name', () => {
    expect(ids(sortTasksBy(tasks, { key: 'project', direction: 'asc' }, context()))).toEqual([
      'b',
      'c',
      'a'
    ])
  })

  it('agents sort by the run target\'s name (Claude Opus < Codex)', () => {
    expect(ids(sortTasksBy(tasks, { key: 'agent', direction: 'asc' }, context()))).toEqual([
      'b',
      'c',
      'a'
    ])
  })

  it('state sorts in status display order (review first)', () => {
    expect(ids(sortTasksBy(tasks, { key: 'state', direction: 'asc' }, context()))).toEqual([
      'a',
      'c',
      'b'
    ])
  })
})

describe('filtering', () => {
  const tasks = [
    task({ id: 'a', status: 'review', priority: 0, projectId: 'p1' }),
    task({ id: 'b', status: 'queued', priority: 2, projectId: 'p1' }),
    task({ id: 'c', status: 'review', priority: 2, projectId: 'p2' }),
    task({ id: 'd', status: 'failed', priority: 2, projectId: 'p2', agentOverrideId: 'override' })
  ]

  it('an empty selection means "all"; nothing is dropped', () => {
    expect(applyFilters(tasks, NO_FILTERS, context())).toHaveLength(4)
    expect(activeFilterCount(NO_FILTERS)).toBe(0)
  })

  it('within one axis values are OR (review or failed)', () => {
    const got = applyFilters(tasks, { ...NO_FILTERS, statuses: ['review', 'failed'] }, context())
    expect(ids(got)).toEqual(['a', 'c', 'd'])
  })

  it('across axes it is AND (review and p2)', () => {
    const got = applyFilters(
      tasks,
      { ...NO_FILTERS, statuses: ['review'], projectIds: ['p2'] },
      context()
    )
    expect(ids(got)).toEqual(['c'])
  })

  it('agent looks at the task override before the project assignment', () => {
    const got = applyFilters(tasks, { ...NO_FILTERS, targets: ['agent:override'] }, context())
    expect(ids(got)).toEqual(['d'])
  })

  it('can filter by priority', () => {
    expect(ids(applyFilters(tasks, { ...NO_FILTERS, priorities: [0] }, context()))).toEqual(['a'])
  })

  it('toggling on and off is the same operation both ways', () => {
    const on = toggleValue<TaskStatus>([], 'review')
    expect(on).toEqual(['review'])
    expect(toggleValue(on, 'review')).toEqual([])
  })
})

describe('filter options', () => {
  const tasks = [
    task({ id: 'a', status: 'review', priority: 0, projectId: 'p1' }),
    task({ id: 'b', status: 'review', priority: 2, projectId: 'p2' }),
    task({ id: 'c', status: 'queued', priority: 2, projectId: 'p2' })
  ]

  it('offers only what is actually present, with counts', () => {
    expect(filterOptions('status', tasks, context())).toEqual([
      { value: 'review', label: 'Review', count: 2 },
      { value: 'queued', label: 'Queued', count: 1 }
    ])
  })

  it('options follow the status display order (review first)', () => {
    const reordered = [tasks[2], tasks[0], tasks[1]]
    expect(filterOptions('status', reordered, context()).map((o) => o.value)).toEqual([
      'review',
      'queued'
    ])
  })

  it('project and priority also offer only what is present', () => {
    expect(filterOptions('project', tasks, context()).map((o) => o.label)).toEqual([
      'alpha',
      'beta'
    ])
    expect(filterOptions('priority', tasks, context()).map((o) => o.label)).toEqual(['P0', 'P2'])
  })

  it('agents group by run target', () => {
    expect(filterOptions('target', tasks, context()).map((o) => o.label)).toEqual([
      'Claude Opus',
      'Codex'
    ])
  })

  it('the entry point shows the name for one value, "first +n" for several', () => {
    const options = filterOptions('status', tasks, context())
    expect(selectionLabel([], options)).toBeUndefined()
    expect(selectionLabel(['review'], options)).toBe('Review')
    expect(selectionLabel(['review', 'queued'], options)).toBe('Review +1')
  })

  it('including done shows at the status entry point even with no value selected', () => {
    const options = filterOptions('status', tasks, context())
    expect(axisValue('status', NO_FILTERS, options)).toBeUndefined()
    expect(axisValue('status', { ...NO_FILTERS, includeDone: true }, options)).toBe('Including done')
    // A selected value wins (what you filtered by should read first)
    expect(
      axisValue('status', { ...NO_FILTERS, includeDone: true, statuses: ['review'] }, options)
    ).toBe('Review')
    // Done is a status matter; don't show it at other axes' entry points
    expect(axisValue('priority', { ...NO_FILTERS, includeDone: true }, options)).toBeUndefined()
  })
})
