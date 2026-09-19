/**
 * How a task is wired up right after being added.
 *
 * The single source used across devices lives here, so Mac and iPhone never
 * map the same action to different words or different states.
 */
export type AddAction = 'draft' | 'held' | 'queued' | 'now'

/** States that can be written to the DB at creation (transitioning to running is manual execution's job). */
export type AddActionStatus = 'draft' | 'held' | 'queued'

/** Ordered from "won't run" toward "will run". */
export const ADD_ACTIONS: AddAction[] = ['draft', 'held', 'queued', 'now']

/** When nothing is chosen, put it on the queue. */
export function defaultAddAction(): AddAction {
  return 'queued'
}

/**
 * Status to set at creation.
 *
 * `now` creates as a draft, then runs manually. Creating as queued would let
 * the scheduler grab it in the meantime and race with "run now".
 */
export function addActionStatus(action: AddAction): AddActionStatus {
  if (action === 'draft' || action === 'now') return 'draft'
  return action === 'held' ? 'held' : 'queued'
}

/** Used to validate values arriving from iCloud. */
export function isAddAction(value: unknown): value is AddAction {
  return typeof value === 'string' && (ADD_ACTIONS as string[]).includes(value)
}
