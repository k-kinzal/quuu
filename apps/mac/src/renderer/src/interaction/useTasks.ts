import { useMemo } from 'react'
import type { TaskRule } from '../../../preload/api/automation.js'
import type { Task } from '../../../preload/api/tasks.js'
import type { ScopeFilter, TaskGroup } from '../model/derive.js'
import { latestRunMap, projectMap, scopeTasks, sortTasks, taskAgentKey, taskAgentLabel } from '../model/derive.js'
import { groupByStatus } from '../model/statusGroups.js'
import type { TableContext } from '../model/table.js'
import { applyFilters, hasFilters, sortTasksBy } from '../model/table.js'
import { useStore } from '../state/store.js'

export interface TaskView {
  /**
   * The tasks **in the order L1 is displaying them right now**.
   *
   * The screen groups by status, so the raw sort rule (by priority) would make ↑↓ jump in
   * an order different from what is on screen. Movement order must always match display order.
   */
  ordered: Task[]
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
      kind: section.kind === 'project' ? 'project' : section.kind === 'review' ? 'review' : 'all',
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
  const scope = useScopeFilter()

  const projects = useMemo(() => projectMap(snapshot?.projects ?? []), [snapshot?.projects])
  const runs = useMemo(() => latestRunMap(snapshot?.runs ?? []), [snapshot?.runs])

  const context = useMemo<TableContext>(
    () => ({
      projects,
      runs,
      agentLabel: (task) =>
        snapshot
          ? taskAgentLabel(snapshot, task, projects.get(task.projectId), runs.get(task.id))
          : '—',
      agentKey: (task) => taskAgentKey(task, projects.get(task.projectId), runs.get(task.id))
    }),
    [projects, runs, snapshot]
  )

  /* The scope in its default order. This is the only place that goes through `orderTasks` */
  const inScope = useMemo(
    () => (snapshot ? sortTasks(scopeTasks(snapshot, scope), projects) : []),
    [projects, scope, snapshot]
  )

  /* How many done tasks are hidden. No sorting involved (it only counts) */
  const doneHidden = useMemo(() => {
    if (scope.showDone || !snapshot) return 0
    return scopeTasks(snapshot, { ...scope, showDone: true }).length - inScope.length
  }, [inScope.length, scope, snapshot])

  return useMemo(() => {
    const matched = applyFilters(inScope, filters, context)

    // No grouping while sorting. Grouping would drift the on-screen order apart from `ordered`
    const groups = sort ? null : groupByStatus(matched)
    const ordered = sort ? sortTasksBy(matched, sort, context) : (groups ?? []).flatMap((g) => g.tasks)

    return {
      ordered,
      rules: (snapshot?.rules ?? []).filter((rule) =>
        scope.kind !== 'review' && projects.has(rule.projectId) &&
        (scope.kind === 'project' ? rule.projectId === scope.projectId :
          filters.projectIds.length === 0 || filters.projectIds.includes(rule.projectId))
      ),
      groups,
      total: inScope.length,
      doneHidden,
      narrowed: matched.length !== inScope.length || hasFilters(filters),
      context,
      candidates: inScope
    }
  }, [context, doneHidden, filters, inScope, projects, scope, snapshot?.rules, sort])
}

/** The entry point for places that need only the display order (keyboard movement, advancing to the next task). */
export function useOrderedTasks(): Task[] {
  return useTaskView().ordered
}
