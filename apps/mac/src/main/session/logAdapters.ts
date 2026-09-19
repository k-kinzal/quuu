import { createHash } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { LogAdapter } from '../agents/cliAdapter.js'
import { claudeProjectsDir, codexSessionsDir, copilotSessionsDir, cursorChatsDir, grokSessionsDir } from '../appPaths.js'
import { resolveSessionLogPath, sessionLogDir } from './claudePaths.js'

/**
 * Which CLI leaves a session where, and in what shape. **All of it collected in this one place.**
 *
 * Every time another CLI is supported, an `if (adapter === 'claude')` scattered across launch,
 * the conversation view, import and reconciliation - four places - produces a state where only
 * some of them got fixed. What actually breaks does so quietly: "the conversation never appears"
 * and "a session we launched ourselves is enqueued a second time as an external one".
 *
 * Every value here was measured (by actually running the CLI on this machine).
 * None of it is a published spec, so when something cannot be read, fall to "not there yet"
 * rather than breaking silently. Every such decision goes through here.
 */

export interface AdapterLayout {
  /**
   * Can the session ID Quuu minted be handed to the CLI?
   *
   *   claude ... `--session-id <uuid>`
   *   grok   ... `-s <uuid>` (new sessions only; resume is `-r`)
   *   cursor ... `--resume <uuid>` (an ID that does not exist is created under that ID)
   *
   * CLIs that cannot take one (codex / copilot) have the ID they chose picked up afterwards.
   * A lie here makes `--resume` point at a session that does not exist, and no conversation shows.
   */
  readonly acceptsSessionId: boolean
  /** The root where sessions live. The path is returned even when it does not exist. */
  root(): string
  /**
   * Where the sessions for a cwd live.
   * Answers with the directory alone, so a watch can be set up before any log exists.
   * null for CLIs that do not key on cwd (copilot).
   */
  dirFor(cwd: string): string | null
  /** The log path implied by cwd and sessionId. null when it cannot be assembled. */
  logPathFor(cwd: string, sessionId: string): string | null
  /**
   * Companion files written alongside the log itself.
   *
   * Some layouts cannot answer "when was it last written" from the main file's mtime alone, so
   * the ones listed here are checked too and the **newest timestamp** wins (`lastWrittenMs`).
   * Adapters with no companions may omit it.
   */
  companions?(logPath: string): string[]
}

/**
 * Why cwd cannot be used as the key as-is.
 *
 * Every CLI keys on cwd **after resolving it to a realpath** (measured: launching in `/tmp/x`
 * gets recorded as `/private/tmp/x`). For a project launched through a symlink, looking only at
 * the expected path never finds anything.
 */
function withReal(cwd: string): string[] {
  const out = [cwd]
  try {
    const real = realpathSync(cwd)
    if (real !== cwd) out.push(real)
  } catch {
    // Even when cwd is gone, still look where we expect it to be
  }
  return out
}

/**
 * Grok uses a percent-encoded cwd as the directory name.
 * e.g. /Users/me/Projects/app -> %2FUsers%2Fme%2FProjects%2Fapp
 */
export function grokDirName(cwd: string): string {
  return encodeURIComponent(cwd)
}

/**
 * Cursor uses the MD5 of cwd as the directory name.
 * e.g. /Users/me/Projects/metrics-pipeline -> 0cfa6ecf23416e27d9a47b2bb2cead32
 */
export function cursorDirName(cwd: string): string {
  return createHash('md5').update(cwd).digest('hex')
}

const LAYOUTS: Record<LogAdapter, AdapterLayout> = {
  claude: {
    acceptsSessionId: true,
    root: claudeProjectsDir,
    dirFor: (cwd) => sessionLogDir(cwd),
    logPathFor: (cwd, sessionId) => join(sessionLogDir(cwd), `${sessionId}.jsonl`)
  },

  codex: {
    // codex exec takes no session ID. The one it picks for itself is recovered afterwards.
    acceptsSessionId: false,
    root: codexSessionsDir,
    // The tree is cut by date, so cwd cannot reach it (matched through session_meta's cwd)
    dirFor: () => null,
    logPathFor: () => null
  },

  cursor: {
    acceptsSessionId: true,
    root: cursorChatsDir,
    dirFor: (cwd) => join(cursorChatsDir(), cursorDirName(cwd)),
    logPathFor: (cwd, sessionId) =>
      join(cursorChatsDir(), cursorDirName(cwd), sessionId, 'store.db'),
    /*
     * store.db is SQLite in WAL mode. Writes land in `store.db-wal` first and the main file's
     * mtime only moves at a checkpoint. Watching the main file alone misses the last write by
     * weeks (measured: a chat with the main file at 7/27 and the WAL at 8/17).
     * meta.json can be older than the main file instead (measured 7 minutes off), so watch both.
     *
     * `store.db-shm` is left out. **Quuu merely reading it moves its mtime**, so including it
     * would make every chat look like it was written just now, forever.
     */
    companions: (logPath) => [`${logPath}-wal`, join(dirname(logPath), 'meta.json')]
  },

  grok: {
    acceptsSessionId: true,
    root: grokSessionsDir,
    dirFor: (cwd) => join(grokSessionsDir(), grokDirName(cwd)),
    logPathFor: (cwd, sessionId) =>
      join(grokSessionsDir(), grokDirName(cwd), sessionId, 'chat_history.jsonl')
  },

  copilot: {
    // -p has no equivalent of --session-id. session-state/<id>/ is picked up afterwards.
    acceptsSessionId: false,
    root: copilotSessionsDir,
    // cwd never becomes a directory name (it lives inside workspace.yaml)
    dirFor: () => null,
    logPathFor: (_cwd, sessionId) => join(copilotSessionsDir(), sessionId, 'events.jsonl')
  },

  stdout: {
    acceptsSessionId: false,
    root: () => '',
    dirFor: () => null,
    logPathFor: () => null
  }
}

export function layoutFor(adapter: LogAdapter): AdapterLayout {
  return LAYOUTS[adapter] ?? LAYOUTS.claude
}

/** Can that adapter hand the session ID Quuu minted to the CLI? */
export function acceptsSessionId(adapter: LogAdapter): boolean {
  return layoutFor(adapter).acceptsSessionId
}

/**
 * Does this adapter read a session log the CLI itself writes?
 *
 * `stdout` alone is a log Quuu redirected itself, so there is nothing to go looking for
 * (any search is guaranteed to come back empty).
 */
export function readsExternalLog(adapter: LogAdapter): boolean {
  return adapter !== 'stdout'
}

/**
 * When that session was last written (in ms). null when it cannot be read.
 *
 * "How long has it been silent" is the only yardstick for deciding whether something is still
 * running, so **import and the periodic check both go through here**. One side reading the main
 * file's mtime and the other meta.json's makes the two disagree and flap - "one marks it done,
 * the other puts it back to running" (which is exactly what happened with Cursor).
 */
export function lastWrittenMs(adapter: LogAdapter, logPath: string): number | null {
  const layout = layoutFor(adapter)
  let newest: number | null = mtimeMs(logPath)
  for (const companion of layout.companions?.(logPath) ?? []) {
    const at = mtimeMs(companion)
    if (at !== null && (newest === null || at > newest)) newest = at
  }
  return newest
}

function mtimeMs(path: string): number | null {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

/** Where to set up the watch. Returns the directory even before any log exists. */
export function sessionDirFor(adapter: LogAdapter, cwd: string): string | null {
  return layoutFor(adapter).dirFor(cwd)
}

/** The log path implied by cwd and sessionId. */
export function expectedLogPath(
  adapter: LogAdapter,
  cwd: string,
  sessionId: string
): string | null {
  return layoutFor(adapter).logPathFor(cwd, sessionId)
}

/**
 * Resolve the real path of a session log. null when there is none.
 *
 * Absorbs wobble in cwd (symlinks) and, failing that, scans under the root to whatever depth the
 * adapter's layout needs. A made-up path here leaves the conversation view waiting on an empty
 * file forever, so returning an honest "not found" takes priority.
 */
export function resolveLogPath(
  adapter: LogAdapter,
  cwd: string,
  sessionId: string
): string | null {
  if (adapter === 'claude') return resolveSessionLogPath(cwd, sessionId)

  const layout = layoutFor(adapter)
  for (const candidate of withReal(cwd)) {
    const path = layout.logPathFor(candidate, sessionId)
    if (path && existsSync(path)) return path
  }

  // Layouts cwd cannot reach (copilot does not key on cwd)
  const direct = layout.logPathFor(cwd, sessionId)
  if (direct && existsSync(direct)) return direct

  return scanRootForSession(adapter, sessionId)
}

/**
 * Look for sessionId's log anywhere under the root.
 *
 * The last resort for when cwd changed (the project moved), or the CLI wrote a spelling other than
 * the realpath. Normally only one level is scanned; only Codex's date tree goes three deep.
 */
function scanRootForSession(adapter: LogAdapter, sessionId: string): string | null {
  const layout = layoutFor(adapter)
  const root = layout.root()
  if (root.length === 0) return null

  /*
   * Codex writes to `sessions/<year>/<month>/<day>/rollout-...-<sessionId>.jsonl`.
   * cwd cannot reach it, but once the real ID is off the stdout header it can be looked up
   * uniquely by suffix. Leaving this on stdout renders every line grey as a system utterance
   * even though the structured log is right there.
   */
  if (adapter === 'codex') {
    const day = codexDayDir(root, sessionId)
    if (day) {
      const found = scanCodexTree(day, sessionId, 0)
      if (found) return found
      // Only when the UUID's time and the date directory's reference time disagree, sweep everything last.
      return scanCodexTree(root, sessionId, 3)
    }
    /*
     * The ID Quuu provisionally minted is not a UUIDv7 and exists in no Codex rollout.
     * Do not let the per-second polling right after launch sweep the whole history for nothing.
     */
    return null
  }

  let names: string[]
  try {
    names = readdirSync(root)
  } catch {
    return null
  }

  const leaf = adapter === 'cursor' ? 'store.db' : adapter === 'grok' ? 'chat_history.jsonl' : null
  if (!leaf) return null

  for (const name of names) {
    const candidate = join(root, name, sessionId, leaf)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** The first 48 bits of a UUIDv7 are its creation time. Index straight into Codex's date tree. */
function codexDayDir(root: string, sessionId: string): string | null {
  const match = /^([0-9a-f]{8})-([0-9a-f]{4})-7[0-9a-f]{3}-/i.exec(sessionId)
  if (!match) return null
  const at = new Date(Number.parseInt(`${match[1]}${match[2]}`, 16))
  if (!Number.isFinite(at.getTime())) return null
  const year = String(at.getUTCFullYear()).padStart(4, '0')
  const month = String(at.getUTCMonth() + 1).padStart(2, '0')
  const day = String(at.getUTCDate()).padStart(2, '0')
  return join(root, year, month, day)
}

/** Walk only Codex's three date levels to find the rollout for the real session ID. */
function scanCodexTree(dir: string, sessionId: string, depth: number): string | null {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf8' })
  } catch {
    return null
  }

  const suffix = `-${sessionId}.jsonl`
  for (const entry of entries) {
    if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith(suffix)) {
      return join(dir, entry.name)
    }
  }
  if (depth === 0) return null

  // Newest date first. What gets opened is normally a recent run, so it turns up in the first few directories.
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a))
  for (const name of directories) {
    const found = scanCodexTree(join(dir, name), sessionId, depth - 1)
    if (found) return found
  }
  return null
}
