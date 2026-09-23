import { readdirSync } from 'node:fs'
import { copilotSessionsDir } from '../../appPaths.js'
import { START_GRACE_MS, closestTo, sameDir, type Candidate, type SessionLookup } from '../sessionLookup.js'
import { readCopilotWorkspace } from './paths.js'
export function findCopilotSessionId(lookup: SessionLookup): string | null {
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
