import { t } from '../i18n/index.js'
import type { TaskStatus } from './status.js'
import { isAwaitingHuman, isUnsent } from './status.js'

/**
 * Deciding whether an intent may be applied. **Only this file deals with out-of-order arrival.**
 *
 * Kept as pure functions. Knowing neither the DB nor iCloud, every conceivable
 * mismatch can be written as a test (`tests/decide.test.ts`). Scatter this
 * judgment across the import side and rare combinations like "a done arriving
 * mid-run" slip through. When they slip through, results get **silently
 * trampled** where nobody is watching.
 */

/** The current Mac-side state consulted when deciding. */
export interface CurrentTask {
  status: TaskStatus
  updatedAt: string
  /** How many times it has run so far */
  runSeq: number
  archived: boolean
  /** Whether it holds a session usable for a continued run */
  hasSession: boolean
}

export interface TaskDecision {
  outcome: 'applied' | 'skipped' | 'deferred' | 'conflict'
  /** Human-readable sentence. Goes onto the receipt as-is */
  reason: string
}

const APPLY: TaskDecision = { outcome: 'applied', reason: '' }

function skip(reason: string): TaskDecision {
  return { outcome: 'skipped', reason }
}
function conflict(reason: string): TaskDecision {
  return { outcome: 'conflict', reason }
}

// Copy must be looked up after language init, so don't freeze it at module evaluation
const GONE = (): TaskDecision => conflict(t('mobileSync.gone'))
const ARCHIVED = (): TaskDecision => conflict(t('mobileSync.wasArchived'))

/**
 * Is the result visible when the button was pressed the same result the Mac has now?
 *
 * Update time can't decide this. It moves on a mere title fix, and conversely
 * can't tell two events apart within the same second. The **run count** looks at
 * exactly one thing: whether it ran again after the answer that was read.
 */
function sameRun(expect: TaskExpectation | null, current: CurrentTask): boolean {
  if (!expect) return true
  return expect.runSeq === current.runSeq
}

export function decide<T extends DelayedOperation>(
  op: T,
  expect: TaskExpectation | null,
  current: CurrentTask | null
): TaskDecision {
  if (op.kind === 'task.create') {
    // The same intent arrived twice (e.g. the iPhone re-placed it before seeing the receipt).
    // The device-assigned id is used as-is, so no duplicate ever gets created
    return current ? skip(t('mobileSync.alreadyCreated')) : APPLY
  }

  if (!current) return op.kind === 'task.archive' ? skip(t('mobileSync.alreadyGone')) : GONE()

  switch (op.kind) {
    case 'task.edit': {
      if (current.archived) return ARCHIVED()
      // Rewriting the instruction itself is only allowed while it hasn't been sent.
      // Rewriting after it ran doesn't change what was executed, so don't create
      // "I fixed it but nothing was fixed"
      if (op.prompt !== undefined && !isUnsent(current.status)) {
        return conflict(t('mobileSync.editAfterStart', { status: current.status }))
      }
      return APPLY
    }

    case 'task.enqueue': {
      if (current.archived) return ARCHIVED()
      if (current.status === 'draft' || current.status === 'held') return APPLY
      if (current.status === 'queued') return skip(t('mobileSync.alreadyQueued'))
      if (current.status === 'done') return conflict(t('mobileSync.wasDone'))
      // running / review / failed — already moved on. This is not a re-enqueue
      return skip(t('mobileSync.alreadyStarted'))
    }

    case 'task.unqueue': {
      if (current.archived) return ARCHIVED()
      if (current.status === 'queued') return APPLY
      if (current.status === 'draft' || current.status === 'held') {
        return skip(t('mobileSync.alreadyUnqueued'))
      }
      if (current.status === 'running') return conflict(t('mobileSync.unqueueAfterStart'))
      return conflict(t('mobileSync.notInQueue', { status: current.status }))
    }

    case 'task.done': {
      if (current.status === 'done') return skip(t('mobileSync.alreadyDone'))
      if (current.archived) return ARCHIVED()
      if (current.status === 'running') return conflict(t('mobileSync.doneWhileRunning'))
      if (!isAwaitingHuman(current.status)) {
        return conflict(t('mobileSync.notAwaitingResult', { status: current.status }))
      }
      /*
       * This is the case that matters. Even while it still looks like review,
       * it may have run again after the answer the iPhone was looking at
       * (auto-retry on send-back, automated tasks). To avoid marking an unread
       * result done, stop if the run count has moved.
       */
      if (!sameRun(expect, current)) {
        return conflict(t('mobileSync.ranAgain'))
      }
      return APPLY
    }

    case 'task.sendBack': {
      if (current.archived) return ARCHIVED()
      if (current.status === 'done') return conflict(t('mobileSync.wasDone'))
      /*
       * A follow-up arriving mid-run is not dropped. Quuu already has
       * "send when finished" (`tasks.reserved_message`), so park it there. The
       * moment the run ends normally it moves to pending send. Never create a
       * path where something written on the iPhone silently disappears.
       */
      if (current.status === 'running') {
        return { outcome: 'deferred', reason: t('mobileSync.sendBackDeferred') }
      }
      return APPLY
    }

    case 'task.archive': {
      if (current.archived) return skip(t('mobileSync.alreadyArchived'))
      if (current.status === 'running') return conflict(t('mobileSync.archiveWhileRunning'))
      return APPLY
    }
  }
}

/** Decision for a single intent (pulling `expect` out of it). */
export function decideIntent<T extends { op: DelayedOperation; expect: TaskExpectation | null }>(intent: T, current: CurrentTask | null): TaskDecision {
  return decide(intent.op, intent.expect, current)
}

/** The task an intent touches. */
export function targetTaskId(op: { taskId: string }): string {
  return op.taskId
}

/** Premise of an operation that arrives late. Carries no protocol version or file layout. */
export interface TaskExpectation { status: TaskStatus; updatedAt: string; runSeq: number }
export interface DelayedOperation {
  kind: 'task.create' | 'task.edit' | 'task.enqueue' | 'task.unqueue' | 'task.done' | 'task.sendBack' | 'task.archive'
  taskId: string
  prompt?: string
}
