import { useEffect, useMemo } from 'react'
import type { TaskRule } from '../../../api/schemas/automation.js'
import type { Task } from '../../../api/schemas/tasks.js'
import type { ScopeFilter, TaskGroup } from '../model/derive.js'
import { latestRunMap, projectMap, recentlyDone, scopeTasks, sortTasks, taskAgentKey, taskAgentLabel } from '../model/derive.js'
import { loadedCount } from '../model/paging.js'
import { groupByStatus } from '../model/statusGroups.js'
import type { TableContext } from '../model/table.js'
import { applyFilters, hasFilters, sortTasksBy, titleMatches } from '../model/table.js'
import { useStore } from '../state/store.js'

export interface TaskView {
  /**
   * The tasks **in the order L1 is displaying them right now**.
   *
   * The screen groups by status, so the raw sort rule (by priority) would make ↑↓ jump in
   * an order different from what is on screen. Movement order must always match display order.
   */
  ordered: Task[]
  /**
   * How many rows the filters let through. More than `ordered` holds while the Done section
   * has pages left to load; the count a heading shows is this one, not what is loaded so far.
   */
  matched: number
  /** Whether rows past `ordered` are waiting to load (the Done section only, `model/paging.ts`). */
  hasMore: boolean
  /** Definitions follow all task rows, independent of the task sort and status filter. */
  rules: TaskRule[]
  /**
   * The status groups. **`null` while sorting by a column.**
   *
   * Grouping IS "ordering by status", so layering another axis on top drifts the on-screen
   * order apart from `ordered`. Once sorted, the groups collapse.
   */
  groups: TaskGroup[] | null
  /** The count before filtering (the section's scope). */
  total: number
  /**
   * How many done tasks are hidden outside the scope.
   *
   * Done isn't in scope by default, so **a surface where everything is done looks like "0"**.
   * Unless the screen can say something is hidden, there's no way back to the entry point
   * that brings it back.
   */
  doneHidden: number
  /** Whether filtering has reduced it. */
  narrowed: boolean
  /** Value lookup. Shared by row rendering and by building the filter options. */
  context: TableContext
  /** The set the filter options are built from (before filtering). */
  candidates: Task[]
}

/** The scope a section points at. */
function useScopeFilter(): ScopeFilter {
  const section = useStore((s) => s.section)
  /* Whether done is included belongs to the filters. This is the only place that hands it to the scope */
  const includeDone = useStore((s) => s.filters.includeDone)

  return useMemo(
    () => ({
      kind: section.kind === 'settings' ? 'all' : section.kind,
      projectId: section.kind === 'project' ? section.id : undefined,
      showDone: includeDone
    }),
    [section, includeDone]
  )
}

/**
 * Everything the list shows. **The table and the sidebar must both go through this.**
 *
 * Compute display order, grouping, or counts in two places and ↑↓ starts jumping in an
 * order different from the screen.
 */
export function useTaskView(): TaskView {
  const snapshot = useStore((s) => s.snapshot)
  const filters = useStore((s) => s.filters)
  const sort = useStore((s) => s.table.sort)
  const doneLoaded = useStore((s) => s.doneLoaded)
  const cursorTaskId = useStore((s) => s.cursorTaskId)
  const loadMoreDone = useStore((s) => s.loadMoreDone)
  const scope = useScopeFilter()

  const projects = useMemo(() => projectMap(snapshot?.projects ?? []), [snapshot?.projects])
  const runs = useMemo(() => latestRunMap(snapshot?.runs ?? []), [snapshot?.runs])

  const context = useMemo<TableContext>(
    () => ({
      projects,
      projectRecentRunCounts: snapshot?.projectRecentRunCounts,
      runs,
      agentLabel: (task) =>
        snapshot
          ? taskAgentLabel(snapshot, task, projects.get(task.projectId), runs.get(task.id))
          : '—',
      agentKey: (task) => taskAgentKey(task, projects.get(task.projectId), runs.get(task.id))
    }),
    [projects, runs, snapshot]
  )

  /*
   * The scope in its default order. This is the only place that goes through `orderTasks`.
   * Done waits on nothing, so the queue order says nothing there: it goes newest first
   */
  const inScope = useMemo(() => {
    if (!snapshot) return []
    const scoped = scopeTasks(snapshot, scope)
    return scope.kind === 'done' ? recentlyDone(scoped) : sortTasks(scoped, projects)
  }, [projects, scope, snapshot])

  /* How many done tasks are hidden. No sorting involved (it only counts) */
  const doneHidden = useMemo(() => {
    if (scope.showDone || !snapshot) return 0
    return scopeTasks(snapshot, { ...scope, showDone: true }).length - inScope.length
  }, [inScope.length, scope, snapshot])

  const listed = useMemo(() => {
    const matched = applyFilters(inScope, filters, context)

    /*
     * No grouping while sorting. Grouping would drift the on-screen order apart from `ordered`.
     * Nor in Done: every row has the one status, and the heading already says which
     */
    const groups = sort || scope.kind === 'done' ? null : groupByStatus(matched)
    const sorted = sort ? sortTasksBy(matched, sort, context) : groups ? groups.flatMap((g) => g.tasks) : matched
    return { matched, groups, sorted }
  }, [context, filters, inScope, scope.kind, sort])

  /*
   * Done is loaded a page at a time. Every other scope is bounded by work still open, so it is
   * drawn whole — and stays out of the cursor's way, so ↑↓ there rebuilds nothing
   */
  const shown =
    scope.kind === 'done' ? loadedCount(listed.sorted, doneLoaded, cursorTaskId) : listed.sorted.length

  const view = useMemo(() => {
    const { matched, groups, sorted } = listed
    const ordered = shown < sorted.length ? sorted.slice(0, shown) : sorted

    return {
      ordered,
      matched: matched.length,
      hasMore: ordered.length < sorted.length,
      rules: (snapshot?.rules ?? []).filter((rule) =>
        scope.kind !== 'review' && scope.kind !== 'done' && projects.has(rule.projectId) &&
        (scope.kind === 'project' ? rule.projectId === scope.projectId :
          filters.projectIds.length === 0 || filters.projectIds.includes(rule.projectId)) &&
        // A recurring row shows its name in the title column, so the name query reads it too
        titleMatches(rule.name, filters.query)
      ),
      groups,
      total: inScope.length,
      doneHidden,
      narrowed: matched.length !== inScope.length || hasFilters(filters),
      context,
      candidates: inScope
    }
  }, [context, doneHidden, filters, inScope, listed, projects, scope, shown, snapshot?.rules])

  /* A highlight reached past the loaded part (palette, notification, back) stays loaded from then on */
  useEffect(() => {
    if (scope.kind === 'done' && shown > doneLoaded) loadMoreDone(shown)
  }, [doneLoaded, loadMoreDone, scope.kind, shown])

  return view
}

/** The entry point for places that need only the display order (keyboard movement, advancing to the next task). */
export function useOrderedTasks(): Task[] {
  return useTaskView().ordered
}
