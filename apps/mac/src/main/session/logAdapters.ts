import { existsSync } from 'node:fs'
import { layoutLastWrittenMs, withReal } from '../agent-adapters/files.js'
import type { AdapterLayout } from '../agent-adapters/layout.js'
import { adapterFor } from '../agent-adapters/registry.js'
import type { LogAdapter } from '../agents/cliAdapter.js'
export type { AdapterLayout } from '../agent-adapters/layout.js'



export function layoutFor(adapter: LogAdapter): AdapterLayout {
  return adapterFor(adapter).layout
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
 * Is the conversation re-read whole on every change, rather than followed from a byte offset?
 * The read path, the preview and the iPhone export all have to agree on this, so it is answered
 * in one place.
 */
export function readsWholeStore(adapter: LogAdapter): boolean {
  return layoutFor(adapter).wholeStore === true
}

/** Does one file hold every session, so that a path alone does not name one? */
export function sharesOneStore(adapter: LogAdapter): boolean {
  return layoutFor(adapter).oneStore === true
}

/**
 * When that session was last written (in ms). null when it cannot be read.
 *
 * "How long has it been silent" is the only yardstick for deciding whether something is still
 * running, so **import and the periodic check both go through here**. One side reading the main
 * file's mtime and the other meta.json's makes the two disagree and flap - "one marks it done,
 * the other puts it back to running" (which is exactly what happened with Cursor).
 */
export function lastWrittenMs(adapter: LogAdapter, logPath: string, sessionId?: string): number | null {
 return layoutLastWrittenMs(layoutFor(adapter), logPath, sessionId)
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
  const layout = layoutFor(adapter)
  if (layout.resolve) return layout.resolve(cwd, sessionId)
  for (const candidate of withReal(cwd)) {
    const path = layout.logPathFor(candidate, sessionId)
    if (path && existsSync(path)) return path
  }

  // Layouts cwd cannot reach (copilot does not key on cwd)
  const direct = layout.logPathFor(cwd, sessionId)
  if (direct && existsSync(direct)) return direct

  return layout.scan?.(sessionId) ?? null
}