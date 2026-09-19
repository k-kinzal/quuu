import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { LogAdapter } from '../agents/cliAdapter.js'
import { claudeSessionsDir, copilotSessionsDir } from '../appPaths.js'
import { sessionLogDir } from './claudePaths.js'
import { readCopilotWorkspace } from './copilotPaths.js'
import { acceptsSessionId } from './logAdapters.js'

/**
 * Pin down the "real session ID" of an agent Quuu launched.
 *
 * Quuu creates a session ID before launch and records it assuming the argument template's
 * `{{sessionId}}` hands it to the CLI. If the template does not pass it, the CLI picks its own
 * session ID and the one recorded is an ID that exists nowhere.
 *
 * A false record breaks three things at once - and breaks them quietly, so the cause is unfindable.
 *
 *   - import mistakes a session we launched for a "directly started external session" and creates
 *     a second running task in the same project (concurrency 1, yet two appear to run)
 *   - a follow-up's `--resume` points at a session that does not exist
 *   - the log path the conversation view tries to open does not exist
 *
 * Since the argument template is user-editable, we cannot assume the ID is being passed.
 * When it turns out not to be, the real one is picked out of the traces the CLI leaves and re-recorded.
 */

/** Slack for a log or a process appearing slightly before or after the launch. */
const START_GRACE_MS = 5000

export interface SessionLookup {
  /** The run's working directory. */
  cwd: string
  /** The run's start time (ms). A session started before this is not ours. */
  startedAtMs: number
  /** Session IDs already claimed by another run. Never matched twice. */
  claimed: ReadonlySet<string>
}

/** Do the expanded arguments actually hand the session ID Quuu created to the CLI? */
export function argsCarrySessionId(args: string[], sessionId: string): boolean {
  return args.some((a) => a.includes(sessionId))
}

/**
 * Can the session ID the CLI chose be recovered for that adapter?
 *
 * Even a CLI that accepts an ID (claude / grok / cursor) needs recovery if `{{sessionId}}` was
 * removed from its argument template. Conversely, an adapter with no means of recovery (codex
 * cuts its logs by date, so cwd cannot reach them) would only search for nothing, so it gives up
 * from the start.
 */
export function canRecoverSessionId(adapter: LogAdapter): boolean {
  return adapter === 'claude' || adapter === 'copilot' || acceptsSessionId(adapter)
}

/**
 * Find the session ID the CLI actually opened. null when not found.
 *
 * Every adapter leaves its traces somewhere else, so the dispatch happens here.
 */
export function findSessionId(adapter: LogAdapter, lookup: SessionLookup): string | null {
  if (adapter === 'copilot') return findCopilotSessionId(lookup)
  return findClaudeSessionId(lookup)
}

/**
 * Find the session ID Copilot actually opened.
 *
 * There is no way to hand `-p` a session ID (measured), so sessions that appeared under
 * `session-state` are matched by cwd and time. A run that failed to authenticate still creates its
 * directory, so only ones whose `workspace.yaml` can be read are candidates.
 */
function findCopilotSessionId(lookup: SessionLookup): string | null {
  const floor = lookup.startedAtMs - START_GRACE_MS

  let names: string[]
  try {
    names = readdirSync(copilotSessionsDir())
  } catch {
    return null
  }

  const candidates: Candidate[] = []
  for (const name of names) {
    if (lookup.claimed.has(name)) continue
    const workspace = readCopilotWorkspace(name)
    if (!workspace || !sameDir(workspace.cwd, lookup.cwd)) continue

    const createdMs = workspace.createdAt ? Date.parse(workspace.createdAt) : Number.NaN
    if (!Number.isFinite(createdMs) || createdMs < floor) continue
    candidates.push({ sessionId: workspace.sessionId, startedAtMs: createdMs })
  }

  return closestTo(candidates, lookup.startedAtMs)
}

/**
 * Find the session ID Claude Code actually opened.
 *
 * There are two traces to pick from, and either one alone misses cases.
 *
 *   pid file    ... exists only while running. Carries the cwd, so it is certain, but vanishes on exit
 *   session log ... survives the exit. A run that finished quickly can only be caught here
 *
 * When several candidates share a cwd, the one closest in start time wins. Quuu launches the runs
 * of one project in sequence within a tick, so candidates never line up at the same instant.
 * If it still cannot be decided, null is returned and it waits for the next chance.
 */
export function findClaudeSessionId(lookup: SessionLookup): string | null {
  const floor = lookup.startedAtMs - START_GRACE_MS
  const candidates = [...livePidFiles(lookup.cwd), ...recentLogs(lookup.cwd)].filter(
    (c) => c.startedAtMs >= floor && !lookup.claimed.has(c.sessionId)
  )
  return closestTo(candidates, lookup.startedAtMs)
}

/** The candidate closest in start time. null when it cannot be decided (left for the next chance). */
function closestTo(candidates: Candidate[], startedAtMs: number): string | null {
  if (candidates.length === 0) return null
  let best = candidates[0]
  for (const c of candidates) {
    const closer = Math.abs(c.startedAtMs - startedAtMs) < Math.abs(best.startedAtMs - startedAtMs)
    if (closer) best = c
  }
  return best.sessionId
}

/**
 * Is it the same working directory?
 * CLIs record cwd resolved to a realpath, so a string comparison alone misses a launch through a
 * symlink.
 */
function sameDir(a: string, b: string): boolean {
  if (a === b) return true
  return realOf(a) === realOf(b)
}

function realOf(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

// ---------------------------------------------------------------------------

interface Candidate {
  sessionId: string
  startedAtMs: number
}

/**
 * The pid file a running Claude Code leaves (`~/.claude/sessions/<pid>.json`).
 * It states its own cwd, so a launch through a symlink is not mixed up.
 */
function livePidFiles(cwd: string): Candidate[] {
  let names: string[]
  try {
    names = readdirSync(claudeSessionsDir())
  } catch {
    return []
  }

  const out: Candidate[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    let entry: { pid?: unknown; sessionId?: unknown; cwd?: unknown; startedAt?: unknown }
    try {
      entry = JSON.parse(readFileSync(join(claudeSessionsDir(), name), 'utf8')) as typeof entry
    } catch {
      continue
    }
    if (typeof entry.sessionId !== 'string' || entry.cwd !== cwd) continue
    // Confirm the process is alive, so a pid file left by a crash is not picked up
    if (typeof entry.pid !== 'number' || !isProcessAlive(entry.pid)) continue
    out.push({
      sessionId: entry.sessionId,
      startedAtMs: typeof entry.startedAt === 'number' ? entry.startedAt : 0
    })
  }
  return out
}

/** Is there a session log in the cwd's log directory that appeared after the launch? */
function recentLogs(cwd: string): Candidate[] {
  const dir = sessionLogDir(cwd)
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }

  const out: Candidate[] = []
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue
    let born: number
    try {
      const st = statSync(join(dir, name))
      // Where birthtime is unavailable, fall back to mtime
      born = st.birthtimeMs > 0 ? st.birthtimeMs : st.mtimeMs
    } catch {
      continue
    }
    out.push({ sessionId: name.slice(0, -'.jsonl'.length), startedAtMs: born })
  }
  return out
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM means "it exists but is not ours". It is alive.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}
