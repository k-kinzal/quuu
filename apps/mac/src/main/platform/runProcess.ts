import { closeSync, openSync, readFileSync, readSync, rmSync, statSync } from 'node:fs'

/**
 * The plumbing for handling Runs across app restarts.
 *
 * Quuu exists so you can "queue it and forget it", so restarting Quuu itself
 * must not stop an agent. To that end, agents are launched
 *
 *   - detached (their own process group)
 *   - stdout/stderr wired straight to the log file's fd, not a pipe
 *   - exit code written to a file by the wrapper sh
 *
 * What lives here are the tools to read and write that, and to stop it when needed.
 */

/** How much output classification looks at. Agents emit a lot, so only the tail. */
export const TAIL_LIMIT = 64 * 1024

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM means "exists, but isn't ours". Still alive.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Kill the whole process group.
 *
 * Agents can leave grandchildren behind (shells, MCP servers, …), so killing
 * just the main process doesn't clean up. Launched detached, the pid doubles
 * as the group ID.
 */
export function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal)
    return
  } catch {
    // If it can't go down as a group, try just the main process
  }
  try {
    process.kill(pid, signal)
  } catch {
    // Already exited
  }
}

/**
 * Read the tail of a run log.
 *
 * The child writes output straight to the file (the parent holds no pipe), so
 * the tail used for classification is read out from here at settle time.
 */
export function readLogTail(path: string, limit = TAIL_LIMIT): string {
  let fd: number | null = null
  try {
    const size = statSync(path).size
    const start = Math.max(0, size - limit)
    const length = size - start
    if (length <= 0) return ''
    fd = openSync(path, 'r')
    const buf = Buffer.allocUnsafe(length)
    const read = readSync(fd, buf, 0, length, start)
    return buf.subarray(0, read).toString('utf8')
  } catch {
    // A missing/unreadable log is not a failure
    return ''
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        // Nothing to do if it won't close
      }
    }
  }
}

/**
 * Read the exit-code file. null if absent.
 *
 * The wrapper sh writes it just before exiting, so even a Run that finished
 * while Quuu was down can have its "how did it end" settled after restart.
 */
export function readExitCode(path: string): number | null {
  try {
    const raw = readFileSync(path, 'utf8').trim()
    if (!/^\d+$/.test(raw)) return null
    return Number(raw)
  } catch {
    return null
  }
}

export function clearExitFile(path: string): void {
  try {
    rmSync(path, { force: true })
  } catch {
    // Harmless if it can't be removed — the next Run has a different ID
  }
}
