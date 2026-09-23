import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { LogAdapter } from '../agents/cliAdapter.js'
import { layoutLastWrittenMs } from './files.js'
import type { AdapterLayout } from './layout.js'
export interface ExternalSession {
  adapter: LogAdapter
  /** Unique key `<adapter>:<sessionId>`. Used for import idempotency. */
  key: string
  sessionId: string
  cwd: string
  title: string | null
  logPath: string
  startedAt: string
  /** Last update. Used to decide whether it is running, and as a stand-in for the finish time. */
  updatedAt: string
  /** CLI command used (for display). */
  command: string
  /**
   * What started this session (Claude Code's `entrypoint` / Codex's `originator`).
   * null for old logs without the marker. `startedByProgram` owns the decision.
   */
  entrypoint: string | null
}

export function startedByProgram(entrypoint: string | null): boolean {
  if (entrypoint === null) return false
  const v = entrypoint.toLowerCase()
  return v.includes('sdk') || v.includes('exec') || v.includes('subagent')
}

export const HEAD_BYTES = 64 * 1024

export const DEEP_BYTES = 768 * 1024

export function readHead(path: string, bytes = HEAD_BYTES): string {
  const fd = openSync(path, 'r')
  try {
    const size = statSync(path).size
    const length = Math.min(bytes, size)
    const buf = Buffer.allocUnsafe(length)
    const read = readSync(fd, buf, 0, length, 0)
    return buf.subarray(0, read).toString('utf8')
  } finally {
    closeSync(fd)
  }
}

export function walk(dir: string, out: string[], depth = 0): void {
  if (depth > 6) return
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>
  try {
    entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf8' })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out, depth + 1)
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(full)
  }
}

export function dirsAtDepth(root: string, depth: number): string[] {
  let current = [root]
  for (let i = 0; i < depth; i += 1) {
    const next: string[] = []
    for (const dir of current) {
      let entries: Array<{ name: string; isDirectory(): boolean }>
      try {
        entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf8' })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (entry.isDirectory()) next.push(join(dir, entry.name))
      }
    }
    current = next
  }
  return current
}

export function decodeDirName(name: string): string | null {
  try {
    const decoded = decodeURIComponent(name)
    return decoded.startsWith('/') ? decoded : null
  } catch {
    return null
  }
}

export function firstLine(text: string): string | null {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('<'))
  if (!line) return null
  return line.length > 120 ? `${line.slice(0, 119)}…` : line
}

export interface ExternalFile { path: string; mtimeMs: number; sessionId?: string }
export interface DiscoverOptions { since: Date | null; limit: number }
export interface ExternalLogs {
  files(options: DiscoverOptions): ExternalFile[]
  read(file: ExternalFile): ExternalSession | null
}
export function discoverFiles(layout: AdapterLayout, options: DiscoverOptions, depth?: number, leaf?: string): ExternalFile[] {
  const root = layout.root()
  if (!existsSync(root)) return []
  const paths: string[] = []
  if (depth === undefined) walk(root, paths)
  else for (const dir of dirsAtDepth(root, depth)) paths.push(join(dir, leaf!))
  return paths.flatMap(path => {
    try {
      const stat = statSync(path)
      if (!stat.size) return []
      const mtimeMs = layoutLastWrittenMs(layout, path) ?? stat.mtimeMs
      return options.since && mtimeMs < options.since.getTime() ? [] : [{ path, mtimeMs }]
    } catch { return [] }
  })
}
