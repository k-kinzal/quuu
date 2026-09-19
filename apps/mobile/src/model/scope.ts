import type { TaskStatus } from '../sync/task.js'
import { OPEN_STATUSES, TASK_STATUSES } from '../sync/task.js'
import { t } from './i18n/index.js'
import { TASK_STATUS_LABEL } from './labels.js'

/**
 * The list's scope. **Built only from Quuu's words.**
 *
 * Never invent per-screen vocabulary for states this product already names. When the
 * Mac calls something Queued and Running while the phone coins a word of its own for
 * the same thing, **people can no longer tell the two are the same product**.
 * `tests/scope.test.ts` fails the build over exactly that.
 *
 * What lives here is the two entrances the Mac already has (the rail's "All tasks" and
 * "Needs review") plus the statuses themselves. The Mac keeps scope (the rail) and
 * status (filter chips) on two axes; the phone folds them into one - put two axes on a
 * small screen and which one narrowed the list becomes unreadable. Folding them
 * **adds no words**.
 */
export type TaskScope = { kind: 'all' } | { kind: 'review' } | { kind: 'status'; status: TaskStatus }

/** Display order. Scopes first, then statuses in status-machine order. */
export const TASK_SCOPES: TaskScope[] = [
  { kind: 'all' },
  { kind: 'review' },
  ...TASK_STATUSES.map((status): TaskScope => ({ kind: 'status', status }))
]

export const ALL_TASKS: TaskScope = { kind: 'all' }

/** The scope's name. Uses the Mac rail's words verbatim. */
export function scopeLabel(scope: TaskScope): string {
  switch (scope.kind) {
    case 'all':
      return t('scope.all')
    case 'review':
      return t('scope.review')
    case 'status':
      return TASK_STATUS_LABEL[scope.status]
  }
}

/** Whether two scopes point at the same thing. */
export function sameScope(a: TaskScope, b: TaskScope): boolean {
  if (a.kind !== b.kind) return false
  return a.kind !== 'status' || b.kind !== 'status' || a.status === b.status
}

/**
 * Whether a status falls inside a scope.
 *
 * "All tasks" does not include Done. Same treatment as the Mac's rail: Done appears
 * only when explicitly picked as a status (left in, it reaches the hundreds and the
 * list becomes a pile of finished work).
 */
export function inScope(scope: TaskScope, status: TaskStatus): boolean {
  switch (scope.kind) {
    case 'all':
      return OPEN_STATUSES.includes(status)
    case 'review':
      return status === 'review' || status === 'failed'
    case 'status':
      return status === scope.status
  }
}
