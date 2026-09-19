import { createRequire } from 'node:module'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import { opencodeDbPath } from '../appPaths.js'

/**
 * With a static import, Vite 5 drops the `node:` prefix and resolution fails.
 * Fetch via require at runtime, same as db/database.ts.
 */
const nodeRequire = createRequire(import.meta.url)
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite')

/**
 * Reading the opencode CLI's sessions.
 *
 * Layout (observed; opencode v2.0.8, `~/.local/share/opencode/opencode.db`):
 *
 *   session_v2(id, directory, title, time_created, time_updated, time_idle, idle_outcome, parent_id)
 *   session_message(id, session_id, type, seq, time_created, time_updated, data)
 *
 * **Every session in the whole machine lives in this one file.** No other CLI here works that
 * way, and two things follow from it that the rest of Quuu has to respect:
 *
 *   - a session is named by its id, never by a path. The "log path" of an opencode session is
 *     this store, which says nothing about *which* session (`logAdapters.ts` / `session/index.ts`)
 *   - the file's timestamp answers "when did anything change", not "when did this session
 *     change". That question is answered by `session_v2.time_updated` (`lastWrittenFor`)
 *
 * The body of a message is JSON in `data`, whose shape follows the message's `type`:
 *
 *   user      … {text, files, time:{created}}
 *   assistant … {model:{id,providerID}, content:[{type:'text'|'reasoning'|'tool', …}], time}
 *   idle      … {outcome:'succeeded'|'failed'}   the marker that the turn finished
 *
 * None of this is published spec. Reads happen while the CLI writes, so **every failure means
 * "not there yet"** rather than an exception: the conversation keeps what it had and re-reads.
 */

export interface OpencodeSession {
  id: string
  /** Working directory, recorded as a realpath (measured: `/tmp/x` is stored as `/private/tmp/x`). */
  directory: string
  title: string | null
  /** Set on a session an agent started for itself. Those are sub-agents, not a human's work. */
  parentId: string | null
  createdMs: number
  updatedMs: number
  /** When the session went idle. null while it is still working. */
  idleMs: number | null
}

export interface OpencodeMessage {
  id: string
  seq: number
  /** `user` / `assistant` / `idle` (observed). Unknown types are left for the parser to skip. */
  type: string
  createdMs: number
  /** The parsed body. Its shape follows `type`. */
  data: unknown
}

/** Open the store read-only. null when it is not there (opencode never ran, or an older layout). */
function open(storePath = opencodeDbPath()): DatabaseSyncType | null {
  try {
    return new DatabaseSync(storePath, { readOnly: true })
  } catch {
    return null
  }
}

function close(db: DatabaseSyncType): void {
  try {
    db.close()
  } catch {
    // Even if it cannot be closed, keep whatever was read
  }
}

const SESSION_COLUMNS =
  'id, directory, title, parent_id, time_created, time_updated, time_idle'

interface SessionRow {
  id?: unknown
  directory?: unknown
  title?: unknown
  parent_id?: unknown
  time_created?: unknown
  time_updated?: unknown
  time_idle?: unknown
}

function toSession(row: SessionRow | undefined): OpencodeSession | null {
  if (typeof row?.id !== 'string' || typeof row.directory !== 'string') return null
  const title = typeof row.title === 'string' && row.title.length > 0 ? row.title : null
  return {
    id: row.id,
    directory: row.directory,
    title,
    parentId: typeof row.parent_id === 'string' && row.parent_id.length > 0 ? row.parent_id : null,
    createdMs: number(row.time_created) ?? 0,
    updatedMs: number(row.time_updated) ?? 0,
    idleMs: number(row.time_idle)
  }
}

function number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  return null
}

/** One session by id. null when the store, the table or the row is missing. */
export function readOpencodeSession(sessionId: string): OpencodeSession | null {
  const db = open()
  if (!db) return null
  try {
    const row = db
      .prepare(`SELECT ${SESSION_COLUMNS} FROM session_v2 WHERE id = ?`)
      .get(sessionId) as SessionRow | undefined
    return toSession(row)
  } catch {
    return null
  } finally {
    close(db)
  }
}

/** Does that session exist in the store? The cheapest way to ask "is this id real". */
export function opencodeSessionExists(sessionId: string): boolean {
  return readOpencodeSession(sessionId) !== null
}

/**
 * Sessions, newest change first.
 *
 * Import reads the whole list rather than walking a directory tree, because there is no tree.
 * Sub-sessions (`parent_id`) are included: whether a sub-agent counts as work is import's call,
 * not this reader's.
 */
export function listOpencodeSessions(options: { sinceMs?: number; limit?: number } = {}): OpencodeSession[] {
  const db = open()
  if (!db) return []
  try {
    const since = options.sinceMs ?? 0
    const limit = options.limit ?? 200
    const rows = db
      .prepare(
        `SELECT ${SESSION_COLUMNS} FROM session_v2
          WHERE time_updated >= ?
          ORDER BY time_updated DESC
          LIMIT ?`
      )
      .all(since, limit) as SessionRow[]
    const out: OpencodeSession[] = []
    for (const row of rows) {
      const session = toSession(row)
      if (session) out.push(session)
    }
    return out
  } catch {
    return []
  } finally {
    close(db)
  }
}

/**
 * The messages of one session, in the order they were written.
 *
 * null when nothing could be read (no store, or an older layout without `session_message`).
 * An empty array is a different answer: the session exists and has said nothing yet.
 */
export function readOpencodeMessages(
  sessionId: string,
  options: { maxMessages?: number; storePath?: string } = {}
): OpencodeMessage[] | null {
  const db = open(options.storePath)
  if (!db) return null
  try {
    const limit = options.maxMessages ?? -1
    const rows = db
      .prepare(
        `SELECT id, seq, type, time_created, data FROM session_message
          WHERE session_id = ?
          ORDER BY seq
          LIMIT ?`
      )
      .all(sessionId, limit) as Array<{
      id?: unknown
      seq?: unknown
      type?: unknown
      time_created?: unknown
      data?: unknown
    }>

    const out: OpencodeMessage[] = []
    for (const row of rows) {
      if (typeof row.id !== 'string' || typeof row.type !== 'string') continue
      if (typeof row.data !== 'string') continue
      let data: unknown
      try {
        data = JSON.parse(row.data)
      } catch {
        // A row written half-way. Skip it; the next read gets the whole thing
        continue
      }
      out.push({
        id: row.id,
        seq: number(row.seq) ?? out.length,
        type: row.type,
        createdMs: number(row.time_created) ?? 0,
        data
      })
    }
    return out
  } catch {
    return null
  } finally {
    close(db)
  }
}
