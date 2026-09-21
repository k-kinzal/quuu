import type { Task } from '../tasks/types.js'
import type { TaskRule } from './conditions.js'
import { BUSY_TASK_STATUSES, canEnqueueRule, hasRuleCondition, orderTaskRules, ruleDueState } from './conditions.js'

import type { Db } from '../db/database.js'
import { inTransaction } from '../db/database.js'
import { nextCronDate, parseCron } from './cron.js'

import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'
import { truncate } from '../util.js'
import { frequencyDueAt, frequencyReady, isCalendarFrequency } from './frequency.js'
import { taskRuleTitle } from './title.js'

/**
 * Evaluating automated tasks (`TaskRule`). For each rule whose conditions line up, create one queued task.
 *
 * It enqueues and does nothing more. What it produces is an ordinary task, so claiming, running
 * and reviewing stay the job of the scheduler and a human as before
 * (there is no path that writes `done` here either).
 */

export interface TaskRuleResult {
  created: Task[]
  /** Rules whose settings cannot be read. Stalling silently goes unnoticed, so it shows in the status. */
  warnings: string[]
}

/** Work out from the cron expression when it may next enqueue. An empty expression means no deadline (null). */
export function nextDueAt(cron: string, from: Date = new Date()): string | null {
  if (cron.trim().length === 0) return null
  const spec = parseCron(cron)
  if (!spec) return null
  const next = nextCronDate(spec, from)
  return next ? next.toISOString() : null
}

/**
 * Enqueue from every rule that can. Called at the top of the scheduler's tick.
 *
 * All three conditions are ANDed gates. They are checked in order and one failure skips the rule.
 * Rules are evaluated in order, and a task just created counts towards the next rule's check
 * (two "only when the queue is empty" rules on one project never enqueue together).
 */
export function runTaskRules(db: Db, now: Date = new Date()): TaskRuleResult {
  const created: Task[] = []
  const warnings: string[] = []

  for (const rule of orderTaskRules(repo.listTaskRules(db))) {
    if (!rule.enabled) continue

    const project = repo.getProject(db, rule.projectId)
    if (!project || project.deletedAt !== null || !project.enabled) continue

    // A rule with no conditions would enqueue on every tick. It is rejected on save, but do not
    // run it out of a hand-edited DB either
    if (!hasRuleCondition(rule)) {
      warnings.push(t('automation.noConditions', { name: truncate(rule.name, 24) }))
      continue
    }

    if (rule.frequency !== 'none' && (!isCalendarFrequency(rule.frequency) || rule.cron.trim())) {
      warnings.push(t('automation.frequencyUnreadable'))
      continue
    }

    const due = rule.frequency === 'none'
      ? ruleDueState(rule, now.toISOString(), parseCron(rule.cron) !== null)
      : frequencyReady(rule, now) ? 'ready' : 'waiting'
    if (due === 'invalid') {
      warnings.push(t('automation.cronUnreadableFor', { name: truncate(rule.name, 24) }))
      continue
    }
    if (due === 'arm') {
      // There is an expression but no deadline (old data, or hand-edited).
      // Put the deadline back here and do not enqueue this time round
      repo.updateTaskRule(db, rule.id, { dueAt: nextDueAt(rule.cron, now) })
      continue
    }
    if (due === 'waiting') continue

    if (!canEnqueueRule(rule,
      rule.whenIdle ? repo.countProjectTasks(db, project.id, BUSY_TASK_STATUSES) : 0,
      repo.countRuleTasks(db, rule.id, rule.blockStatuses))) continue

    created.push(enqueueFromRule(db, rule, now))
  }

  return { created, warnings }
}

/**
 * Enqueue one without checking the conditions ("enqueue now").
 *
 * A human asked for it explicitly, so neither the empty queue nor the duplicate check applies.
 * Only the deadline advances as it would automatically (so another one does not follow immediately).
 */
export function enqueueRuleNow(db: Db, ruleId: string, now: Date = new Date()): Task {
  const rule = repo.getTaskRule(db, ruleId)
  if (!rule) throw new Error(`task rule not found: ${ruleId}`)
  return enqueueFromRule(db, rule, now)
}

/**
 * Enqueue one and advance the rule's deadline.
 *
 * Enqueuing and updating the deadline happen in the same transaction. Leave only one behind and
 * the next tick enqueues from the same rule again (once a day turns into twice).
 */
function enqueueFromRule(db: Db, rule: TaskRule, now: Date): Task {
  return inTransaction(db, () => {
    const task = repo.insertTask(db, {
      projectId: rule.projectId,
      title: taskRuleTitle(rule, now),
      prompt: rule.prompt.trim().length > 0 ? rule.prompt : rule.name,
      priority: rule.priority,
      status: 'queued',
      agentOverrideId: rule.agentOverrideId,
      ruleId: rule.id
    })
    repo.updateTaskRule(db, rule.id, {
      lastEnqueuedAt: now.toISOString(),
      dueAt: rule.frequency === 'none' ? nextDueAt(rule.cron, now) : frequencyDueAt(rule.frequency, now.toISOString(), now)
    })
    return task
  })
}
