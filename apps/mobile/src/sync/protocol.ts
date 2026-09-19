import type { AddAction } from './addAction.js'
import type { Priority, RunStatus, TaskStatus } from './task.js'

/**
 * The shape of what travels over iCloud. **Kept separate from the internal
 * data model on purpose.**
 *
 * Stream `Task` as-is and adding one column to the Mac's DB breaks every
 * old iPhone. This is a versioned contract that moves deliberately; the
 * Mac side repacks `Task` → `SyncTask`.
 *
 * ---
 *
 * The two directions carry things of different natures.
 *
 * | Direction | What travels | Why |
 * |------|-----------|------|
 * | Mac → iPhone | **A snapshot of state** (what things look like now) | The viewer only needs the latest. Stacked diffs cannot be repaired once one goes missing |
 * | iPhone → Mac | **A log of intents** (what the human said they want) | Shipping state means merging. An intent can carry "what was on screen when they tapped" along with it |
 *
 * Carrying intents is the point. Even one-way with a single writer,
 * **time gaps happen** (bath, train, bedtime). The Mac keeps working through
 * them. Ship state and a late-arriving "done" silently tramples the runs
 * that happened since. Ship an intent and it can be checked against the
 * precondition at tap time (`expect`) and **returned to the human as a
 * conflict**.
 */
export const SYNC_VERSION = 1

/**
 * The version of intents alone.
 *
 * Kept apart from the snapshot and UI-distribution versions. New intents are
 * v2 so that an old Mac that does not know the add actions cannot silently
 * accept `held` or `run now` as a draft.
 */
export const SYNC_INTENT_VERSION = 2

// ---------------------------------------------------------------------------
// Mac → iPhone: snapshot of state
// ---------------------------------------------------------------------------

export interface SyncProject {
  id: string
  name: string
  color: string
  /** Smaller comes first. Same meaning as the Mac's fetch order */
  priority: number
  enabled: boolean
}

/** Outcome of the most recent run. Just enough to know "how it ended" without opening the conversation. */
export interface SyncLastRun {
  status: RunStatus
  endedAt: string | null
  /** Kind of failure — Limit / auth / etc. Empty means none */
  errorKind: string
}

export interface SyncTask {
  id: string
  projectId: string
  title: string
  /** Opening of the prompt. The full text lives in the detail file */
  excerpt: string
  status: TaskStatus
  priority: Priority
  /**
   * List position. **The Mac decides.**
   *
   * The ordering rule (project priority → task priority → creation order →
   * predecessor tasks) is the Mac's fetch order itself, predecessor
   * resolution included. Reimplement the rule on the iPhone and the same
   * screen sorts differently per device.
   */
  order: number
  updatedAt: string
  /**
   * How many times it has run.
   *
   * The key for deciding "is the result I saw on the iPhone the same one the
   * Mac has now". A timestamp cannot decide that (the updated time moves
   * just from fixing a title).
   */
  runSeq: number
  lastRun: SyncLastRun | null
  /** Whether a follow-up to send on the next run is stacked (already sent back) */
  hasPending: boolean
  /** Whether a "send when finished" written mid-run is being held */
  hasReserved: boolean
  /**
   * Fingerprint of the detail file. Changes only when the content changes.
   * The iPhone skips the fetch when it matches the last read (for
   * weak-signal places). Empty for tasks with no exported detail.
   */
  detailHash: string
}

export interface SyncSnapshot {
  version: number
  /** Incremented on every export. Records "which version an intent was looking at" */
  rev: number
  generatedAt: string
  /**
   * Number of done tasks left out.
   *
   * Done tasks pile into the hundreds if left alone. Drawing them all on a
   * phone is pointless, so only recent ones travel — but **never cut in
   * silence**. Carry the count so the screen can say that "all" is not
   * really everything.
   */
  omittedDone: number
  scheduler: {
    running: boolean
    activeRuns: number
    queued: number
  }
  projects: SyncProject[]
  tasks: SyncTask[]
}

// ---------------------------------------------------------------------------
// Mac → iPhone: detail of a single task
// ---------------------------------------------------------------------------

/**
 * One utterance of the conversation.
 *
 * **Tool payloads do not travel.** This is read in the bath, in bed, on the
 * train — what matters is "what was answered", not which file was read and
 * how many bytes. Keep only the count of tool runs; details are read on
 * the Mac.
 */
export interface SyncMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  at: string | null
  /** Markdown */
  text: string
  /** Number of tool executions folded into this utterance */
  tools: number
}

export interface SyncRunSummary {
  id: string
  status: RunStatus
  agentName: string
  startedAt: string
  endedAt: string | null
  errorKind: string
  errorMessage: string
}

export interface SyncTaskDetail {
  version: number
  taskId: string
  /** Same value as `SyncTask.detailHash` */
  hash: string
  generatedAt: string
  title: string
  prompt: string
  status: TaskStatus
  runSeq: number
  /** Follow-up to send on the next run (if written, the iPhone shows it too) */
  pendingMessage: string
  reservedMessage: string
  /** Tail of the conversation. The head may have been dropped */
  messages: SyncMessage[]
  /** Whether utterances before these were dropped */
  truncated: boolean
  runs: SyncRunSummary[]
}

// ---------------------------------------------------------------------------
// iPhone → Mac: intents
// ---------------------------------------------------------------------------

/**
 * The state visible at tap time. **This is the whole story of handling
 * out-of-order arrivals.**
 *
 * A "done" tapped in the bath may reach the Mac 10 minutes later. In the
 * meantime an automated task may have run the same task again. With
 * `expect` we can tell "this is not what they were looking at". Without it,
 * the task goes done with its new result unread — and nobody notices.
 */
export interface SyncExpect {
  status: TaskStatus
  updatedAt: string
  runSeq: number
}

export type SyncOp =
  | {
    kind: 'task.create'
    taskId: string
    projectId: string
    title: string
    prompt: string
    priority: Priority
    /**
     * Compat with v1. In v2 `action` is the original.
     * true means queued, false means draft.
     */
    enqueue: boolean
    /** How to conclude right after adding. Required in v2 intents. */
    action?: AddAction
  }
  | {
    kind: 'task.edit'
    taskId: string
    title?: string
    prompt?: string
    priority?: Priority
    projectId?: string
  }
  /** Put a draft / held task onto the queue */
  | { kind: 'task.enqueue'; taskId: string }
  /** Take a queued task off the queue (put it on hold) */
  | { kind: 'task.unqueue'; taskId: string }
  /** Mark done. **A human prerogative**, so this is the only one that comes from the iPhone */
  | { kind: 'task.done'; taskId: string }
  /** Append and send back. If running, held as "send when finished" */
  | { kind: 'task.sendBack'; taskId: string; message: string }
  | { kind: 'task.archive'; taskId: string }

export interface SyncIntent {
  /** Intent version. Advances independently of the snapshot's `SYNC_VERSION`. */
  version: number
  id: string
  /** Device identity. Needed to keep order when several iPhones / iPads are connected */
  device: string
  /** Monotonic within that device. Order is decided by this even if the clock jumps */
  seq: number
  createdAt: string
  /** `rev` of the snapshot being read at tap time. 0 if none was read */
  baseRev: number
  op: SyncOp
  /** Absent for creation (the state to presuppose does not exist yet) */
  expect: SyncExpect | null
}

// ---------------------------------------------------------------------------
// Mac → iPhone: receipts
// ---------------------------------------------------------------------------

/**
 * How an intent was handled.
 *
 * - `applied`   … applied as stated
 * - `skipped`   … already in that state (includes the same intent arriving twice)
 * - `deferred`  … was running, so held as "send when finished"
 * - `conflict`  … disagreed with the precondition at tap time. **Not applied**
 */
export type SyncOutcome = 'applied' | 'skipped' | 'deferred' | 'conflict'

export interface SyncReceipt {
  intentId: string
  device: string
  seq: number
  taskId: string
  at: string
  outcome: SyncOutcome
  /** Human-readable sentence. On `conflict` it shows on the iPhone screen verbatim */
  reason: string
}

export interface SyncReceipts {
  version: number
  updatedAt: string
  /**
   * Recent entries only. The iPhone checks its own files here and cleans up.
   * Old ones fall off, but by then they are gone from the iPhone side too.
   */
  entries: SyncReceipt[]
}

/** Cap on how many entries the receipts keep. */
export const RECEIPT_LIMIT = 500

export const EMPTY_SNAPSHOT: SyncSnapshot = {
  version: SYNC_VERSION,
  rev: 0,
  generatedAt: '',
  omittedDone: 0,
  scheduler: { running: false, activeRuns: 0, queued: 0 },
  projects: [],
  tasks: []
}
