import type { Priority, TaskStatus } from '../tasks/status.js'
import { OPEN_STATUSES } from '../tasks/status.js'
import type { Frequency } from './frequency.js'

// ---------------------------------------------------------------------------
// Automated tasks (the definitions that enqueue tasks)
// ---------------------------------------------------------------------------

/**
 * A rule that enqueues a task once its conditions line up. **Bound to a project** (any number can
 * sit on the same project, e.g. one for issues and one for PRs).
 *
 * It is not an attribute of a task because that would make one row carry several runs, reviews
 * and sessions. What it produces is an ordinary task, and moving one to `done` stays a human's
 * job as before (the invariant does not change here either).
 *
 * All three conditions act as **gates ANDed together**. Any of them may be omitted, and a setting
 * with none at all cannot be saved (it would enqueue on every tick).
 */
export interface TaskRule {
  id: string
  projectId: string
  /** The rule's name. It becomes the title of the task it creates. */
  name: string
  prompt: string
  priority: Priority
  /** Set when the created task should run on a particular agent. */
  agentOverrideId: string | null
  /**
   * Enqueue only when the queue is empty.
   *
   * Empty = that project has nothing queued and nothing running.
   * The condition means "if something else is going on, let that go first", so anything merely
   * waiting on a human (review, failed, held) is not counted.
   */
  whenIdle: boolean
  /**
   * A cron expression. Empty means no custom time condition.
   *
   * **It does not fire at that time; it becomes eligible from that time on** (a due date).
   * As a point event, a day that happened to be busy at 3:00 would be skipped entirely.
   */
  cron: string
  /** A local calendar frequency with no chosen time. Exclusive with cron. */
  frequency: Frequency
  /**
   * The task statuses that count as a duplicate.
   *
   * Nothing is enqueued while even one **task this rule created** remains in one of these statuses.
   * Empty means no duplicate check. The default is everything but done (nothing new while something is unfinished).
   * Archived ones are not counted, so one stuck task that will not go away is the way out.
   */
  blockStatuses: TaskStatus[]
  enabled: boolean
  /** The next eligible period or cron deadline. Null when there is no schedule. */
  dueAt: string | null
  lastEnqueuedAt: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type TaskRuleInput = Omit<
  TaskRule,
  'id' | 'createdAt' | 'updatedAt' | 'dueAt' | 'lastEnqueuedAt' | 'frequency'
> & { frequency?: Frequency }

/** The default used for the duplicate check. Everything unfinished, i.e. all but done. */
export const DEFAULT_BLOCK_STATUSES: TaskStatus[] = [...OPEN_STATUSES]

/**
 * Is there at least one condition?
 *
 * A definition with none would create a task on every tick, so it cannot be saved.
 * The one place main (refusing the save) and the renderer (disabling the save button) share a judgement.
 */
export function hasRuleCondition(
  rule: Pick<TaskRuleInput, 'whenIdle' | 'cron' | 'frequency' | 'blockStatuses'>
): boolean {
  return (rule.frequency !== undefined && rule.frequency !== 'none') || rule.whenIdle || rule.cron.trim().length > 0 || rule.blockStatuses.length > 0
}

export const BUSY_TASK_STATUSES: TaskStatus[] = ['queued', 'running']

/** Evaluate oldest-last-enqueued first, so one definition does not enqueue forever. */
export function orderTaskRules(rules: readonly TaskRule[]): TaskRule[] {
  return [...rules].sort((a, b) => {
    const at = a.lastEnqueuedAt ?? ''
    const bt = b.lastEnqueuedAt ?? ''
    return at === bt ? a.sortOrder - b.sortOrder : at < bt ? -1 : 1
  })
}

export type RuleDueState = 'ready' | 'waiting' | 'arm' | 'invalid'

export function ruleDueState(rule: Pick<TaskRule, 'cron' | 'dueAt'>, now: string, validCron: boolean): RuleDueState {
  if (rule.cron.trim().length === 0) return 'ready'
  if (!validCron) return 'invalid'
  if (!rule.dueAt) return 'arm'
  return rule.dueAt <= now ? 'ready' : 'waiting'
}

/** The counts are fetched by the storage layer. Both the idle and duplicate gates must pass. */
export function canEnqueueRule(rule: Pick<TaskRule, 'whenIdle'>, busyTasks: number, blockingTasks: number): boolean {
  return (!rule.whenIdle || busyTasks === 0) && blockingTasks === 0
}
