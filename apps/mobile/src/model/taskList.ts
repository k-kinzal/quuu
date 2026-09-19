import type { SyncTaskView } from '../sync/projection.js'

import type { TaskScope } from './scope.js'
import { TASK_SCOPES, inScope } from './scope.js'

/**
 * Filters by scope, following the View's scope selection.
 *
 * Never define a filter of its own here. It once coined names this product does not
 * have for states it already names, and the same thing appeared under different words
 * on the Mac and the iPhone.
 */
export function filterTasks(tasks: SyncTaskView[], scope: TaskScope): SyncTaskView[] {
  return tasks.filter((t) => inScope(scope, t.status))
}

/** Count per scope. Used to show "how many are in there" before choosing. */
export function countByScope(tasks: SyncTaskView[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const scope of TASK_SCOPES) {
    counts.set(scopeKey(scope), filterTasks(tasks, scope).length)
  }
  return counts
}

/** A shape usable as a `Map` key. */
export function scopeKey(scope: TaskScope): string {
  return scope.kind === 'status' ? `status:${scope.status}` : scope.kind
}
