import { mkdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Where the app's data lives.
 *
 * Depending on Electron's app.getPath would make this unusable outside main
 * (tests), so it can be overridden via environment variables and is evaluated
 * on every call (not fixed at import time).
 *
 * The directory and the DB filename **stay under the old name (taskd)**.
 * Changing them during the rename to Quuu would strand existing tasks and run
 * history (the app would look at an empty new location, so everything appears
 * gone). The public name and the storage name are treated as separate things.
 */
export function userDataDir(): string {
  return process.env.QUUU_USER_DATA ?? join(homedir(), 'Library', 'Application Support', 'taskd')
}

export function dbPath(): string {
  return join(userDataDir(), 'taskd.db')
}

export function runLogDir(): string {
  return join(userDataDir(), 'logs')
}

/**
 * Unix socket through which the local CLI passes task operations to the main process.
 *
 * Not a TCP port: it keeps the control surface from being exposed beyond this
 * Mac, and cleanly separates a fixture's `QUUU_USER_DATA` from production by
 * location alone.
 */
export function taskApiSocketPath(): string {
  return process.env.QUUU_SOCKET ?? join(userDataDir(), 'quuu.sock')
}

/** Root where Claude Code writes session logs. */
export function claudeProjectsDir(): string {
  return process.env.QUUU_CLAUDE_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects')
}

/** Directory where Claude Code keeps pid files only for running sessions. */
export function claudeSessionsDir(): string {
  return process.env.QUUU_CLAUDE_SESSIONS_DIR ?? join(homedir(), '.claude', 'sessions')
}

/** Root where Codex writes rollout logs (session logs). */
export function codexSessionsDir(): string {
  return process.env.QUUU_CODEX_SESSIONS_DIR ?? join(homedir(), '.codex', 'sessions')
}

/** Directory where Codex keeps lock files only for running threads. */
export function codexLocksDir(): string {
  return process.env.QUUU_CODEX_LOCKS_DIR ?? join(homedir(), '.codex', 'thread-writer-locks')
}

/** Root where the Cursor CLI (cursor-agent) keeps chats. */
export function cursorChatsDir(): string {
  return process.env.QUUU_CURSOR_CHATS_DIR ?? join(homedir(), '.cursor', 'chats')
}

/**
 * Where cursor-agent opens a log per running process.
 *
 * `$TMPDIR/cursor-agent-logs-<uid>/session-<time>-<pid>-<n>.log` (observed).
 * The name contains the pid, so this is the only clue that lets us count
 * "sessions running right now", the same way Claude Code's
 * `~/.claude/sessions/<pid>.json` does.
 */
export function cursorAgentLogsDir(): string {
  const override = process.env.QUUU_CURSOR_AGENT_LOGS_DIR
  if (override) return override
  return join(tmpdir(), `cursor-agent-logs-${process.getuid?.() ?? 0}`)
}

/** Root where the Grok CLI keeps sessions. */
export function grokSessionsDir(): string {
  return process.env.QUUU_GROK_SESSIONS_DIR ?? join(homedir(), '.grok', 'sessions')
}

/** Root where the GitHub Copilot CLI keeps sessions. */
export function copilotSessionsDir(): string {
  return process.env.QUUU_COPILOT_SESSIONS_DIR ?? join(homedir(), '.copilot', 'session-state')
}

/**
 * Where the launch scripts handed to the terminal live.
 *
 * Under the app's data, not `/tmp`. Nothing deletes them right after handoff,
 * and "Open logs and data folder" lets you read the actual file, so what was
 * launched can be traced afterwards.
 */
export function terminalScriptDir(): string {
  return join(userDataDir(), 'terminal')
}

export function terminalScriptPath(id: string): string {
  const dir = terminalScriptDir()
  mkdirSync(dir, { recursive: true })
  // The extension is `.command`. Terminal treats these as "open = execute"
  return join(dir, `${id}.command`)
}

/**
 * Where to look for IDEs / editors.
 *
 * JetBrains Toolbox installs under `~/Applications/JetBrains Toolbox/`.
 * Direct installs go to `/Applications`. Checking only one misses the other's copy.
 */
export function applicationDirs(): string[] {
  const override = process.env.QUUU_APPLICATION_DIRS
  if (override) return override.split(':').filter((p) => p.length > 0)
  const home = homedir()
  return [
    '/Applications',
    join(home, 'Applications'),
    join(home, 'Applications', 'JetBrains Toolbox'),
    '/Applications/JetBrains Toolbox'
  ]
}

export function ensureAppDirs(): void {
  mkdirSync(userDataDir(), { recursive: true })
  mkdirSync(runLogDir(), { recursive: true })
}

/** Path of a run log. Creates the directory if missing. */
export function runLogPath(runId: string): string {
  const dir = runLogDir()
  mkdirSync(dir, { recursive: true })
  return join(dir, `${runId}.log`)
}

/**
 * Path where the exit code is written.
 *
 * Agents keep running across Quuu restarts, so the exit code can't rely on the
 * parent's `exit` event alone. The wrapper sh writes it here; the next launch picks it up.
 */
export function runExitPath(runId: string): string {
  const dir = runLogDir()
  mkdirSync(dir, { recursive: true })
  return join(dir, `${runId}.exit`)
}

/**
 * Root of the generated change reports.
 *
 * The pages are written by an agent, so this doubles as the **only place the report view is
 * allowed to read from**. Keeping that boundary in one function means the view and the writer
 * cannot drift apart into "shows a file nobody generated".
 */
export function reportRoot(): string {
  return join(userDataDir(), 'reports')
}

/**
 * Where one task's report lives. Creates the directory if missing.
 *
 * The page a person reads, the generator's own output, and its exit code sit together, so
 * "Open logs and data folder" reaches the evidence behind a report that came out wrong, not
 * just the report.
 */
export function reportDir(taskId: string): string {
  const dir = join(reportRoot(), safeSegment(taskId))
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * A task ID as a single path segment.
 *
 * IDs are minted by Quuu, but a report path is also built from values that crossed IPC, and a
 * traversal here would let a caller name a file outside the report root.
 */
function safeSegment(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9_-]/g, '')
  if (cleaned.length === 0) throw new Error(`unusable id for a report path: ${id}`)
  return cleaned
}
