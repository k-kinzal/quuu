import type { TaskStatus } from '../../../preload/api/tasks.js'

/**
 * Display order of statuses and the banding it produces. The View's order.
 *
 * Cutting the list into bands IS Quuu's information design, and the View decides
 * it. Review sits in the top band because what's there is **debt only a human
 * can clear**. If the order differed per device, what was on top on the Mac
 * would sit lower on the iPhone, and the sense of looking at one product dies.
 *
 * Held means "taken off the execution schedule", so it goes below queued and
 * above draft.
 */
export const STATUS_ORDER: TaskStatus[] = [
  'review',
  'failed',
  'running',
  'queued',
  'held',
  'draft',
  'done'
]

export interface StatusGroup<T> {
  status: TaskStatus
  tasks: T[]
}

/**
 * Cut by status. **Never produce an empty band.**
 *
 * Within a band, the order is as given. Sorting was already done by the caller
 * (`orderTasks` on Mac, the exported `order` on iPhone); touching it here
 * breaks dependency ordering.
 */
export function groupByStatus<T extends { status: TaskStatus }>(tasks: T[]): StatusGroup<T>[] {
  const groups = new Map<TaskStatus, T[]>()
  for (const task of tasks) {
    const list = groups.get(task.status)
    if (list) list.push(task)
    else groups.set(task.status, [task])
  }
  return STATUS_ORDER.filter((s) => groups.has(s)).map((status) => ({
    status,
    tasks: groups.get(status)!
  }))
}
