import { afterCommit, inTransaction, PostCommitError } from '../db/database.js'
import { addActionStatus } from '../tasks/addAction.js'
import type { CurrentTask } from '../tasks/delayedRequest.js'
import { decideIntent } from '../tasks/delayedRequest.js'
import type { Task, TaskPatch } from '../tasks/types.js'
import { LAYOUT } from './layout.js'
import { orderIntents } from './order.js'
import type { SyncIntent, SyncReceipt, SyncReceipts } from './protocol.js'
import { RECEIPT_LIMIT, SYNC_VERSION } from './protocol.js'
import { parseIntent } from './readIntent.js'

import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { nowIso } from '../util.js'
import type { SyncFolder } from './folder.js'

/**
 * iPhone -> Mac. **Read the intents and apply only the ones that may be applied.**
 *
 * The judgement itself lives in `decide` in `tasks/delayedRequest.ts` (a pure function, so every
 * disagreement we can think of is written down as a test). What happens here is
 *
 *   1. read the files that arrived (broken ones and unknown versions are dropped)
 *   2. re-sort into the order they were tapped (iCloud does not guarantee arrival order)
 *   3. skip the already-applied (the same intent arriving twice is not applied twice)
 *   4. follow the judgement and call **the app's own regular operations**
 *   5. write down how each was handled, on the receipt
 *
 * 4 is the point. No SQL is written from here. Lose the side effects - waking the scheduler,
 * freeing a slot on done - and only tasks queued from the iPhone stop moving.
 */

/** The operations called to apply an intent. `QuuuApp` satisfies this as-is. */
export interface IntentTarget {
  createTask(
    input: {
      projectId: string
      title: string
      prompt?: string
      priority?: 0 | 1 | 2 | 3
      status?: 'draft' | 'held' | 'queued'
    },
    id?: string
  ): Task
  updateTask(id: string, patch: TaskPatch): Task
  enqueueTask(id: string): Task
  holdTask(id: string): Task
  markDone(id: string): Task
  sendBack(id: string, note: string): Task
  archiveTask(id: string, archived: boolean): Task
  reserveMessage(id: string, message: string): Task
  runNow(id: string): Promise<{ ok: boolean; reason?: string }>
}

export interface ImportResult {
  applied: number
  skipped: number
  deferred: number
  conflicts: SyncReceipt[]
  /** How many files could not be read (including ones only partly downloaded) */
  unreadable: number
}

const EMPTY: ImportResult = { applied: 0, skipped: 0, deferred: 0, conflicts: [], unreadable: 0 }

export class SyncImporter {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  sync(folder: SyncFolder, target: IntentTarget): ImportResult {
    const names = folder.list(LAYOUT.intents).filter((n) => n.endsWith('.json'))
    if (names.length === 0) return EMPTY

    const applied = repo.appliedIntentIds(this.db)
    const intents: SyncIntent[] = []
    let unreadable = 0

    for (const name of names) {
      const text = folder.read(`${LAYOUT.intents}/${name}`)
      if (text === null) {
        // The contents have not come down yet. folder has already asked for them
        unreadable += 1
        continue
      }
      const parsed = parseIntent(text)
      if (!parsed.ok) {
        unreadable += 1
        continue
      }
      if (applied.has(parsed.value.id)) continue
      intents.push(parsed.value)
    }

    if (intents.length === 0) {
      // While intent files remain on the iPhone, the receipt may not have reached it.
      // Stopping because they are already applied makes one failed iCloud upload permanent.
      this.writeReceipts(folder)
      return { ...EMPTY, unreadable }
    }

    const result: ImportResult = { applied: 0, skipped: 0, deferred: 0, conflicts: [], unreadable }
    for (const intent of orderIntents(intents)) {
      let receipt: SyncReceipt
      let committed: SyncReceipt | null = null
      try {
        receipt = inTransaction(this.db, () => {
          committed = this.apply(intent, target, repo.runCountsByTask(this.db))
          return committed
        })
      } catch (error) {
        if (error instanceof PostCommitError && committed) {
          // The apply and the ID are already saved. Do not re-apply on retry; return the settled receipt.
          receipt = committed
          console.error('[mobile-sync] post-commit notification failed', error)
        } else {
          const reason = error instanceof Error ? error.message : String(error)
          repo.markIntentApplied(this.db, intent, 'conflict', reason)
          receipt = { intentId: intent.id, device: intent.device, seq: intent.seq, taskId: intent.op.taskId, at: nowIso(), outcome: 'conflict', reason }
        }
      }
      switch (receipt.outcome) {
        case 'applied':
          result.applied += 1
          break
        case 'skipped':
          result.skipped += 1
          break
        case 'deferred':
          result.deferred += 1
          break
        case 'conflict':
          result.conflicts.push(receipt)
          break
      }
    }

    this.writeReceipts(folder)
    return result
  }

  private apply(
    intent: SyncIntent,
    target: IntentTarget,
    runCounts: Map<string, number>
  ): SyncReceipt {
    const op = intent.op
    const task = repo.getTask(this.db, op.taskId)
    const decision = decideIntent(intent, task ? currentOf(task, runCounts) : null)

    const receipt: SyncReceipt = {
      intentId: intent.id,
      device: intent.device,
      seq: intent.seq,
      taskId: op.taskId,
      at: nowIso(),
      outcome: decision.outcome,
      reason: decision.reason
    }

    // Even a crossed intent is recorded as "seen". Without that, every round repeats the same
    // judgement and the notification keeps ringing
    if (decision.outcome === 'conflict') {
      repo.markIntentApplied(this.db, intent, 'conflict', decision.reason)
      return receipt
    }
    if (decision.outcome === 'skipped') {
      repo.markIntentApplied(this.db, intent, 'skipped', decision.reason)
      return receipt
    }

    this.perform(intent, target, decision.outcome === 'deferred')

    repo.markIntentApplied(this.db, intent, decision.outcome, decision.reason)
    return receipt
  }

  private perform(intent: SyncIntent, target: IntentTarget, deferred: boolean): void {
    const op = intent.op
    switch (op.kind) {
      case 'task.create': {
        /*
         * The id is used exactly as the device minted it. Re-minting on the Mac would create two
         * tasks when the same intent arrives twice (the app dying before the arrival is recorded
         * can happen at any time).
         */
        const action = op.action ?? (op.enqueue ? 'queued' : 'draft')
        target.createTask(
          {
            projectId: op.projectId,
            title: op.title,
            prompt: op.prompt,
            priority: op.priority,
            status: addActionStatus(action)
          },
          op.taskId
        )
        if (action === 'now') afterCommit(this.db, () => this.runNowOrQueue(target, op.taskId))
        return
      }
      case 'task.edit': {
        const patch: TaskPatch = {}
        if (op.title !== undefined) patch.title = op.title
        if (op.prompt !== undefined) patch.prompt = op.prompt
        if (op.priority !== undefined) patch.priority = op.priority
        if (op.projectId !== undefined) patch.projectId = op.projectId
        target.updateTask(op.taskId, patch)
        return
      }
      case 'task.enqueue':
        target.enqueueTask(op.taskId)
        return
      case 'task.unqueue':
        // Out of the queue means held. It goes somewhere other than draft (still being written)
        target.holdTask(op.taskId)
        return
      case 'task.done':
        target.markDone(op.taskId)
        return
      case 'task.sendBack':
        if (deferred) {
          // Running. Hand it to the "send when it finishes" Quuu already has
          target.reserveMessage(op.taskId, op.message)
          return
        }
        target.sendBack(op.taskId, op.message)
        return
      case 'task.archive':
        target.archiveTask(op.taskId, true)
        return
    }
  }

  /**
   * "Run now" returns its receipt without waiting for the launch.
   *
   * With no free slot it drops to queued, same as on the Mac. Creation happens as a draft, so the
   * scheduler cannot race in and claim it before the manual run reaches a conclusion.
   */
  private runNowOrQueue(target: IntentTarget, taskId: string): void {
    void target.runNow(taskId).then(
      (result) => {
        if (!result.ok) target.enqueueTask(taskId)
      },
      () => {
        try {
          target.enqueueTask(taskId)
        } catch {
          // Only when the task itself is gone. The next sync returns to the real state
        }
      }
    )
  }

  /**
   * The receipt. The iPhone reads it to clean up the files it put there.
   * **Never written into `phone/`** (the single-writer rule is not broken for cleanup either).
   *
   * The contents are **re-read from the DB**. What was handled is already in there via
   * `markIntentApplied`, so adding this round's again lists the same row twice (that actually happened).
   */
  private writeReceipts(folder: SyncFolder): void {
    const body: SyncReceipts = {
      version: SYNC_VERSION,
      updatedAt: nowIso(),
      entries: repo.recentReceipts(this.db, RECEIPT_LIMIT)
    }
    folder.write(LAYOUT.receipts, JSON.stringify(body))
  }
}

/**
 * Queue a follow-up that arrived mid-run. If one is already held, **append rather than overwrite**.
 * When two separate thoughts get written, sending only the later one loses the earlier.
 */
function currentOf(task: Task, runCounts: Map<string, number>): CurrentTask {
  return {
    status: task.status,
    updatedAt: task.updatedAt,
    runSeq: runCounts.get(task.id) ?? 0,
    archived: task.archived,
    hasSession: Boolean(task.sessionId)
  }
}
