import {
  statSync
} from 'node:fs'
import { discoverFiles, firstLine, readHead, type ExternalLogs, type ExternalSession } from '../external.js'
import { layout } from './layout.js'

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

function readClaudeSession(path: string): ExternalSession | null {
  const head = readHead(path)
  const lines = head.split('\n')

  let cwd = ''
  let sessionId = ''
  let startedAt = ''
  let title: string | null = null
  let entrypoint: string | null = null

  for (const line of lines) {
    if (line.trim().length === 0) continue
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    if (typeof entry.cwd === 'string' && !cwd) cwd = entry.cwd
    if (typeof entry.sessionId === 'string' && !sessionId) sessionId = entry.sessionId
    if (typeof entry.timestamp === 'string' && !startedAt) startedAt = entry.timestamp
    // The origin marker rides on the same line as cwd, but some versions lack it, so pick it up independently
    if (typeof entry.entrypoint === 'string' && !entrypoint) entrypoint = entry.entrypoint
    if (entry.type === 'ai-title' && typeof entry.aiTitle === 'string') title = entry.aiTitle
    if (!title && entry.type === 'user') {
      const message = entry.message as { content?: unknown } | undefined
      if (typeof message?.content === 'string') title = firstLine(message.content)
    }
    if (cwd && sessionId && startedAt && title && entrypoint) break
  }

  if (!cwd || !sessionId) return null

  const stat = statSync(path)
  return {
    adapter: 'claude',
    key: `claude:${sessionId}`,
    sessionId,
    cwd,
    title,
    logPath: path,
    startedAt: startedAt || stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    command: 'claude',
    entrypoint
  }
}
export const external: ExternalLogs = {
  files: options => discoverFiles(layout, options),
  read: file => readClaudeSession(file.path)
}
