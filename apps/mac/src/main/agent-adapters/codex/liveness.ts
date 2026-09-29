import {
  closeSync,
  openSync,
  readSync,
  readdirSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import { codexLocksDir } from '../../appPaths.js'
import { fileLockHeld } from '../../platform/processProbe.js'
import { NO_LIVENESS, type Probed, type ProviderLiveness } from '../liveness.js'
import { resolveCodexLog } from './paths.js'
let proven = false
export function resetLiveness(): void { proven = false }
export function probeLiveness(): ProviderLiveness {
  const found = probeCodex()
  if (found.ids.size) proven = true
  const lockStates = new Map<string, boolean | null>()
  const turnEnded = new Map<string, boolean>()
  return {
    ...NO_LIVENESS, has: id => found.ids.has(id),
    confirmed: id => {
      const path = found.paths.get(id)
      if (!path) return false
      /*
       * Codex's lock is an empty file, so exit cannot be read from its contents. Trusting mere
       * existence leaves crash debris running forever; cutting on silence alone drops a session
       * to done mid long tool call. Trying to take the same lock answers it: held means alive.
       */
      if (!lockStates.has(path)) lockStates.set(path, fileLockHeld(path))
      return lockStates.get(path) ?? null
    },
    /*
     * The app-server keeps this lock open after the turn has ended, for as long as the thread
     * stays open in the app. A held lock then reads as a live run. An imported session stuck
     * that way fills the project's only concurrency slot, so queued tasks never start while
     * every agent slot stays free. The rollout is what says the turn is over.
     */
    finished: id => {
      const known = turnEnded.get(id)
      if (known !== undefined) return known
      const ended = codexTurnEnded(id)
      turnEnded.set(id, ended)
      return ended
    },
    authoritative: () => found.present && proven
  }
}

/** Enough of the end to include the closing event after a large tool line. */
const TAIL_BYTES = 64 * 1024

/**
 * Has the latest turn already finished?
 *
 * `task_started` opens one; `task_complete` and `turn_aborted` close it. Anything else in the
 * tail is ignored, and a tail with neither marker is not treated as finished: a long tool call
 * can push the start out of view, and the lock is what keeps that session running.
 */
function codexTurnEnded(sessionId: string): boolean {
  const path = resolveCodexLog(sessionId)
  if (!path) return false
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
    const lines = buf.subarray(0, read).toString('utf8').split('\n')
    // The first fragment is the middle of a line when the read did not start at the beginning.
    if (size > length) lines.shift()
    let ended = false
    for (const line of lines) {
      const marker = turnMarker(line)
      if (marker === 'start') ended = false
      else if (marker === 'end') ended = true
    }
    return ended
  } catch {
    return false
  } finally {
    closeSync(fd)
  }
}

function turnMarker(line: string): 'start' | 'end' | null {
  const trimmed = line.trim()
  if (trimmed.length === 0) return null
  let entry: { type?: string; payload?: { type?: string } }
  try {
    entry = JSON.parse(trimmed) as { type?: string; payload?: { type?: string } }
  } catch {
    return null
  }
  if (entry.type !== 'event_msg') return null
  if (entry.payload?.type === 'task_started') return 'start'
  if (entry.payload?.type === 'task_complete' || entry.payload?.type === 'turn_aborted') return 'end'
  return null
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
