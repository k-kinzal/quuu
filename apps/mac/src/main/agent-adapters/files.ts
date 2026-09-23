import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AdapterLayout } from './layout.js'

export function withReal(cwd: string): string[] {
  const out = [cwd]
  try {
    const real = realpathSync(cwd)
    if (real !== cwd) out.push(real)
  } catch {
    // Even when cwd is gone, still look where we expect it to be
  }
  return out
}

export function scanLeaf(root: string, sessionId: string, leaf: string): string | null {
  let names: string[]
  try { names = readdirSync(root) } catch { return null }
  for (const name of names) {
    const candidate = join(root, name, sessionId, leaf)
    if (existsSync(candidate)) return candidate
  }
  return null
}

export function layoutLastWrittenMs(layout: AdapterLayout, logPath: string, sessionId?: string): number | null {
  /*
   * In a store shared by every session the file's timestamp moves whenever **anyone** writes, so
   * a session that finished hours ago would look busy for as long as the machine is.
   */
  if (sessionId && layout.lastWrittenFor) return layout.lastWrittenFor(sessionId)
  let newest: number | null = mtimeMs(logPath)
  for (const companion of layout.companions?.(logPath) ?? []) {
    const at = mtimeMs(companion)
    if (at !== null && (newest === null || at > newest)) newest = at
  }
  return newest
}
function mtimeMs(path: string): number | null {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}
