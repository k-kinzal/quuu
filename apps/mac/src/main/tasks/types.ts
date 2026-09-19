import type { DependsMode, Priority, RecordSource, TaskStatus } from './status.js'

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/**
 * One blocker specification.
 * The condition is carried per dependency, so "wait for A to be done, but B only has to finish
 * running" can be expressed on a single task.
 */
export interface TaskDependency {
  taskId: string
  mode: DependsMode
}

export interface Task {
  id: string
  projectId: string
  title: string
  prompt: string
  status: TaskStatus
  /** P0 also keeps the task's run slots until it is done (`holdsSlot`). */
  priority: Priority
  seq: number
  /** ISO8601. Unset means eligible immediately. */
  scheduledAt: string | null
  currentRunId: string | null
  /** The session ID the task holds so a run can be resumed. */
  sessionId: string | null
  /**
   * Set when this one task should run on a particular agent.
   * Unset, it follows the project's assignment.
   */
  agentOverrideId: string | null
  /**
   * The follow-up sent on the next run (a send-back, or a follow-up from chat).
   * When it is non-empty and sessionId is set, the next run is a resume.
   */
  pendingMessage: string
  /**
   * The "send it when the run finishes" message written mid-run (the reserved message).
   *
   * A resume cannot be queued while a run is in flight, but the urge to write comes while reading,
   * so it is held here and moved into `pendingMessage` the moment the run ends normally.
   * If it did not end normally, it stays put and the human decides.
   */
  reservedMessage: string
  reviewNote: string
  /** Blockers. Not claimed from the queue until **all** are satisfied. Kept in the given order. */
  dependsOn: TaskDependency[]
  source: RecordSource
  /**
   * The automated rule (`TaskRule`) that created this task. null for anything a human made.
   *
   * The duplicate check ("do not enqueue while an unfinished one remains") counts by this mark, so
   * it only affects what the rule produced. A human queuing the same thing by hand is not caught up in it.
   */
  ruleId: string | null
  /** The unique key from an external session (`<adapter>:<sessionId>`). Used for import idempotency. */
  externalKey: string | null
  archived: boolean
  createdAt: string
  updatedAt: string
  doneAt: string | null
}

/**
 * Will the next run be a resume (with a follow-up)?
 *
 * A send-back from review and a follow-up from chat both count. A human is sitting in front of the
 * screen waiting for an answer, so the queue claims these ahead of other tasks (`QUEUE_ORDER_BY`).
 */
export function isFollowupPending(
  task: Pick<Task, 'sessionId' | 'pendingMessage'>
): boolean {
  return Boolean(task.sessionId) && task.pendingMessage.trim().length > 0
}

export interface TaskInput {
  projectId: string
  title: string
  prompt?: string
  priority?: Priority
  status?: TaskStatus
  scheduledAt?: string | null
  agentOverrideId?: string | null
  /**
   * Blockers already known at creation time.
   *
   * They can also be added later via `TaskPatch.dependsOn`, but **some ordering is settled before
   * anything is queued**. Claimed while still `queued` in the gap between creating and wiring, the
   * task that was meant to wait runs once (creation and dependencies being separate writes).
   */
  dependsOn?: TaskDependency[]
  source?: RecordSource
  ruleId?: string | null
  externalKey?: string | null
}

export interface TaskPatch {
  title?: string
  prompt?: string
  /** The follow-up to send on the next run. An empty string cancels a queued follow-up. */
  pendingMessage?: string
  priority?: Priority
  projectId?: string
  scheduledAt?: string | null
  reviewNote?: string
  agentOverrideId?: string | null
  /** Given, it replaces the whole set (no partial update). */
  dependsOn?: TaskDependency[]
}
