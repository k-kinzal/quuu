/** Prerequisites and queue priority rules. Judged independently of storage and screen ordering. */
import type { DependsMode, TaskStatus } from './status.js'
import { isFollowupPending } from './types.js'

/** The minimal shape needed for ordering. Callable without building a full Task. */
export interface OrderableTask {
  id: string
  projectId: string
  status: TaskStatus
  priority: number
  seq: number
  sessionId: string | null
  pendingMessage: string
  dependsOn: { taskId: string }[]
}

/**
 * Rank that moves queued follow-ups (continued runs coming out of review) to the front.
 * Everything not queued ranks equal. Display order of things not on the queue is untouched.
 */
function followupRank(task: OrderableTask): number {
  return task.status === 'queued' && isFollowupPending(task) ? 0 : 1
}

/**
 * Does the blocker task satisfy the condition?
 *
 *   done     … wait until a human marks it done (never skips review)
 *   finished … the run finishing is enough (proceeds even on review or failed)
 *
 * **An archived blocker clears, whatever its status.** Archiving is how a human takes a task out of
 * the picture: it is never claimed again and so never reaches `done` by itself, which leaves the
 * task waiting on it waiting forever — and waiting on something no list shows, so the reason is
 * unfindable. Automation already reads archiving the same way (an archived task stops counting as a
 * duplicate). Un-archiving brings the wait back, so nothing is lost by it.
 */
export function dependencyCleared(
  blocker: { status: TaskStatus; archived: boolean },
  mode: DependsMode
): boolean {
  if (blocker.archived) return true
  if (mode === 'finished') {
    return blocker.status === 'done' || blocker.status === 'review' || blocker.status === 'failed'
  }
  return blocker.status === 'done'
}

/**
 * The order used for display and for claiming.
 *
 * The baseline is follow-up (a resume out of review) -> project priority -> task priority -> entry order.
 * Follow-ups lead because a human is in front of the screen waiting (the SQL form is `QUEUE_ORDER_BY`).
 * On top of that it is arranged so **a blocker always comes before the task waiting on it**.
 * Pushing on the way back out of a depth-first walk keeps independent tasks in their baseline order.
 *
 * When a blocker is not in the set handed in (filtered to another project, done ones hidden), the
 * edge is treated as absent. A cycle is cut off by the visited set, so the ordering neither
 * disappears nor loops forever.
 */
export function orderTasks<T extends OrderableTask>(
  tasks: T[],
  projectPriority: (projectId: string) => number
): T[] {
  const base = [...tasks].sort(
    (a, b) =>
      followupRank(a) - followupRank(b) ||
      projectPriority(a.projectId) - projectPriority(b.projectId) ||
      a.priority - b.priority ||
      a.seq - b.seq
  )
  const byId = new Map(base.map((t) => [t.id, t]))
  const seen = new Set<string>()
  const out: T[] = []

  const visit = (task: T): void => {
    if (seen.has(task.id)) return
    seen.add(task.id)
    for (const dep of task.dependsOn) {
      const blocker = byId.get(dep.taskId)
      if (blocker) visit(blocker)
    }
    out.push(task)
  }
  for (const task of base) visit(task)

  return out
}

/**
 * Would adding that dependency create a cycle?
 * Walking from the blockers back round to yourself is a cycle. A self-dependency is rejected here too.
 *
 * `edges` maps a task id to the array of its blocker ids.
 */
export function wouldCycle(
  edges: Map<string, string[]>,
  taskId: string,
  dependsOnIds: string[]
): boolean {
  const stack = [...dependsOnIds]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const id = stack.pop()!
    if (id === taskId) return true
    if (visited.has(id)) continue
    visited.add(id)
    stack.push(...(edges.get(id) ?? []))
  }
  return false
}
