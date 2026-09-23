import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs'
import { withReal } from './files.js'
import type { AdapterLayout } from './layout.js'

export interface SessionCandidate { sessionId: string; logPath: string; bornMs: number }
export function candidatesIn(layout: AdapterLayout, cwd: string, entry: (dir: string, name: string) => { sessionId: string; logPath: string } | null): SessionCandidate[] {
  const dirs = new Set(withReal(cwd).map(dir => layout.dirFor(dir)).filter((dir): dir is string => dir !== null))
  const candidates: SessionCandidate[] = []
  for (const dir of dirs) {
    let names: string[]
    try { names = readdirSync(dir) } catch { continue }
    for (const name of names) {
      const candidate = entry(dir, name)
      if (!candidate) continue
      try {
        const stat = statSync(candidate.logPath)
        if (stat.size) candidates.push({ ...candidate, bornMs: stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs })
      } catch { /* A disappearing or incomplete session is not evidence of identity. */ }
    }
  }
  return candidates
}

const HEAD_BYTES = 64 * 1024
export function jsonEscaped(head: string): string {
  return JSON.stringify(head).slice(1, -1)
}
function headContains(logPath: string, needle: string): boolean {
  let fd: number
  try {
    fd = openSync(logPath, 'r')
  } catch {
    return false
  }
  try {
    const buf = Buffer.allocUnsafe(HEAD_BYTES)
    const read = readSync(fd, buf, 0, HEAD_BYTES, 0)
    return buf.subarray(0, read).toString('utf8').includes(needle)
  } catch {
    return false
  } finally {
    closeSync(fd)
  }
}
export function jsonLogMentions(candidate: SessionCandidate, head: string): boolean {
  return headContains(candidate.logPath, jsonEscaped(head))
}
