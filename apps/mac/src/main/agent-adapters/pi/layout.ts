import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { piSessionsDir } from '../../appPaths.js'
import { candidatesIn, type SessionCandidate } from '../discovery.js'
import { readHead } from '../external.js'
import type { AdapterLayout } from '../layout.js'
import { sameDir } from '../sessionLookup.js'
import { record } from './records.js'

export function piDirName(cwd: string): string {
  return `--${cwd.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`
}

export function sessionHeader(path: string): Record<string, unknown> {
  const header = record(readHead(path).split('\n', 1)[0])
  return header.type === 'session' ? header : {}
}

function candidate(dir: string, name: string): { sessionId: string; logPath: string } | null {
  if (!name.endsWith('.jsonl')) return null
  const logPath = join(dir, name)
  try {
    const header = sessionHeader(logPath)
    return typeof header.id === 'string' && header.id.length > 0 ? { sessionId: header.id, logPath } : null
  } catch { return null }
}

export const layout: AdapterLayout = {
  acceptsSessionId: true,
  root: piSessionsDir,
  dirFor: cwd => !process.env.QUUU_PI_SESSIONS_DIR && process.env.PI_CODING_AGENT_SESSION_DIR
    ? piSessionsDir() : join(piSessionsDir(), piDirName(cwd)),
  // Pi prefixes the file with its own timestamp, so the path cannot be predicted before launch.
  logPathFor: (cwd, id) => findIn(layout.dirFor(cwd)!, id, cwd) ?? findIn(piSessionsDir(), id, cwd),
  scan: id => {
    const root = piSessionsDir()
    let dirs: string[]
    try { dirs = [root, ...readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => join(root, e.name))] }
    catch { return null }
    for (const dir of dirs) {
      const path = findIn(dir, id)
      if (path) return path
    }
    return null
  }
}

function findIn(dir: string, id: string, cwd?: string): string | null {
  let names: string[]
  try { names = readdirSync(dir) } catch { return null }
  for (const name of names) {
    if (!name.endsWith(`_${id}.jsonl`)) continue
    const found = candidate(dir, name)
    if (found?.sessionId !== id) continue
    if (cwd) {
      try {
        const header = sessionHeader(found.logPath)
        if (typeof header.cwd !== 'string' || !sameDir(header.cwd, cwd)) continue
      } catch { continue }
    }
    return found.logPath
  }
  return null
}

export function sessionCandidates(cwd: string): SessionCandidate[] {
  // Directory encoding is lossy (a/b and a-b collide). The header remains authoritative.
  const found = candidatesIn(layout, cwd, candidate)
  // --session-dir stores files directly in the override, without an encoded cwd directory.
  if (layout.dirFor(cwd) !== piSessionsDir()) found.push(...candidatesIn({ ...layout, dirFor: piSessionsDir }, cwd, candidate))
  return found.filter(c => {
    try {
      const header = sessionHeader(c.logPath)
      return typeof header.cwd === 'string' && sameDir(header.cwd, cwd)
    } catch { return false }
  })
}
