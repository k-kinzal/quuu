import { z } from 'zod'


/**
 * Task status.
 *
 * Invariant: only an explicit human action transitions to `done`. Neither the
 * scheduler nor an agent ever writes `done`. A normal agent exit reaches
 * `review` at most.
 *
 * `held` means "the instructions are ready, but I don't want it running yet".
 * Where ordering (predecessor tasks) expresses "after something", this is the
 * condition-free "later, for now". Only an explicit human action returns it to
 * the queue; the scheduler never touches it.
 */
export const TaskStatusSchema = z.union([z.literal('draft'), z.literal('held'), z.literal('queued'), z.literal('running'), z.literal('review'), z.literal('failed'), z.literal('done')])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export const PrioritySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
export type Priority = z.infer<typeof PrioritySchema>

/**
 * What to wait for on a predecessor task.
 *   done     … wait until a human marks it done (default; review is not skipped)
 *   finished … execution finishing is enough (proceed even on review-pending / failed)
 */
export const DependsModeSchema = z.union([z.literal('done'), z.literal('finished')])
export type DependsMode = z.infer<typeof DependsModeSchema>

/** Whether the record was created in Quuu or imported from an external session. */
export const RecordSourceSchema = z.union([z.literal('user'), z.literal('imported')])
export type RecordSource = z.infer<typeof RecordSourceSchema>

export const RunStatusSchema = z.union([z.literal('starting'), z.literal('running'), z.literal('succeeded'), z.literal('failed'), z.literal('limited'), z.literal('canceled'), z.literal('timeout')])
export type RunStatus = z.infer<typeof RunStatusSchema>

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/**
 * One predecessor-task entry.
 * The condition lives on each dependency, so a single task can express
 * "wait for A to be done, but B only needs to finish running".
 */
export const TaskDependencySchema = z.object({
  taskId: z.string(),
  mode: DependsModeSchema
})
export type TaskDependency = z.infer<typeof TaskDependencySchema>

export const TaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  prompt: z.string(),
  status: TaskStatusSchema,
  /** P0 also keeps the task's run slots until it is done. */
  priority: PrioritySchema,
  seq: z.number(),
  /** ISO8601. Unset means eligible to run immediately. */
  scheduledAt: z.union([z.string(), z.null()]),
  currentRunId: z.union([z.string(), z.null()]),
  /** Session ID the task holds for continued runs. */
  sessionId: z.union([z.string(), z.null()]),
  /**
   * Set when this one task should run with a specific agent.
   * Unset means follow the project's assignment.
   */
  agentOverrideId: z.union([z.string(), z.null()]),
  /**
   * Follow-up message to send on the next run (send-back / chat follow-up).
   * When non-empty and a sessionId exists, the next run is a continued run.
   */
  pendingMessage: z.string(),
  /**
   * "Send when it finishes" message written while a run is in progress (reserved send).
   *
   * A continued run cannot be queued while one is running, but the urge to write
   * comes while reading — so we hold the message here and move it to
   * `pendingMessage` the moment the run ends normally. If it does not end
   * normally, we leave it in place and defer to human judgment.
   */
  reservedMessage: z.string(),
  reviewNote: z.string(),
  /** Predecessor tasks. Not picked from the queue until **all** are satisfied. Ordered as specified. */
  dependsOn: TaskDependencySchema.array(),
  source: RecordSourceSchema,
  /**
   * The automation rule (`TaskRule`) that created this task. Null for human-made ones.
   *
   * Duplicate detection ("don't enqueue while an unfinished one remains") counts
   * by this marker, so it only affects generated tasks. A human queuing the same
   * content by hand is not swept up in it.
   */
  ruleId: z.union([z.string(), z.null()]),
  /** Unique key for externally imported sessions (`<adapter>:<sessionId>`). Used for import idempotency. */
  externalKey: z.union([z.string(), z.null()]),
  archived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  doneAt: z.union([z.string(), z.null()])
})
export type Task = z.infer<typeof TaskSchema>

export const TaskInputSchema = z.object({
  projectId: z.string(),
  title: z.string(),
  prompt: z.string().optional(),
  priority: PrioritySchema.optional(),
  status: z.union([z.literal('draft'), z.literal('held'), z.literal('queued')]).optional(),
  scheduledAt: z.union([z.string(), z.null()]).optional(),
  agentOverrideId: z.union([z.string(), z.null()]).optional(),
  /**
   * Predecessor tasks already known at creation time.
   *
   * They can also be attached later via `TaskPatch.dependsOn`, but some ordering
   * is **decided before enqueueing**. If the task is picked up while `queued`
   * between creation and attachment, something meant to wait runs once anyway
   * (creation and the dependency are separate writes).
   */
  dependsOn: TaskDependencySchema.array().optional()
})
export type TaskInput = z.infer<typeof TaskInputSchema>

export const TaskPatchSchema = z.object({
  title: z.string().optional(),
  prompt: z.string().optional(),
  /** Follow-up for the next run. An empty string cancels a queued follow-up. */
  pendingMessage: z.string().optional(),
  priority: PrioritySchema.optional(),
  projectId: z.string().optional(),
  scheduledAt: z.union([z.string(), z.null()]).optional(),
  reviewNote: z.string().optional(),
  agentOverrideId: z.union([z.string(), z.null()]).optional(),
  /** When passed, replaces the whole array (no partial update). */
  dependsOn: TaskDependencySchema.array().optional()
})
export type TaskPatch = z.infer<typeof TaskPatchSchema>

/**
 * How a task is wired up right after being added.
 *
 * The canonical definition lives here, shared across devices, so Mac and iPhone
 * never map the same action to different words or different states.
 */
export const AddActionSchema = z.union([z.literal('draft'), z.literal('held'), z.literal('queued'), z.literal('now')])
export type AddAction = z.infer<typeof AddActionSchema>

/** States that can be written to the DB at creation (transition to running is owned by manual run). */
export const AddActionStatusSchema = z.union([z.literal('draft'), z.literal('held'), z.literal('queued')])
export type AddActionStatus = z.infer<typeof AddActionStatusSchema>
