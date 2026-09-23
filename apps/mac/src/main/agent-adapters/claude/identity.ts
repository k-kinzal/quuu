import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { claudeSessionsDir } from '../../appPaths.js'
import { START_GRACE_MS, closestTo, type Candidate, type SessionLookup } from '../sessionLookup.js'
import { sessionLogDir } from './paths.js'
export function findClaudeSessionId(lookup: SessionLookup): string | null {
  const floor = lookup.startedAtMs - START_GRACE_MS
  const candidates = [...livePidFiles(lookup.cwd), ...recentLogs(lookup.cwd)].filter(
    (c) => c.startedAtMs >= floor && !lookup.claimed.has(c.sessionId)
  )
  return closestTo(candidates, lookup.startedAtMs)
}

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
