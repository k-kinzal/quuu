import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'
import type { Task } from '../tasks/types.js'
import type { TaskRule, TaskRuleInput } from './conditions.js'
import { hasRuleCondition } from './conditions.js'
import { isValidCron, nextCronIso } from './cron.js'
import { enqueueRuleNow, nextDueAt } from './evaluate.js'

export class AutomationOperations {
  preview(input: Pick<TaskRule, 'whenIdle' | 'cron' | 'blockStatuses'>) {
    return { nextAt: input.cron.trim() ? nextCronIso(input.cron) : null, valid: !input.cron.trim() || isValidCron(input.cron), hasCondition: hasRuleCondition(input) }
  }
  constructor(private db: Db, private changed: () => void, private wake: () => void) { }


  // -------------------------------------------------------------------------
  // Automated tasks
  // -------------------------------------------------------------------------

  /**
   * Create a rule that enqueues a task once its conditions line up.
   *
   * A rule with no conditions and an unreadable cron expression are both refused here. The first
   * enqueues on every tick, the second never enqueues at all - both are settings that break
   * silently, so they are stopped in main rather than only in front of the UI.
   */
  createTaskRule(input: TaskRuleInput): TaskRule {
    this.assertRuleValid(input)
    const rules = repo.listTaskRulesByProject(this.db, input.projectId)
    const rule = repo.insertTaskRule(this.db, {
      ...input,
      sortOrder: input.sortOrder || rules.length,
      dueAt: nextDueAt(input.cron)
    })
    this.changed()
    return rule
  }


  updateTaskRule(id: string, patch: Partial<TaskRuleInput>): TaskRule {
    const current = repo.getTaskRule(this.db, id)
    if (!current) throw new Error(`task rule not found: ${id}`)
    const next = { ...current, ...patch }
    this.assertRuleValid(next)

    // Recompute the deadline only when the expression changed, so renaming a rule does not push
    // back the next scheduled time of a rule nobody touched
    const dueAt = next.cron !== current.cron ? nextDueAt(next.cron) : current.dueAt
    const rule = repo.updateTaskRule(this.db, id, { ...patch, dueAt })
    this.changed()
    this.wake()
    return rule
  }


  deleteTaskRule(id: string): void {
    repo.deleteTaskRule(this.db, id)
    this.changed()
  }


  /** "Enqueue now". Create one without waiting on the conditions (the way to check a setting). */
  enqueueTaskRule(id: string): Task {
    const task = enqueueRuleNow(this.db, id)
    this.changed()
    this.wake()
    return task
  }


  private assertRuleValid(rule: TaskRuleInput): void {
    if (rule.name.trim().length === 0) throw new Error(t('automation.nameRequired'))
    if (!hasRuleCondition(rule)) {
      throw new Error(t('automation.conditionRequired'))
    }
    if (rule.cron.trim().length > 0 && !isValidCron(rule.cron)) {
      throw new Error(t('automation.cronUnreadable'))
    }
  }
}
