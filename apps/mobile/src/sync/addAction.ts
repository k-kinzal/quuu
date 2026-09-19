/**
 * How a task is concluded right after being added.
 *
 * The original lives here, shared across devices, so the Mac and the iPhone
 * never map the same action to different words or different states.
 */
export type AddAction = 'draft' | 'held' | 'queued' | 'now'

/** States that can be written to the DB at creation (the transition to running belongs to manual run). */
export type AddActionStatus = 'draft' | 'held' | 'queued'

/** Ordered from "won't run" to "will run". */
export const ADD_ACTIONS: AddAction[] = ['draft', 'held', 'queued', 'now']

/** When nothing is chosen, put it on the queue. */
export function defaultAddAction(): AddAction {
  return 'queued'
}

/**
 * The status written at creation.
 *
 * `now` creates as a draft and then runs manually. Created as queued, the
 * scheduler could fetch it in the meantime and race the "run now".
 */
export function addActionStatus(action: AddAction): AddActionStatus {
  if (action === 'draft' || action === 'now') return 'draft'
  return action === 'held' ? 'held' : 'queued'
}

/** Used to validate values arriving from iCloud. */
export function isAddAction(value: unknown): value is AddAction {
  return typeof value === 'string' && (ADD_ACTIONS as string[]).includes(value)
}
