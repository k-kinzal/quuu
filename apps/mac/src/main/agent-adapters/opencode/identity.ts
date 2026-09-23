import { START_GRACE_MS, closestTo, sameDir, type Candidate, type SessionLookup } from '../sessionLookup.js'
import { listOpencodeSessions } from './store.js'
export function findOpencodeSessionId(lookup: SessionLookup): string | null {
  const floor = lookup.startedAtMs - START_GRACE_MS
  const candidates: Candidate[] = []
  for (const session of listOpencodeSessions({ sinceMs: floor })) {
    if (lookup.claimed.has(session.id) || session.parentId) continue
    if (session.createdMs < floor) continue
    if (!sameDir(session.directory, lookup.cwd)) continue
    candidates.push({ sessionId: session.id, startedAtMs: session.createdMs })
  }
  return closestTo(candidates, lookup.startedAtMs)
}
