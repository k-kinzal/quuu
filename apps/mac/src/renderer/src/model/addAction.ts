/** The action picked when adding, and that field's default selection. */
import type { AddAction } from '../../../preload/api/tasks.js'
export type { AddAction, AddActionStatus } from '../../../preload/api/tasks.js'

/** The states that can be written to the DB at creation (the move to running is done by a manual run). */
import type { AddActionStatus } from '../../../preload/api/tasks.js'

/** Ordered from the "don't run it" side toward the "run it" side. */
export const ADD_ACTIONS: AddAction[] = ['draft', 'held', 'queued', 'now']

/** With nothing picked, it goes onto the queue. */
export function defaultAddAction(): AddAction {
  return 'queued'
}

/**
 * The status to write at creation.
 *
 * `now` is created as a draft and then run manually. Created as queued, the scheduler could
 * pick it up in the meantime and race with "run now".
 */
export function addActionStatus(action: AddAction): AddActionStatus {
  if (action === 'draft' || action === 'now') return 'draft'
  return action === 'held' ? 'held' : 'queued'
}
