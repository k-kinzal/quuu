import { z } from 'zod'
import { PrioritySchema, TaskStatusSchema } from './tasks.js'

// ---------------------------------------------------------------------------
// Automation rules (the definitions that enqueue tasks)
// ---------------------------------------------------------------------------

/**
 * A definition that enqueues a task once its conditions line up. **Belongs to a
 * project** (any number can be placed on the same project — burn down Issues,
 * burn down PRs, and so on).
 *
 * It is not an attribute on the task because one row would end up carrying
 * multiple runs, reviews, and sessions. What it generates is an ordinary task,
 * and only a human moves it to `done`, as ever (the invariant holds here too).
 *
 * All three conditions act as **gates stacked with AND**. Each can be omitted,
 * but a definition with none of them cannot be saved (it would enqueue on every
 * tick).
 */
export const TaskRuleSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  /** Name of the rule. Becomes the generated task's title as-is. */
  name: z.string(),
  prompt: z.string(),
  priority: PrioritySchema,
  /** Set when generated tasks should run with a specific agent. */
  agentOverrideId: z.union([z.string(), z.null()]),
  /**
   * Enqueue only while the queue is empty.
   *
   * Empty = the project has nothing `queued` and nothing `running`.
   * The condition expresses "if anything else is being worked on, that takes
   * priority", so things merely waiting on a human (review-pending, failed,
   * held) are not counted.
   */
  whenIdle: z.boolean(),
  /**
   * Cron expression. Empty means no time condition.
   *
   * Treated **not as firing at that time, but as "allowed to enqueue from that
   * time on"** (a due time). Made a point event, a day that happened to be busy
   * at 3:00 would be skipped entirely.
   */
  cron: z.string(),
  /**
   * Task states that count as duplicates.
   *
   * If even one task **created by this rule** remains in any of the listed
   * states, nothing is enqueued. Empty means duplicates are not checked. The
   * default is everything but done (= don't enqueue while something unfinished
   * remains). Archived tasks are not counted, so a single stuck row can be
   * cleared out of the way that way.
   */
  blockStatuses: TaskStatusSchema.array(),
  enabled: z.boolean(),
  /** "Next time enqueueing is allowed", computed from cron. Null when there is no expression. */
  dueAt: z.union([z.string(), z.null()]),
  lastEnqueuedAt: z.union([z.string(), z.null()]),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type TaskRule = z.infer<typeof TaskRuleSchema>

export const TaskRuleInputSchema = TaskRuleSchema.omit({ id: true, createdAt: true, updatedAt: true, dueAt: true, lastEnqueuedAt: true })
export type TaskRuleInput = z.infer<typeof TaskRuleInputSchema>

export const RuleDueStateSchema = z.union([z.literal('ready'), z.literal('waiting'), z.literal('arm'), z.literal('invalid')])
export type RuleDueState = z.infer<typeof RuleDueStateSchema>
