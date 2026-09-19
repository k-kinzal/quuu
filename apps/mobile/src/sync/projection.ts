import { addActionStatus } from './addAction.js'
import { orderIntents } from './order.js'
import type { SyncIntent, SyncSnapshot, SyncTask, SyncTaskDetail } from './protocol.js'
import type { Priority, TaskStatus } from './task.js'

/**
 * Overlay operations the Mac has not taken in yet onto the snapshot.
 *
 * Between tapping "done" on the iPhone and seeing it on screen sits an
 * iCloud round trip (seconds to minutes). A screen that does not change
 * when tapped **gets tapped again**. So draw the result of the tap first,
 * with only a "not delivered yet" marker attached.
 *
 * The overlay is display-only; the truth stays on the Mac. Intents that
 * were taken in (receipt returned) are not passed here, so the next
 * snapshot naturally replaces them with the real thing. If the Mac rules
 * a conflict, the overlay disappears and the original state comes back.
 */

export interface SyncTaskView extends SyncTask {
  /** Number of not-yet-delivered operations riding on this row */
  pending: number
  /** A task created only on the iPhone, not on the Mac yet */
  local: boolean
}

export interface SyncView {
  rev: number
  generatedAt: string
  /** Number of done tasks not included */
  omittedDone: number
  scheduler: SyncSnapshot['scheduler']
  projects: SyncSnapshot['projects']
  tasks: SyncTaskView[]
}

export function projectView(snapshot: SyncSnapshot, pending: SyncIntent[]): SyncView {
  const tasks = new Map<string, SyncTaskView>()
  for (const t of snapshot.tasks) tasks.set(t.id, { ...t, pending: 0, local: false })

  for (const intent of orderIntents(pending)) {
    const op = intent.op
    const existing = tasks.get(op.taskId)

    if (op.kind === 'task.create') {
      if (existing) {
        existing.pending += 1
        continue
      }
      tasks.set(op.taskId, {
        id: op.taskId,
        projectId: op.projectId,
        title: op.title,
        excerpt: excerptOf(op.prompt),
        status:
          op.action === 'now'
            ? 'running'
            : addActionStatus(op.action ?? (op.enqueue ? 'queued' : 'draft')),
        priority: op.priority,
        // Show device-created tasks at the very top (never "I just wrote it and can't see it")
        order: -1,
        updatedAt: intent.createdAt,
        runSeq: 0,
        lastRun: null,
        hasPending: false,
        hasReserved: false,
        detailHash: '',
        pending: 1,
        local: true
      })
      continue
    }

    if (!existing) continue
    existing.pending += 1

    switch (op.kind) {
      case 'task.edit':
        if (op.title !== undefined) existing.title = op.title
        if (op.prompt !== undefined) existing.excerpt = excerptOf(op.prompt)
        if (op.priority !== undefined) existing.priority = op.priority
        if (op.projectId !== undefined) existing.projectId = op.projectId
        break
      case 'task.enqueue':
        existing.status = nextStatus(existing.status, 'queued', ['draft', 'held'])
        break
      case 'task.unqueue':
        existing.status = nextStatus(existing.status, 'held', ['queued'])
        break
      case 'task.done':
        existing.status = 'done'
        break
      case 'task.sendBack':
        // If running it goes into "send when finished". Either way, something to send is loaded
        if (existing.status === 'running') existing.hasReserved = true
        else existing.hasPending = true
        break
      case 'task.archive':
        tasks.delete(op.taskId)
        break
    }
  }

  return {
    rev: snapshot.rev,
    generatedAt: snapshot.generatedAt,
    omittedDone: snapshot.omittedDone,
    scheduler: snapshot.scheduler,
    projects: snapshot.projects,
    tasks: [...tasks.values()].sort((a, b) => a.order - b.order || compare(a.id, b.id))
  }
}

/**
 * Allow only transitions that may be overlaid.
 *
 * Keep this reaching the same conclusion as the Mac's ruling (`decide`).
 * Looser here means a "flicker": the screen changes, then the next
 * snapshot changes it back.
 */
function nextStatus(current: TaskStatus, to: TaskStatus, from: TaskStatus[]): TaskStatus {
  return from.includes(current) ? to : current
}

function excerptOf(prompt: string): string {
  const line = prompt.trim().split('\n')[0] ?? ''
  return line.length > 120 ? `${line.slice(0, 120)}…` : line
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Default priority (initial value on screen). */
export const DEFAULT_PRIORITY: Priority = 2

/**
 * Utterances not yet sent. **They belong at the tail of the conversation.**
 *
 * They come from 2 places:
 *
 *   1. Ones the Mac already holds (`pendingMessage` / `reservedMessage`)
 *   2. **Ones just tapped on the iPhone that have not reached the Mac yet**
 *
 * Without 2, sending changes nothing on screen. To the person who tapped
 * that is indistinguishable from not having tapped, and **they tap again**
 * (the same thing `projectView` does for list rows, done for the
 * conversation).
 *
 * The Mac places them the same way — unsent utterances are not moved off to
 * an attributes pane but placed in the same flow as sent ones, with a
 * marker for "not delivered" (`PendingTurn.tsx`). **If placement differs
 * per device, the same thing does not look like the same thing.**
 */
export interface SyncUnsent {
  /** Key to keep the ordering stable */
  id: string
  text: string
  /** Whether it reached the Mac. If not, it exists only inside the iPhone */
  arrived: boolean
  /** Sent after the run finishes (written while running) */
  reserved: boolean
}

/**
 * Assemble the not-yet-sent utterances placed at the tail of the conversation.
 *
 * Arrived ones first, then not-arrived. They stack downward in tap order.
 */
export function unsentTurns(
  detail: SyncTaskDetail | null,
  taskId: string,
  status: TaskStatus | undefined,
  pending: SyncIntent[]
): SyncUnsent[] {
  const out: SyncUnsent[] = []
  if (detail?.reservedMessage) {
    out.push({ id: 'reserved', text: detail.reservedMessage, arrived: true, reserved: true })
  }
  if (detail?.pendingMessage) {
    out.push({ id: 'pending', text: detail.pendingMessage, arrived: true, reserved: false })
  }

  for (const intent of orderIntents(pending)) {
    const op = intent.op
    if (op.kind !== 'task.sendBack' || op.taskId !== taskId) continue
    /*
     * Right after being taken in, the receipt and the export do not
     * necessarily arrive in the same round. If the same text comes from
     * both, keep one (don't make it look like two messages were sent).
     */
    if (out.some((u) => u.arrived && u.text === op.message)) continue
    // Written while running means sent after it finishes (same rule as the Mac's decide)
    out.push({ id: intent.id, text: op.message, arrived: false, reserved: status === 'running' })
  }
  return out
}
