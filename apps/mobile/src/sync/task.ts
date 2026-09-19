/** Vocabulary of the wire format the iPhone receives. Whether an operation can be applied is decided on the Mac. */
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

/** Statuses considered open (= a human hand is still needed). */
export const OPEN_STATUSES: TaskStatus[] = [
  'draft',
  'held',
  'queued',
  'running',
  'review',
  'failed'
]

/**
 * Statuses at the "human reads and decides" stage.
 *
 * Needs-review and failed are both states where **the agent has stopped and
 * is waiting for a human**, and what happens next is the human's call.
 * These are also the only ones the iPhone can mark done.
 */
export const AWAITING_HUMAN_STATUSES: TaskStatus[] = ['review', 'failed']

export type Priority = 0 | 1 | 2 | 3

export const PRIORITIES: Priority[] = [0, 1, 2, 3]

/**
 * What to wait for on a predecessor task.
 *   done     … wait until a human marks it done (default; never skips review)
 *   finished … the run finishing is enough (proceeds even on needs-review / failed)
 */
export type DependsMode = 'done' | 'finished'

/** Whether the record was created in Quuu or imported from an external session. */
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

/** Whether a string reads as a task status (used to validate JSON from outside). */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as string[]).includes(value)
}

/** Whether a number reads as a priority (ditto). */
export function isPriority(value: unknown): value is Priority {
  return value === 0 || value === 1 || value === 2 || value === 3
}
