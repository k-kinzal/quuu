import { spawnSync } from 'node:child_process'
import {
  closeSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import type { LogAdapter } from '../agents/cliAdapter.js'
import { claudeSessionsDir, codexLocksDir, copilotSessionsDir, cursorAgentLogsDir } from '../appPaths.js'
import { readOpencodeSession } from '../session/opencodeStore.js'

/**
 * Liveness probe for imported sessions.
 *
 * Deciding life or death by the log's mtime alone misses in both directions:
 *
 *   - A finished session stays "running" until "N minutes since the last write" pass
 *   - A session merely silent during a long tool run gets dropped to "done"
 *
 * Watching the files the CLI keeps only while running avoids both:
 *
 *   Claude Code … ~/.claude/sessions/<pid>.json      removed on exit. We also verify the pid is alive
 *   Codex       … ~/.codex/thread-writer-locks/<sessionId>.lock  held open for writing while running
 *   Copilot     … `session.shutdown` written at the tail of events.jsonl (a finish marker)
 *   opencode    … `session_v2.time_idle` is set once the turn ends (a finish marker)
 *   Cursor      … $TMPDIR/cursor-agent-logs-<uid>/session-…-<pid>-<n>.log
 *                 running if the pid in the name is alive. The `conversation_id`
 *                 inside is the chat ID. **Only sessions started from cursor-agent
 *                 (the CLI)** — chats started inside the IDE have no such log
 *
 * Grok has no running marker (verified by observation: `active_sessions.json`
 * stays empty for `-p` non-interactive runs, and a session's `.lock` remains after exit).
 * Neither has the Antigravity CLI: `presence/<conversationId>.lock` is left behind after the run
 * exits (measured), so its mere presence says nothing.
 * Adapters without a marker, and sessions outside a marker, are judged by mtime.
 *
 * None of this is published spec. When facing an unreadable environment or a version
 * without the mechanism, fall back to the mtime decision instead of silently breaking.
 * For that we remember "have we ever observed a live one", and until we have,
 * we never assert "absent = finished".
 */

export interface LivenessProbe {
  /** Does the session have a liveness marker? It may still be debris from a crash. */
  has(adapter: LogAdapter, sessionId: string): boolean
  /** Was the marker traced down to an actually live process? null when there is no way to trace. */
  confirmed(adapter: LogAdapter, sessionId: string): boolean | null
  /**
   * May we assert "no marker = finished" for this session?
   *
   * Some cases cannot be decided per adapter. Cursor leaves markers only for chats
   * started from cursor-agent, so **within one adapter, assertable and
   * non-assertable sessions (IDE chats) mix**. Hence we look down to the sessionId.
   */
  authoritative(adapter: LogAdapter, sessionId: string): boolean
  /**
   * Is the session known to have finished?
   *
   * Copilot leaves a "finished" marker rather than a "running" one, so this is
   * not the inverse of has(). The finish marker is checked independently so a
   * merely silent session is not dropped to done.
   */
  finished(adapter: LogAdapter, sessionId: string): boolean
}

/** Whether the probe was proven to work in this environment (remembered only while the process lives). */
const proven: Record<'claude' | 'codex', boolean> = { claude: false, codex: false }

/** For tests. Discards what was learned about the environment. */
export function resetLivenessMemo(): void {
  proven.claude = false
  proven.codex = false
}

interface Probed {
  ids: Set<string>
  /** Was the directory itself readable? If not, this environment lacks the mechanism. */
  present: boolean
}

export function probeLiveSessions(now = Date.now()): LivenessProbe {
  const claude = probeClaude()
  const codex = probeCodex()
  const cursor = probeCursor(now)
  const codexLockStates = new Map<string, boolean | null>()
  if (claude.ids.size > 0) proven.claude = true
  if (codex.ids.size > 0) proven.codex = true

  return {
    has: (adapter, sessionId) => {
      if (adapter === 'codex') return codex.ids.has(sessionId)
      if (adapter === 'claude') return claude.ids.has(sessionId)
      if (adapter === 'cursor') return cursor.ids.has(sessionId)
      // Adapters without a running marker. Leave it to the mtime decision.
      return false
    },
    confirmed: (adapter, sessionId) => {
      if (adapter === 'claude') return claude.ids.has(sessionId)
      if (adapter === 'cursor') return cursor.ids.has(sessionId)
      if (adapter !== 'codex') return null

      const path = codex.paths.get(sessionId)
      if (!path) return false
      /*
       * The lock can survive a crash. Only sessions silent for 30+ minutes reach
       * here, so we check the OS exclusive lock only then and never routinely block
       * the main process. Within one probe, each lock is checked at most once.
       */
      if (!codexLockStates.has(path)) codexLockStates.set(path, codexLockHeld(path))
      return codexLockStates.get(path) ?? null
    },
    authoritative: (adapter, sessionId) => {
      if (adapter === 'codex') return codex.present && proven.codex
      if (adapter === 'claude') return claude.present && proven.claude
      /*
       * Cursor is per chat. Only for chats whose cursor-agent log we found may we
       * assert "the log's pid is dead = finished".
       * Chats started inside the IDE have no log and never enter here
       * (asserting for them would drop the chat to done the moment it opens).
       */
      if (adapter === 'cursor') return cursor.known.has(sessionId)
      return false
    },
    finished: (adapter, sessionId) => {
      if (adapter === 'copilot') return copilotHasShutdown(sessionId)
      // opencode stamps the session the moment it goes idle, whatever wrote to the store since
      if (adapter === 'opencode') return readOpencodeSession(sessionId)?.idleMs != null
      return false
    }
  }
}

/** Probe that skips liveness. For when the decision should rest on mtime alone. */
export const NO_LIVENESS: LivenessProbe = {
  has: () => false,
  confirmed: () => null,
  authoritative: () => false,
  finished: () => false
}

// ---------------------------------------------------------------------------

function probeClaude(): Probed {
  const dir = claudeSessionsDir()
  const ids = new Set<string>()
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return { ids, present: false }
  }

  for (const name of names) {
    if (!name.endsWith('.json')) continue
    let entry: { pid?: unknown; sessionId?: unknown }
    try {
      entry = JSON.parse(readFileSync(join(dir, name), 'utf8')) as typeof entry
    } catch {
      continue
    }
    if (typeof entry.pid !== 'number' || typeof entry.sessionId !== 'string') continue
    // pid files can be left behind by crashes, so verify the process is actually alive
    if (!isProcessAlive(entry.pid)) continue
    ids.add(entry.sessionId)
  }
  return { ids, present: true }
}

interface CodexProbed extends Probed {
  paths: Map<string, string>
}

function probeCodex(): CodexProbed {
  const dir = codexLocksDir()
  const ids = new Set<string>()
  const paths = new Map<string, string>()
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return { ids, paths, present: false }
  }

  for (const name of names) {
    // Exclude internals like `.coordination.lock`
    if (name.startsWith('.') || !name.endsWith('.lock')) continue
    const id = name.slice(0, -'.lock'.length)
    ids.add(id)
    paths.set(id, join(dir, name))
  }
  return { ids, paths, present: true }
}

/**
 * Does a Codex process hold the exclusive file lock?
 *
 * Codex's lock is an empty file, so exit cannot be read from its contents. Trusting
 * mere existence leaves crash debris running forever; cutting on silence alone drops
 * a session to done mid long tool call. We try to acquire the same lock with macOS's
 * stock lockf: if it is already held, the session is alive. `-n -k` avoids creating
 * or deleting the file even on contention.
 */
function codexLockHeld(path: string): boolean | null {
  const result = spawnSync('/usr/bin/lockf', ['-k', '-n', '-s', '-t', '0', path, '/usr/bin/true'], {
    stdio: 'ignore',
    timeout: 500
  })
  // EX_TEMPFAIL (75) from sysexits.h is the definitive answer: another process already holds it.
  if (result.status === 75) return true
  if (result.status === 0) return false
  return null
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

/** Tail bytes to scan for the finish marker. `session.shutdown` comes as the last line. */
const TAIL_BYTES = 8 * 1024

/**
 * Did Copilot write its finish marker?
 *
 * Called only to inspect running sessions, so just a handful of targets.
 * Read only the tail (events.jsonl can exceed 40MB).
 */
function copilotHasShutdown(sessionId: string): boolean {
  const path = join(copilotSessionsDir(), sessionId, 'events.jsonl')
  let fd: number
  let size: number
  try {
    size = statSync(path).size
    fd = openSync(path, 'r')
  } catch {
    return false
  }

  try {
    const length = Math.min(TAIL_BYTES, size)
    const buf = Buffer.allocUnsafe(length)
    const read = readSync(fd, buf, 0, length, Math.max(0, size - length))
    return buf.subarray(0, read).toString('utf8').includes('"session.shutdown"')
  } catch {
    return false
  } finally {
    closeSync(fd)
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
