import type { Db } from '../db/database.js'
import type { Run } from '../execution/types.js'
import type { SessionMessage } from './types.js'

/**
 * What is derived from the structured session log as it is read.
 *
 * The index turns a session into pages; it does not know what a commit receipt or a working
 * directory is. Those rules live with their owners (review, workspace) and are handed each
 * page here, inside the transaction that persists it, so what the screen reads and what was
 * derived from it never disagree. A derivation reads only `SessionMessage`, never the CLI's
 * file: that is what makes it hold for every adapter at once.
 */
export interface SessionBatch {
  /** The index key of the session (`sessionKey`). */
  key: string
  /** The generation these ordinals belong to. Rows of another generation are stale. */
  generation: string
  /** The ordinal of the first message in `messages`. */
  start: number
  /** A bounded, contiguous page of the session, in log order. */
  messages: SessionMessage[]
}

export interface SessionDerivation {
  /** Applied to every page read, and again to every page when the rules change. */
  apply(db: Db, run: Run, batch: SessionBatch): void
  /**
   * Forget what an older rule filed against the task, before its sessions are read again.
   *
   * A corrected rule has to be able to take something away; a derivation that only ever adds
   * leaves a Pull Request the old rule filed sitting on the task forever. Called once per task,
   * and only when there is something to re-derive from.
   */
  reset?(db: Db, taskId: string): void
}

/**
 * Bump when any derivation's rule changes.
 *
 * Pages materialized under an older version are read again from storage and handed back to
 * every derivation - the original log need not exist any more, and nothing is parsed twice.
 * v3: the working directory is derived from the structured log and kept, instead of being
 * scanned out of the raw file on every look.
 * v4: recognize PR operations in multiline shell commands without JSON-escaped whitespace.
 */
export const DERIVATION_VERSION = 4
