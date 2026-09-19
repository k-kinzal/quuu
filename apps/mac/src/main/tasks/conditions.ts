import { t } from '../i18n/index.js'
import { canHoldTask } from './status.js'
import type { Task, TaskInput, TaskPatch } from './types.js'

export function assertTaskExists(task: Task | null, id: string): Task {
  if (!task) throw new Error('task not found: ' + id)
  return task
}

/** Normal creation never fabricates execution records. Importing external history goes through a separate operation. */
export function assertCreation(input: TaskInput): void {
  if (input.status && !['draft', 'held', 'queued'].includes(input.status)) throw new Error(t('tasks.createStatusInvalid'))
}

export function assertEditable(task: Task, patch: TaskPatch): void {
  if ((patch.prompt !== undefined || patch.pendingMessage !== undefined) && task.status === 'running') throw new Error(t('tasks.editWhileRunning'))
}

export function assertHoldable(task: Task): void {
  if (!canHoldTask(task.status)) throw new Error(t('tasks.holdWhileRunning'))
}

/**
 * A scheduled time is stored as an instant in UTC, whatever notation it arrived in.
 *
 * Everything that reads it - the claim conditions, the SQL that narrows the queue - compares it as
 * a **string** against `nowIso()`. Kept as written, "2026-09-19T19:13:00+09:00" sorts nine hours
 * after the instant it names, so the task stays parked long past its own time.
 *
 * Anything unreadable is left alone: rejecting it belongs to the boundary that accepted it, and
 * silently turning it into `null` would run the task immediately.
 */
export function normalizeSchedule<T extends { scheduledAt?: string | null }>(input: T): T {
  const value = input.scheduledAt
  if (typeof value !== 'string') return input
  const at = Date.parse(value)
  return Number.isNaN(at) ? input : { ...input, scheduledAt: new Date(at).toISOString() }
}
