/**
 * Task statuses.
 *
 * Invariant: the transition to `done` is only ever an explicit human action. Neither the scheduler
 * nor an agent writes `done`. An agent finishing normally can only reach `review`.
 *
 * `held` means "the instructions are ready, but I do not want it running yet".
 * Where ordering (blockers) means "after something", this is a conditionless "later, for now".
 * Only an explicit human action returns it to the queue; the scheduler never touches it.
 */
export type TaskStatus = 'draft' | 'held' | 'queued' | 'running' | 'review' | 'failed' | 'done'

export const TASK_STATUSES: TaskStatus[] = [
  'draft',
  'held',
  'queued',
  'running',
  'review',
  'failed',
  'done'
]

/** The statuses counted as unfinished (i.e. a human is still needed). */
export const OPEN_STATUSES: TaskStatus[] = [
  'draft',
  'held',
  'queued',
  'running',
  'review',
  'failed'
]

/**
 * The statuses where a human has to read and decide.
 *
 * Review and failed are both states where **the agent stopped and is waiting on a human**, and
 * what happens next is the human's call. These are also the only ones the iPhone can mark done.
 */
export const AWAITING_HUMAN_STATUSES: TaskStatus[] = ['review', 'failed']

export type Priority = 0 | 1 | 2 | 3

export const PRIORITIES: Priority[] = [0, 1, 2, 3]

/**
 * The priority that keeps a task's run slots.
 *
 * P0 is the task a human is sitting on. Until it is done, its project slot and the slot of the
 * agent it last ran with are kept for it, so each follow-up runs the moment it is sent instead of
 * queueing behind whatever else was waiting. Switching to another task mid-work is what costs the
 * most, so this is how one task is stuck to. Lower priorities only decide the order of the queue.
 */
export const HOLDING_PRIORITY: Priority = 0

/**
 * Does a task at this priority keep its slots?
 * Where reservations are listed, done and archived tasks are left out (nothing left to keep it for).
 */
export function holdsSlot(priority: Priority): boolean {
  return priority === HOLDING_PRIORITY
}

/**
 * What to wait for on a blocker.
 *   done     ... wait until a human marks it done (the default; reviews are not skipped)
 *   finished ... the run ending is enough (review and failed both let the next one through)
 */
export type DependsMode = 'done' | 'finished'

/** Whether that record was created in Quuu or imported from an external session. */
export type RecordSource = 'user' | 'imported'

export type RunStatus =
  | 'starting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'limited'
  | 'canceled'
  | 'timeout'

export const ACTIVE_RUN_STATUSES: RunStatus[] = ['starting', 'running']

/** Does a string read as a task status? (used to check JSON that came from outside) */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as string[]).includes(value)
}

/** Does a number read as a priority? (same as above) */
export function isPriority(value: unknown): value is Priority {
  return value === 0 || value === 1 || value === 2 || value === 3
}

/** The stage where the instructions have not reached an agent yet. */
export function isUnsent(status: TaskStatus): boolean {
  return status === 'draft' || status === 'held' || status === 'queued'
}

export function isAwaitingHuman(status: TaskStatus): boolean {
  return AWAITING_HUMAN_STATUSES.includes(status)
}

export function canHoldTask(status: TaskStatus): boolean {
  return status !== 'running'
}
