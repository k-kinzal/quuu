import {
  closeSync,
  existsSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import type { LogAdapter } from '../agents/cliAdapter.js'
import { inTransaction, type Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { Run } from '../execution/types.js'
import { readCursorChat } from './cursorStore.js'
import { expectedLogPath, readsExternalLog, resolveLogPath, sessionDirFor } from './logAdapters.js'
import { sessionIdInStdout } from './stdoutSessionId.js'

/**
 * Re-bind the session ID Quuu minted to the log the CLI actually wrote.
 *
 * Quuu mints an ID before launch and assembles the log path assuming it is handed to the CLI via
 * `--session-id`. But if the agent definition's argument template does not pass `{{sessionId}}`,
 * the CLI picks its own ID. The file at the path Quuu watches is then never created, and three
 * things break at once.
 *
 *   - the conversation stays stuck at "no session log yet"
 *   - a follow-up's `--resume` points at a session that does not exist
 *   - a session we launched ourselves is imported as "started from outside", creating a duplicate task
 *
 * So the ID is no longer taken on faith: the real one is found in the cwd's log directory and
 * re-bound. Whatever the template says, "you can see what you ran" comes first.
 */

/** How many bytes of the log head to read for prompt matching. */
const HEAD_BYTES = 64 * 1024

/** How much of the prompt to match on (code points). Beyond this there is no risk of a mix-up. */
const MATCH_CHARS = 200

/**
 * How far before the run's start a log may have been created and still count.
 * Only absorbs the small gap between the file being created and its first line being written.
 */
const BIRTH_GRACE_MS = 5000

export interface AttachedSession {
  sessionId: string
  logPath: string
}

/** The resolution that lets the UI and sync open the same log the same way. */
export interface SessionReadTarget {
  sessionId: string
  logPath: string
  mode: LogAdapter
  /** Once the structured log appears, stdout has to be swapped out for it. */
  awaitingStructured: boolean
}

/**
 * Re-bind a run to its real session log. Returns the updated run when it could be re-bound.
 *
 * 1. Already bound: leave it
 * 2. A file exists under the minted ID: record that (the original path)
 * 3. Otherwise: search the cwd's log directory for the one this run wrote
 */
export function attachSessionLog(db: Db, run: Run): Run {
  // An imported run carries the real path from the start
  if (run.source !== 'user') return run
  const agent = repo.getAgent(db, run.agentId)
  const adapter: LogAdapter = agent?.logAdapter ?? 'claude'
  /*
   * Codex cannot be handed an ID on the first run, but it announces the real one in its stdout header.
   * Align the ID with reality first and the rollout JSONL in the date tree can be looked up by it.
   */
  const identified = adapter === 'codex' ? adoptFromStdout(db, run) : run
  /*
   * The stdout adapter reads a log Quuu wrote itself, so **there is no file to re-bind to**.
   * The ID can still be re-bound: the CLI announces its own session ID in the header at launch,
   * so the minted (nonexistent) ID is replaced with it.
   */
  if (!readsExternalLog(adapter)) return adoptFromStdout(db, identified)
  if (identified.sessionLogPath && existsSync(identified.sessionLogPath)) return identified

  const byId = resolveLogPath(adapter, identified.cwd, identified.sessionId)
  if (byId) return repo.updateRun(db, identified.id, { sessionLogPath: byId })

  const found = discoverSessionLog(db, identified, adapter)
  if (!found) return identified

  const updated = repo.updateRun(db, identified.id, {
    sessionId: found.sessionId,
    sessionLogPath: found.logPath
  })

  // A follow-up (--resume) uses the ID the task holds, so align that with reality too.
  const task = repo.getTask(db, identified.taskId)
  if (task && (task.currentRunId === identified.id || task.sessionId === identified.sessionId)) {
    repo.setTaskSessionId(db, task.id, found.sessionId)
  }
  return updated
}

/**
 * The best log readable right now.
 *
 * The structured log wins; stdout is returned only while it is still missing, as right after a
 * Codex launch. If the UI and the iPhone export decided this separately, one of them would fall
 * back to the grey raw log on its own, so the decision is centralized here.
 */
export function sessionReadTarget(db: Db, run: Run): SessionReadTarget {
  const agent = repo.getAgent(db, run.agentId)
  const configured: LogAdapter = agent?.logAdapter ?? 'claude'
  const attached = attachSessionLog(db, run)
  const external =
    attached.sessionLogPath ?? expectedLogPath(configured, attached.cwd, attached.sessionId)

  if (external) {
    return {
      sessionId: attached.sessionId,
      logPath: external,
      mode: configured,
      awaitingStructured: false
    }
  }

  return {
    sessionId: attached.sessionId,
    logPath: attached.stdoutLogPath,
    mode: 'stdout',
    awaitingStructured: readsExternalLog(configured)
  }
}

/** While stdout is on screen, has a structured log worth swapping in appeared? */
export function structuredSessionTarget(db: Db, run: Run): SessionReadTarget | null {
  const agent = repo.getAgent(db, run.agentId)
  const configured: LogAdapter = agent?.logAdapter ?? 'claude'
  if (!readsExternalLog(configured)) return null

  const attached = attachSessionLog(db, run)
  const logPath = attached.sessionLogPath ?? resolveLogPath(configured, attached.cwd, attached.sessionId)
  if (!logPath || !existsSync(logPath)) return null
  return {
    sessionId: attached.sessionId,
    logPath,
    mode: configured,
    awaitingStructured: false
  }
}

/**
 * Replace the ID Quuu minted (which exists nowhere) with the one the CLI announced.
 *
 * The ID the CLI chose is read off the stdout header at launch, whatever the log is read from.
 * The `stdout` adapter keeps reading the same place; the Codex adapter uses this ID to find the rollout.
 * It is this ID a follow-up's resume points at, and this ID that lets import tell
 * "this one is ours".
 */
function adoptFromStdout(db: Db, run: Run): Run {
  let found = sessionIdInStdout(run.stdoutLogPath)
  if (!found && run.kind === 'followup') {
    // A resume with the wrong ID fails before the CLI prints its header.
    // Only the initial run with the same task, ID and CLI counts as evidence; never guess another conversation into place.
    const initial = repo.listRunsByTask(db, run.taskId).find(previous =>
      previous.kind === 'initial' && previous.source === 'user' &&
      previous.sessionId === run.sessionId && previous.command === run.command)
    if (initial) found = sessionIdInStdout(initial.stdoutLogPath)
  }
  if (!found || found === run.sessionId) return run
  if (repo.claimedSessionIds(db, run.id).has(found)) return run

  const sessionId = found
  return inTransaction(db, () => {
    // Repair the history that inherited the same provisional ID. IDs of other initial runs stay put.
    for (const sibling of repo.listRunsByTask(db, run.taskId)) {
      if (sibling.source === 'user' && sibling.sessionId === run.sessionId && sibling.command === run.command) {
        repo.updateRun(db, sibling.id, { sessionId })
      }
    }
    const task = repo.getTask(db, run.taskId)
    if (task && (task.currentRunId === run.id || task.sessionId === run.sessionId)) {
      repo.setTaskSessionId(db, task.id, sessionId)
    }
    return repo.getRun(db, run.id)!
  })
}

/**
 * Re-bind every running run in one pass. Returns how many were re-bound.
 *
 * Called periodically rather than waiting for the exit. If an import sync runs while the IDs still
 * disagree, a session we launched ourselves is registered a second time as "started from outside",
 * so it has to be bound to reality before that happens.
 */
export function attachActiveRuns(db: Db): number {
  let changed = 0
  for (const run of repo.listActiveRuns(db)) {
    if (run.source !== 'user') continue
    if (run.sessionLogPath && existsSync(run.sessionLogPath)) continue
    const after = attachSessionLog(db, run)
    // A stdout run keeps reading the same place. What changes is the ID, so watch that too
    if (after.sessionLogPath !== run.sessionLogPath || after.sessionId !== run.sessionId) {
      changed += 1
    }
  }
  return changed
}

/**
 * Find the session log this run wrote.
 *
 * Sessions a human started directly sit in the same cwd. Picking the wrong one shows the
 * conversation from someone else's work, so only a log meeting all of these is taken.
 *
 *   - it is in the log directory for the run's cwd
 *   - it is not bound to another run yet
 *   - it was created after the run started
 *   - its head contains the prompt handed to this run
 */
export function discoverSessionLog(
  db: Db,
  run: Run,
  adapter: LogAdapter = 'claude'
): AttachedSession | null {
  const head = [...run.promptPreview].slice(0, MATCH_CHARS).join('').trim()
  // No clue to match on. Better left unbound than bound to the wrong one.
  if (head.length === 0) return null

  const startedMs = Date.parse(run.startedAt)
  const claimed = repo.claimedSessionIds(db, run.id)

  const candidates = sessionCandidates(adapter, run.cwd).filter((c) => {
    // The log under the minted ID has already been checked by the caller
    if (c.sessionId === run.sessionId) return false
    if (claimed.has(c.sessionId)) return false
    // A log that predates this run belongs to a different session
    return !Number.isFinite(startedMs) || c.bornMs >= startedMs - BIRTH_GRACE_MS
  })

  // Oldest-born first (so re-running the same prompt does not pick up the older one)
  candidates.sort((a, b) => a.bornMs - b.bornMs)
  const hit = candidates.find((c) => logMentions(adapter, c, head))
  return hit ? { sessionId: hit.sessionId, logPath: hit.logPath } : null
}

// ---------------------------------------------------------------------------

interface Candidate extends AttachedSession {
  bornMs: number
}

/**
 * Candidate sessions in the cwd's log directory.
 *
 * The layout differs per adapter (logAdapters.ts).
 *
 *   claude ... <dir>/<sessionId>.jsonl
 *   grok   ... <dir>/<sessionId>/chat_history.jsonl
 *   cursor ... <dir>/<sessionId>/store.db
 *
 * Layouts cwd cannot reach (codex cuts its tree by date, copilot by ID alone) produce no
 * candidates. Those CLIs do not take Quuu's ID anyway, so they are left to the path that picks
 * the ID out of a live process's traces (sessionIdentity.ts).
 */
function sessionCandidates(adapter: LogAdapter, cwd: string): Candidate[] {
  const out: Candidate[] = []

  for (const dir of candidateDirs(adapter, cwd)) {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }

    for (const name of names) {
      const found = candidateIn(adapter, dir, name)
      if (found) out.push(found)
    }
  }
  return out
}

function candidateIn(adapter: LogAdapter, dir: string, name: string): Candidate | null {
  let sessionId: string
  let logPath: string

  if (adapter === 'claude') {
    if (!name.endsWith('.jsonl')) return null
    sessionId = name.slice(0, -'.jsonl'.length)
    logPath = join(dir, name)
  } else if (adapter === 'grok') {
    sessionId = name
    logPath = join(dir, name, 'chat_history.jsonl')
  } else if (adapter === 'cursor') {
    sessionId = name
    logPath = join(dir, name, 'store.db')
  } else {
    return null
  }

  try {
    const stat = statSync(logPath)
    if (stat.size === 0) return null
    // Where birthtime is unavailable, fall back to the last modification
    return {
      sessionId,
      logPath,
      bornMs: stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs
    }
  } catch {
    return null
  }
}

/**
 * Candidate directories for the log.
 * When cwd comes through a symlink, the CLI writes under the real name.
 */
function candidateDirs(adapter: LogAdapter, cwd: string): string[] {
  const dirs: string[] = []
  const add = (dir: string | null): void => {
    if (dir && !dirs.includes(dir)) dirs.push(dir)
  }

  add(sessionDirFor(adapter, cwd))
  try {
    add(sessionDirFor(adapter, realpathSync(cwd)))
  } catch {
    // Even when cwd is gone, still look where we expect it to be
  }
  return dirs
}

/**
 * Does the prompt handed to this run appear in that log?
 *
 * Cursor is SQLite, so its contents are read to check. The others are JSON lines, so the head is
 * searched in the form the log stores it in (a JSON string).
 */
function logMentions(adapter: LogAdapter, candidate: Candidate, head: string): boolean {
  if (adapter === 'cursor') {
    const chat = readCursorChat(candidate.logPath, candidate.sessionId)
    if (!chat) return false
    return chat.messages.some(
      (m) => m.role === 'user' && JSON.stringify(m.content).includes(jsonEscaped(head))
    )
  }
  return headContains(candidate.logPath, jsonEscaped(head))
}

/**
 * The prompt fragment used for matching.
 * It appears in the log as a JSON string, so it is shaped to match that form.
 */
function jsonEscaped(head: string): string {
  return JSON.stringify(head).slice(1, -1)
}

function headContains(logPath: string, needle: string): boolean {
  let fd: number
  try {
    fd = openSync(logPath, 'r')
  } catch {
    return false
  }
  try {
    const buf = Buffer.allocUnsafe(HEAD_BYTES)
    const read = readSync(fd, buf, 0, HEAD_BYTES, 0)
    return buf.subarray(0, read).toString('utf8').includes(needle)
  } catch {
    return false
  } finally {
    closeSync(fd)
  }
}
