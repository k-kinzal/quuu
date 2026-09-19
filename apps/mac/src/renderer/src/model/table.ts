import { columnProfiles, tableMetrics } from '@design-system/react/layout-spec'
import type { Run } from '../../../preload/api/execution.js'
import type { Project } from '../../../preload/api/projects.js'
import type { Priority, Task, TaskStatus } from '../../../preload/api/tasks.js'
import { t } from './i18n/index.js'
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from './labels.js'
import { STATUS_ORDER } from './statusGroups.js'
import { compareText } from './collation.js'

/**
 * The full-width table's "columns" and their sorting/filtering.
 *
 * This file **owns no UI**. It only decides how many columns there are, which
 * direction a click goes next, and which rows remain, so it can be verified
 * without going through React (`tests/tableView.test.ts`).
 *
 * The default order (`sort === null`) is **the same order as the scheduler**
 * (`orderTasks`), grouped by status. When sorting by a column we do not group —
 * grouping *is* "ordering by status", so stacking it on another axis makes the
 * on-screen order diverge from the ↑↓ traversal order.
 */

/* -------------------------------------------------------------- Columns */

export type TaskColumnId = 'mark' | 'title' | 'project' | 'priority' | 'agent' | 'state' | 'lastRun'

export type TaskSortKey = Exclude<TaskColumnId, 'mark'>

export type SortDirection = 'asc' | 'desc'

export interface TaskSort {
  key: TaskSortKey
  direction: SortDirection
}

export interface TaskColumn {
  id: TaskColumnId
  /** Header word. The marker column has none */
  label: string
  /** Default width. User-changed widths are kept separately */
  width: number
  /** Width floor. Stop where values would start disappearing */
  min: number
  /** Sortable columns carry their axis. Columns without one ignore header clicks */
  sortKey?: TaskSortKey
  /**
   * The filter axis, if this column can filter.
   *
   * **Axes map 1:1 to columns.** Filtering on an axis the table doesn't show
   * makes it unreadable why rows disappeared. Conversely, that a column can
   * filter is discoverable from its header's right-click (rule N-2).
   */
  filterAxis?: FilterAxis
  resizable: boolean
  /** Direction of the first click. Only timestamps start from "newest first" */
  defaultDirection: SortDirection
  /** Hidden while a project is open (the path already answers it) */
  crossProjectOnly?: boolean
}

/**
 * Column definitions. Default widths were decided on the real screen
 * (`docs/02-ui-design.md` §6.1). The marker column is
 * left padding 16 + marker 10 + right padding 8 = 34px; narrower clips the marker.
 */
export const TASK_COLUMNS: TaskColumn[] = [
  {
    id: 'mark',
    label: '',
    ...columnProfiles.marker,
    // The marker is the status itself, so it filters on the status axis
    filterAxis: 'status',
    resizable: false,
    defaultDirection: 'asc'
  },
  {
    id: 'title',
    label: t('table.column.title'),
    ...columnProfiles.title,
    sortKey: 'title',
    resizable: true,
    defaultDirection: 'asc'
  },
  {
    id: 'project',
    label: t('table.column.project'),
    ...columnProfiles.label,
    sortKey: 'project',
    filterAxis: 'project',
    resizable: true,
    defaultDirection: 'asc',
    crossProjectOnly: true
  },
  {
    id: 'priority',
    label: t('table.column.priority'),
    ...columnProfiles.ordinal,
    sortKey: 'priority',
    filterAxis: 'priority',
    resizable: true,
    defaultDirection: 'asc'
  },
  {
    id: 'agent',
    label: t('table.column.agent'),
    ...columnProfiles.target,
    sortKey: 'agent',
    filterAxis: 'target',
    resizable: true,
    defaultDirection: 'asc'
  },
  {
    id: 'state',
    label: t('table.column.state'),
    ...columnProfiles.state,
    sortKey: 'state',
    filterAxis: 'status',
    resizable: true,
    defaultDirection: 'asc'
  },
  {
    id: 'lastRun',
    label: t('table.column.lastRun'),
    ...columnProfiles.timestamp,
    sortKey: 'lastRun',
    // Timestamps start from "newest first". There is no reason to read oldest first
    defaultDirection: 'desc',
    resizable: true
  }
]

/** Cap so widening one column can't push the others off screen. */
export const COLUMN_MAX_WIDTH = tableMetrics.maximumWidth

export type ColumnWidths = Partial<Record<TaskColumnId, number>>

const COLUMN_BY_ID = new Map(TASK_COLUMNS.map((c) => [c.id, c]))

export function taskColumn(id: TaskColumnId): TaskColumn {
  const column = COLUMN_BY_ID.get(id)
  if (!column) throw new Error(`Unknown column: ${id}`)
  return column
}

/** The column's effective width. Falls back to the default even if the saved value is broken. */
export function columnWidth(id: TaskColumnId, widths: ColumnWidths): number {
  const column = taskColumn(id)
  const saved = widths[id]
  if (saved === undefined || !Number.isFinite(saved)) return column.width
  return Math.round(Math.min(COLUMN_MAX_WIDTH, Math.max(column.min, saved)))
}

/** Columns shown in this context. Drop the project column while a project is open. */
export function visibleColumns(crossProject: boolean): TaskColumn[] {
  return TASK_COLUMNS.filter((c) => crossProject || !c.crossProjectOnly)
}

/**
 * Next state when the header is clicked.
 *
 * Cycle of three: ascending → descending → **back to default**.
 * Without the way back, the queue order (what runs next) becomes unviewable.
 */
export function nextSort(current: TaskSort | null, key: TaskSortKey): TaskSort | null {
  const column = taskColumn(key)
  if (!current || current.key !== key) return { key, direction: column.defaultDirection }
  if (current.direction === column.defaultDirection) {
    return { key, direction: column.defaultDirection === 'asc' ? 'desc' : 'asc' }
  }
  return null
}

/* -------------------------------------------------------------- Sorting */

export interface TableContext {
  projects: Map<string, Project>
  /** Latest Run per task */
  runs: Map<string, Run>
  /** Name shown in the list's agent column. With a Run, the actually assigned agent */
  agentLabel(task: Task): string
  /** Identifier for the list's agent column (the filter value) */
  agentKey(task: Task): string
}

const STATUS_RANK = new Map(STATUS_ORDER.map((s, i) => [s, i]))

function runTime(run: Run | undefined): number {
  if (!run) return 0
  return Date.parse(run.endedAt ?? run.startedAt) || 0
}

function compare(a: Task, b: Task, key: TaskSortKey, ctx: TableContext): number {
  switch (key) {
    case 'title':
      return compareText(a.title, b.title)
    case 'project':
      return compareText(
        ctx.projects.get(a.projectId)?.name ?? '',
        ctx.projects.get(b.projectId)?.name ?? ''
      )
    case 'priority':
      return a.priority - b.priority
    case 'agent':
      return compareText(ctx.agentLabel(a), ctx.agentLabel(b))
    case 'state':
      return (STATUS_RANK.get(a.status) ?? 99) - (STATUS_RANK.get(b.status) ?? 99)
    case 'lastRun':
      return runTime(ctx.runs.get(a.id)) - runTime(ctx.runs.get(b.id))
  }
}

/**
 * Sort by a column.
 *
 * Assumes the input is **already in default order** (passed through `orderTasks`).
 * `Array.prototype.sort` is stable, so equal values keep the default order, and
 * we never create "sorted by priority, but ties reshuffle every time".
 */
export function sortTasksBy(tasks: Task[], sort: TaskSort, ctx: TableContext): Task[] {
  const sign = sort.direction === 'asc' ? 1 : -1
  return [...tasks].sort((a, b) => sign * compare(a, b, sort.key, ctx))
}

/* ------------------------------------------------------------ Filtering */

/**
 * Filter axes. **1:1 with columns** (`TaskColumn.filterAxis`).
 *
 * Each axis has a different type (status, id, number), so values are held as
 * strings and converted back only at the boundary (`filterValues` /
 * `setFilterValues`). That way the entry points (chips, header right-click)
 * can handle every axis in the same shape without knowing it.
 */
export type FilterAxis = 'status' | 'project' | 'priority' | 'target'

export const AXIS_LABEL: Record<FilterAxis, string> = {
  status: t('table.axis.status'),
  project: t('table.axis.project'),
  priority: t('table.axis.priority'),
  target: t('table.axis.target')
}

export interface TaskFilters {
  statuses: TaskStatus[]
  projectIds: string[]
  priorities: Priority[]
  /** Identifiers of execution targets (agents / groups) */
  targets: string[]
  /**
   * Whether done tasks are in scope. **Also owned by the status axis** (not a
   * button outside the table).
   *
   * Unlike the other axes it widens the scope itself rather than selecting
   * values. Done tasks only accumulate, so mixing them in by default buries the
   * list in the past and hides what is moving now. It is still "how to treat
   * status", though, so its entry point sits with the status filter
   * (header right-click and the chip).
   */
  includeDone: boolean
}

export const NO_FILTERS: TaskFilters = {
  statuses: [],
  projectIds: [],
  priorities: [],
  targets: [],
  includeDone: false
}

/** An empty array means "all". How many axes are filtering. */
export function activeFilterCount(filters: TaskFilters): number {
  return [filters.statuses, filters.projectIds, filters.priorities, filters.targets].filter(
    (v) => v.length > 0
  ).length
}

export function hasFilters(filters: TaskFilters): boolean {
  return activeFilterCount(filters) > 0
}

/**
 * Whether the filters have moved off the default.
 *
 * **Including done counts too.** It isn't an axis value, but it is equally a
 * non-default view; not counting it creates a "done stays mixed in with no way
 * back" state.
 */
export function filtersChanged(filters: TaskFilters): boolean {
  return hasFilters(filters) || filters.includeDone
}

/**
 * Whether the table view has drifted from the default (whether to show "reset view").
 *
 * **Widths count too.** Without an entry point to undo a widened column, there
 * is no way back unless you remember the handle. Resetting a width forgets the
 * value instead of writing one (the `widths` key disappears), so key presence
 * alone decides.
 */
export function isTableViewDirty(
  sort: TaskSort | null,
  widths: ColumnWidths,
  filters: TaskFilters
): boolean {
  return sort !== null || Object.keys(widths).length > 0 || filtersChanged(filters)
}

/** Toggle a selection. One of these is all a menu item needs. */
export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/** Values currently selected on an axis. Per-axis type differences flatten to strings here. */
export function filterValues(filters: TaskFilters, axis: FilterAxis): string[] {
  switch (axis) {
    case 'status':
      return filters.statuses
    case 'project':
      return filters.projectIds
    case 'priority':
      return filters.priorities.map(String)
    case 'target':
      return filters.targets
  }
}

/** Replace an axis's values. **The axis-to-field mapping stays closed in this one place.** */
export function setFilterValues(
  filters: TaskFilters,
  axis: FilterAxis,
  values: string[]
): TaskFilters {
  switch (axis) {
    case 'status':
      return { ...filters, statuses: values as TaskStatus[] }
    case 'project':
      return { ...filters, projectIds: values }
    case 'priority':
      return { ...filters, priorities: values.map(Number) as Priority[] }
    case 'target':
      return { ...filters, targets: values }
  }
}

export function applyFilters(tasks: Task[], filters: TaskFilters, ctx: TableContext): Task[] {
  const { statuses, projectIds, priorities, targets } = filters
  if (!hasFilters(filters)) return tasks
  return tasks.filter(
    (t) =>
      (statuses.length === 0 || statuses.includes(t.status)) &&
      (projectIds.length === 0 || projectIds.includes(t.projectId)) &&
      (priorities.length === 0 || priorities.includes(t.priority)) &&
      (targets.length === 0 || targets.includes(ctx.agentKey(t)))
  )
}

/* ------------------------------------------------------- Filter options */

export interface FilterOption {
  value: string
  label: string
  count: number
}

/**
 * Options are built from **only what is currently present**.
 *
 * Listing every defined value mixes in items that can only yield 0 rows.
 * The counts are attached so "is filtering worth it" is readable before opening.
 */
function options<K extends string>(
  tasks: Task[],
  key: (task: Task) => K,
  label: (value: K) => string,
  order?: readonly K[]
): FilterOption[] {
  const counts = new Map<K, number>()
  for (const task of tasks) {
    const k = key(task)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const keys = order
    ? order.filter((k) => counts.has(k))
    : [...counts.keys()].sort((a, b) => compareText(label(a), label(b)))
  return keys.map((k) => ({ value: k, label: label(k), count: counts.get(k) ?? 0 }))
}

function statusOptions(tasks: Task[]): FilterOption[] {
  return options(
    tasks,
    (t) => t.status,
    (s) => TASK_STATUS_LABEL[s],
    STATUS_ORDER
  )
}

function projectOptions(tasks: Task[], projects: Map<string, Project>): FilterOption[] {
  return options(
    tasks,
    (t) => t.projectId,
    (id) => projects.get(id)?.name ?? t('table.deletedProject')
  )
}

const PRIORITY_ORDER = ['0', '1', '2', '3'] as const

function priorityOptions(tasks: Task[]): FilterOption[] {
  return options(
    tasks,
    (t) => String(t.priority) as (typeof PRIORITY_ORDER)[number],
    (p) => PRIORITY_LABEL[Number(p) as Priority],
    PRIORITY_ORDER
  )
}

function targetOptions(tasks: Task[], ctx: TableContext): FilterOption[] {
  const labels = new Map<string, string>()
  for (const task of tasks) labels.set(ctx.agentKey(task), ctx.agentLabel(task))
  return options(
    tasks,
    (t) => ctx.agentKey(t),
    (key) => labels.get(key) ?? key
  )
}

/**
 * Options for an axis. Entry points (chips, header right-click) only pass the axis.
 * Exposing the per-axis counting differences would copy the same branching into
 * every new entry point.
 */
export function filterOptions(axis: FilterAxis, tasks: Task[], ctx: TableContext): FilterOption[] {
  switch (axis) {
    case 'status':
      return statusOptions(tasks)
    case 'project':
      return projectOptions(tasks, ctx.projects)
    case 'priority':
      return priorityOptions(tasks)
    case 'target':
      return targetOptions(tasks, ctx)
  }
}

/**
 * Value shown at a filter's entry point.
 * One selection shows the name, several show "first +n", so what was filtered
 * is readable without opening.
 */
export function selectionLabel(selected: string[], all: FilterOption[]): string | undefined {
  if (selected.length === 0) return undefined
  const head = all.find((o) => o.value === selected[0])?.label ?? selected[0]
  return selected.length === 1 ? head : `${head} +${selected.length - 1}`
}

/**
 * Value shown at an axis's entry point (the chip).
 *
 * Even with no value selected, **that done is included must be readable**.
 * If the scope widened but the entry point still says "all", the reason the
 * count grew disappears from the screen.
 */
export function axisValue(
  axis: FilterAxis,
  filters: TaskFilters,
  options: FilterOption[]
): string | undefined {
  const label = selectionLabel(filterValues(filters, axis), options)
  if (label !== undefined) return label
  return axis === 'status' && filters.includeDone ? t('table.includeDone') : undefined
}
