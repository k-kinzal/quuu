import {
  closeSync,
  openSync,
  readSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import { copilotSessionsDir } from '../../appPaths.js'
import { NO_LIVENESS, type ProviderLiveness } from '../liveness.js'
export function probeLiveness(): ProviderLiveness {

  return { ...NO_LIVENESS, finished: copilotHasShutdown }
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