import type { Task, TaskStatus } from '../../../preload/api/tasks.js'

/** The unfinished statuses listed in an automation's condition picker. */
export const OPEN_STATUSES: TaskStatus[] = ['draft', 'held', 'queued', 'running', 'review', 'failed']

/**
 * Is this task keeping its run slots? A P0 task does until it is done.
 *
 * The scheduler owns the rule; the screen repeats it only to mark the task the rest of the queue
 * is waiting behind, so a stalled queue can be read from the list itself.
 */
export function holdsSlot(task: Pick<Task, 'priority' | 'status' | 'archived'>): boolean {
  return task.priority === 0 && task.status !== 'done' && !task.archived
}
