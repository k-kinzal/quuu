/** Prerequisite conditions and queue priority rules. Decided independently of storage and of how the screen sorts. */
import type { DependsMode, TaskStatus } from '../../../preload/api/tasks.js'
function isFollowupPending(task: { sessionId: string | null; pendingMessage: string }): boolean { return Boolean(task.sessionId) && task.pendingMessage.trim().length > 0 }

/** The minimum shape ordering needs, so this is callable without building a whole Task. */
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
 * The rank that pulls follow-ups (a continued run from review) to the front among queued tasks.
 * Everything not queued ranks the same. The display order of things outside the queue is untouched.
 */
function followupRank(task: OrderableTask): number {
  return task.status === 'queued' && isFollowupPending(task) ? 0 : 1
}

/**
 * Whether the prerequisite satisfies that condition.
 *
 *   done     … wait until a human marks it done (never skip review)
 *   finished … the run ending is enough (review or failure still moves on)
 *
 * **An archived prerequisite clears, whatever its status** — the same rule the main side claims by
 * (`tasks/ordering.ts`). Archiving takes a task out of the picture, so nothing waits on it any more.
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
 * The order for display and for picking work up.
 *
 * The baseline is: follow-up (a continued run from review) → project priority → task
 * priority → creation order. Follow-ups come first because a human is sitting in front of
 * the screen waiting for that reply (the SQL version is `QUEUE_ORDER_BY`).
 * On top of that, arrange it so **a prerequisite always comes before its dependent**.
 * Pushing on the way back out of a depth-first walk keeps the relative order of
 * dependency-free tasks at the baseline.
 *
 * A dependency not present in the given set (filtered to another project, done hidden)
 * is treated as if the edge weren't there. A cycle is cut off by the visited set, so the
 * ordering neither vanishes nor spins forever.
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
 * Whether adding that dependency would create a cycle.
 * If walking from the dependency leads back to you, it cycles. A self-dependency is
 * rejected here too.
 *
 * `edges` maps "task id → array of prerequisite task ids".
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
