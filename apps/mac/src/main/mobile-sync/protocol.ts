/** Vocabulary of the published wire format. Internal model changes must not silently change the version. */
export type AddAction = 'draft' | 'held' | 'queued' | 'now'
export type TaskStatus = 'draft' | 'held' | 'queued' | 'running' | 'review' | 'failed' | 'done'
export type Priority = 0 | 1 | 2 | 3
export type RunStatus = 'starting' | 'running' | 'succeeded' | 'failed' | 'limited' | 'canceled' | 'timeout'

/**
 * The shape of what crosses iCloud. **Kept separate from the internal data model.**
 *
 * Streaming `Task` as-is would mean that adding one column to the Mac's DB
 * breaks reading on older iPhones. Keep this a versioned contract and
 * repack `Task` → `SyncTask` on the Mac side.
 *
 * ---
 *
 * What is carried differs in nature by direction.
 *
 * | Direction | What | Why |
 * |------|-----------|------|
 * | Mac → iPhone | **State snapshot** (what everything looks like right now) | The viewer only needs the latest. Stacked diffs can't be repaired when one goes missing |
 * | iPhone → Mac | **Intent log** (what the person said they want) | Carrying state means merging. An intent can carry "what was on screen at tap time" along with it |
 *
 * Carrying intents is the point. Even one-way with a single writer, **time gaps
 * happen** (bath, train, before sleep). The Mac keeps working meanwhile. If we
 * carried state, a late-arriving "done" would silently trample the runs that
 * happened since. With an intent, we can check it against the premise at tap
 * time (`expect`) and **hand the mismatch back to the human**.
 */
export const SYNC_VERSION = 1

/**
 * Version for intents alone.
 *
 * Kept separate from the snapshot and app-distribution versions. New intents are
 * 2 so that an old Mac that doesn't know the add actions won't silently accept
 * "held" or "run now" as a draft.
 */
export const SYNC_INTENT_VERSION = 2

// ---------------------------------------------------------------------------
// Mac → iPhone: state snapshot
// ---------------------------------------------------------------------------

export interface SyncProject {
  id: string
  name: string
  color: string
  /** Lower comes first. Same meaning as the Mac's pickup order */
  priority: number
  enabled: boolean
}

/** Outcome of the latest run. Carries just enough to tell "how it ended" without opening the conversation. */
export interface SyncLastRun {
  status: RunStatus
  endedAt: string | null
  /** Kind of failure — limit / auth etc. Empty means none */
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
   * Position in the list. **The Mac decides.**
   *
   * The ordering rule (project priority → task priority → creation order →
   * predecessor tasks) is exactly the Mac's pickup order, including predecessor
   * resolution. Give the iPhone the rule to implement and the same screen sorts
   * differently per device.
   */
  order: number
  updatedAt: string
  /**
   * How many times this has run so far.
   *
   * The key for deciding "is the result seen on the iPhone the same one the Mac
   * has now". Timestamps can't decide this (updatedAt moves even when only the
   * title was edited).
   */
  runSeq: number
  lastRun: SyncLastRun | null
  /** Whether a follow-up to send on the next run is stacked (already sent back) */
  hasPending: boolean
  /** Whether a "send when finished" written mid-run is being held */
  hasReserved: boolean
  /**
   * Fingerprint of the detail file. Changes only when the content does.
   * The iPhone skips fetching when it matches what it last read (for places
   * with thin reception). Empty for tasks whose detail was not exported.
   */
  detailHash: string
}

export interface SyncSnapshot {
  version: number
  /** Incremented on every export. Intents record it as "which revision was on screen at tap time" */
  rev: number
  generatedAt: string
  /**
   * Number of done tasks left out.
   *
   * Done tasks pile up into the hundreds. Drawing them all on a phone is
   * pointless, so only the newest are carried — but **never cut silently**.
   * Carry the count so the screen can say that "All" is not actually everything.
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
 * **Tool payloads are not carried.** This is read in the bath, in bed, on the
 * train — what matters is "what was answered", not which file was read and how
 * many bytes. Keep only the count; details are read on the Mac.
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
  /** Follow-up to send on the next run (shown on the iPhone too when present) */
  pendingMessage: string
  reservedMessage: string
  /** Tail of the conversation. The beginning may have been dropped */
  messages: SyncMessage[]
  /** Whether utterances before these were dropped */
  truncated: boolean
  runs: SyncRunSummary[]
}

// ---------------------------------------------------------------------------
// iPhone → Mac: intents
// ---------------------------------------------------------------------------

/**
 * The state visible at tap time. **This is everything needed to handle crossed updates.**
 *
 * A "done" tapped in the bath may reach the Mac 10 minutes later. In between, an
 * automation may have run the same task again. With `expect` we can tell "this
 * is not what they were looking at". Without it, the task goes done with its
 * fresh result unread — and nobody notices.
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
     * Compatibility with version 1. In version 2, `action` is the source of truth.
     * true means queued, false means draft.
     */
    enqueue: boolean
    /** What the task becomes right after creation. Required in version-2 intents. */
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
  /** Take a queued task off the queue (hold it) */
  | { kind: 'task.unqueue'; taskId: string }
  /** Mark done. **A human prerogative**, so this is also the only such intent that comes from the iPhone */
  | { kind: 'task.done'; taskId: string }
  /** Send back with a follow-up. If running, held as "send when finished" */
  | { kind: 'task.sendBack'; taskId: string; message: string }
  | { kind: 'task.archive'; taskId: string }

export interface SyncIntent {
  /** Intent version. Advances independently of the snapshot's `SYNC_VERSION`. */
  version: number
  id: string
  /** Device identity. Needed to keep ordering when several iPhones / iPads are connected */
  device: string
  /** Monotonically increasing within that device. Ordering follows this even when the clock jumps */
  seq: number
  createdAt: string
  /** `rev` of the snapshot being read at tap time. 0 if never read */
  baseRev: number
  op: SyncOp
  /** Absent for creation (the state to presuppose doesn't exist yet) */
  expect: SyncExpect | null
}

// ---------------------------------------------------------------------------
// Mac → iPhone: receipts
// ---------------------------------------------------------------------------

/**
 * How an intent was handled.
 *
 * - `applied`   … applied as requested
 * - `skipped`   … already in that state (including the same intent arriving twice)
 * - `deferred`  … was running, so held as "send when finished"
 * - `conflict`  … clashed with the premise at tap time. **Not applied**
 */
export type SyncOutcome = 'applied' | 'skipped' | 'deferred' | 'conflict'

export interface SyncReceipt {
  intentId: string
  device: string
  seq: number
  taskId: string
  at: string
  outcome: SyncOutcome
  /** Human-readable sentence. For `conflict` it is shown verbatim on the iPhone's screen */
  reason: string
}

export interface SyncReceipts {
  version: number
  updatedAt: string
  /**
   * Only the most recent. The iPhone checks its own files here and cleans them up.
   * Old entries fall off, but by then the iPhone side has removed the file.
   */
  entries: SyncReceipt[]
}

/** Cap on how many receipt entries are kept. */
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
