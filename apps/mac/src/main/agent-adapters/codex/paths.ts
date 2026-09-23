import type { Dirent } from 'node:fs'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { codexSessionsDir } from '../../appPaths.js'

export function resolveCodexLog(sessionId: string): string | null {
  const root = codexSessionsDir()
  const day = codexDayDir(root, sessionId)
  return day ? scanCodexTree(day, sessionId, 0) ?? scanCodexTree(root, sessionId, 3) : null
}
function codexDayDir(root: string, sessionId: string): string | null {
  const match = /^([0-9a-f]{8})-([0-9a-f]{4})-7[0-9a-f]{3}-/i.exec(sessionId)
  if (!match) return null
  const at = new Date(Number.parseInt(`${match[1]}${match[2]}`, 16))
  if (!Number.isFinite(at.getTime())) return null
  const year = String(at.getUTCFullYear()).padStart(4, '0')
  const month = String(at.getUTCMonth() + 1).padStart(2, '0')
  const day = String(at.getUTCDate()).padStart(2, '0')
  return join(root, year, month, day)
}
function scanCodexTree(dir: string, sessionId: string, depth: number): string | null {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf8' })
  } catch {
    return null
  }

  const suffix = `-${sessionId}.jsonl`
  for (const entry of entries) {
    if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith(suffix)) {
      return join(dir, entry.name)
    }
  }
  if (depth === 0) return null

  // Newest date first. What gets opened is normally a recent run, so it turns up in the first few directories.
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a))
  for (const name of directories) {
    const found = scanCodexTree(join(dir, name), sessionId, depth - 1)
    if (found) return found
  }
  return null
}
