import type { TaskStatus } from '../sync/task.js'

/**
 * Status display order, and the sectioning that follows from it. The View's order.
 *
 * Cutting the list into sections is Quuu's information design itself, and the View
 * decides it. Review sits at the top because what waits there is **debt only a human
 * can clear**. Let the order differ per device and what was at the top on the Mac ends
 * up at the bottom on the iPhone, and the sense of looking at one product is gone.
 *
 * Held means "taken out of the execution plan", so it goes below Queued and above
 * Draft.
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
 * Cuts by status. **No empty sections.**
 *
 * Within a section the given order stands. Sorting is already done by the caller (the
 * Mac's `orderTasks`, the iPhone's exported `order`); touch it here and the ordering
 * of dependencies breaks.
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
