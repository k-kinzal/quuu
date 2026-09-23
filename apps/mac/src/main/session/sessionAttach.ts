import { existsSync } from 'node:fs'
import { jsonLogMentions } from '../agent-adapters/discovery.js'
import { adapterFor } from '../agent-adapters/registry.js'
import type { LogAdapter } from '../agents/cliAdapter.js'
import { inTransaction, type Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { Run } from '../execution/types.js'
import { expectedLogPath, readsExternalLog, resolveLogPath } from './logAdapters.js'
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
  const adapter: LogAdapter = run.logAdapter ?? 'stdout'
  /*
   * Codex cannot be handed an ID on the first run, but it announces the real one in its stdout header.
   * Align the ID with reality first and the rollout JSONL in the date tree can be looked up by it.
   * The Antigravity CLI is the same story with a different spelling: its stream opens with the
   * conversation it created, and only that ID reaches the transcript under `brain/`.
   */
  const identified = adapterFor(adapter).sessionIdInStdout ? adoptFromStdout(db, run, adapter) : run
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
  const configured: LogAdapter = run.logAdapter ?? 'stdout'
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
  const configured: LogAdapter = run.logAdapter ?? 'stdout'
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
function adoptFromStdout(db: Db, run: Run, adapter: LogAdapter = 'stdout'): Run {
  let found = sessionIdInStdout(run.stdoutLogPath, adapter)
  if (!found && run.kind === 'followup') {
    // A resume with the wrong ID fails before the CLI prints its header.
    // Only the initial run with the same task, ID and CLI counts as evidence; never guess another conversation into place.
    const initial = repo.listRunsByTask(db, run.taskId).find(previous =>
      previous.kind === 'initial' && previous.source === 'user' &&
      previous.sessionId === run.sessionId && previous.command === run.command)
    if (initial) found = sessionIdInStdout(initial.stdoutLogPath, adapter)
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
  adapter: LogAdapter = run.logAdapter ?? 'stdout'
): AttachedSession | null {
  const head = [...run.promptPreview].slice(0, MATCH_CHARS).join('').trim()
  // No clue to match on. Better left unbound than bound to the wrong one.
  if (head.length === 0) return null

  const startedMs = Date.parse(run.startedAt)
  const claimed = repo.claimedSessionIds(db, run.id)

  const candidates = (adapterFor(adapter).sessionCandidates?.(run.cwd) ?? []).filter((c) => {
    // The log under the minted ID has already been checked by the caller
    if (c.sessionId === run.sessionId) return false
    if (claimed.has(c.sessionId)) return false
    // A log that predates this run belongs to a different session
    return !Number.isFinite(startedMs) || c.bornMs >= startedMs - BIRTH_GRACE_MS
  })

  // Oldest-born first (so re-running the same prompt does not pick up the older one)
  candidates.sort((a, b) => a.bornMs - b.bornMs)
  const hit = candidates.find((c) => (adapterFor(adapter).logMentions ?? jsonLogMentions)(c, head))
  return hit ? { sessionId: hit.sessionId, logPath: hit.logPath } : null
}
