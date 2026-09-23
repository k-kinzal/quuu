/**
 * Why Cursor alone gets a longer window.
 *
 * The other CLIs' logs are **append-only**: every tool call adds lines.
 * So 3 minutes of silence really means stopped.
 *
 * Cursor is different. It swaps the root of store.db once per turn (cursorStore.ts),
 * so **nothing is written mid-turn**. Observed: during a 200-second shell run,
 * neither store.db, store.db-wal, nor meta.json was touched once, and past
 * the 3-minute mark the session dropped to "done" (the process was still alive).
 *
 * Running builds or tests easily pushes a turn past 10 minutes. Sessions started
 * from the CLI are known precisely via the liveness.ts marker, but chats started
 * inside the IDE carry no marker, so this window is all we have for them.
 * Too long and finished chats keep looking active — 10 minutes is that balance.
 */

import { spawnSync } from 'node:child_process'
import {
  closeSync,
  openSync,
  readdirSync,
  readSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import { cursorAgentLogsDir } from '../../appPaths.js'
import { isProcessAlive, NO_LIVENESS, type Probed, type ProviderLiveness } from '../liveness.js'
export function probeLiveness(now: number): ProviderLiveness {
  const found = probeCursor(now)
  return { ...NO_LIVENESS, has: id => found.ids.has(id), confirmed: id => found.ids.has(id), authoritative: id => found.known.has(id) }
}

/** `session-<time>-<pid>-<seq>.log`. Only the pid is needed. */
const CURSOR_LOG_NAME = /-(\d+)-\d+\.log$/

/**
 * The chat ID. Observed around 5KB from the start of the file.
 *
 * **There are 2 spellings.** Which one appears depends on what got recorded in that
 * run (`conversationClassification.*` is camelCase, API requests are snake_case).
 * Watching only one means the log exists but is never found, and liveness silently stops working.
 */
const CURSOR_CONVERSATION_ID = /"conversation(?:_id|Id)":"([0-9a-fA-F-]{36})"/

const CURSOR_LOG_HEAD_BYTES = 256 * 1024

/**
 * How far back to look at logs.
 *
 * These logs **survive exit**, so left alone they accumulate months of pids.
 * Dead pids get reused, so running `kill(pid, 0)` on old ones grabs an
 * unrelated process and fabricates "running".
 *
 * Logs with dead pids are read only within this window. When the pid is alive but
 * the log is older than the window, read it only if comparing file creation time
 * with process start time confirms it is the same process. This keeps long-silent
 * runs from being dropped without grabbing reused pids.
 */
const CURSOR_LOG_WINDOW_MS = 30 * 60 * 1000

interface CursorProbed extends Probed {
  /**
   * Chats known to be handled by cursor-agent (dead or alive).
   *
   * The list of sessions for which "no marker = finished" may be asserted.
   * The live ones also go into `ids`.
   */
  known: Set<string>
}

function probeCursor(now: number): CursorProbed {
  const dir = cursorAgentLogsDir()
  const ids = new Set<string>()
  const known = new Set<string>()
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return { ids, known, present: false }
  }

  for (const name of names) {
    const pid = Number(CURSOR_LOG_NAME.exec(name)?.[1])
    if (!Number.isInteger(pid)) continue
    const path = join(dir, name)
    let mtimeMs: number
    let birthtimeMs: number
    try {
      const stat = statSync(path)
      mtimeMs = stat.mtimeMs
      birthtimeMs = stat.birthtimeMs
    } catch {
      continue
    }
    const alive = isProcessAlive(pid)
    if (
      now - mtimeMs > CURSOR_LOG_WINDOW_MS &&
      (!alive || !processStartedBeforeFile(pid, birthtimeMs))
    ) {
      continue
    }
    const id = readCursorConversationId(path)
    if (!id) continue
    known.add(id)
    if (alive) ids.add(id)
  }
  return { ids, known, present: true }
}

/** Is the process that created the log still alive — not a pid reuse? */
function processStartedBeforeFile(pid: number, birthtimeMs: number): boolean {
  const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
    timeout: 500
  })
  if (result.error || result.signal || result.status !== 0) return false
  const startedAt = Date.parse(result.stdout.trim())
  // ps reports seconds while birthtime is milliseconds, so allow for the rounding.
  return Number.isFinite(startedAt) && startedAt <= birthtimeMs + 2_000
}

/** The chat ID this log handles. null when no request has been made yet. */
function readCursorConversationId(path: string): string | null {
  let fd: number
  let size: number
  try {
    size = statSync(path).size
    fd = openSync(path, 'r')
  } catch {
    return null
  }

  try {
    const length = Math.min(CURSOR_LOG_HEAD_BYTES, size)
    const buf = Buffer.allocUnsafe(length)
    const read = readSync(fd, buf, 0, length, 0)
    return CURSOR_CONVERSATION_ID.exec(buf.subarray(0, read).toString('utf8'))?.[1] ?? null
  } catch {
    return null
  } finally {
    closeSync(fd)
  }
}