import { realpathSync } from 'node:fs'
export const START_GRACE_MS = 5000

export interface SessionLookup {
  /** The run's working directory. */
  cwd: string
  /** The run's start time (ms). A session started before this is not ours. */
  startedAtMs: number
  /** Session IDs already claimed by another run. Never matched twice. */
  claimed: ReadonlySet<string>
}

export interface Candidate {
  sessionId: string
  startedAtMs: number
}

export function closestTo(candidates: Candidate[], startedAtMs: number): string | null {
  if (candidates.length === 0) return null
  let best = candidates[0]
  for (const c of candidates) {
    const closer = Math.abs(c.startedAtMs - startedAtMs) < Math.abs(best.startedAtMs - startedAtMs)
    if (closer) best = c
  }
  return best.sessionId
}

export function sameDir(a: string, b: string): boolean {
  if (a === b) return true
  return realOf(a) === realOf(b)
}

export function realOf(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}
