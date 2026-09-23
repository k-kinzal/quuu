import {
  statSync
} from 'node:fs'
import { DEEP_BYTES, HEAD_BYTES, discoverFiles, firstLine, readHead, type ExternalLogs, type ExternalSession } from '../external.js'
import { layout } from './layout.js'

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

function readCodexSession(path: string, bytes = HEAD_BYTES): ExternalSession | null {
  const head = readHead(path, bytes)
  const lines = head.split('\n')

  let cwd = ''
  let sessionId = ''
  let startedAt = ''
  let title: string | null = null
  let originator: string | null = null

  for (const line of lines) {
    if (line.trim().length === 0) continue
    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    const payload = entry.payload as Record<string, unknown> | undefined

    if (entry.type === 'session_meta' && payload) {
      if (typeof payload.cwd === 'string') cwd = payload.cwd
      if (typeof payload.session_id === 'string') sessionId = payload.session_id
      if (typeof payload.timestamp === 'string') startedAt = payload.timestamp
      // Origin. `codex exec` (program-started) and interactive sessions split here
      if (typeof payload.originator === 'string') originator = payload.originator
    }

    // Use the first human-written message as the title.
    // The developer role is preamble (AGENTS.md etc.), so skip it.
    if (!title && entry.type === 'response_item' && payload?.type === 'message') {
      if (payload.role === 'user') {
        const content = payload.content
        if (Array.isArray(content)) {
          const text = content
            .map((c) => (c && typeof c === 'object' ? String((c as { text?: string }).text ?? '') : ''))
            .join('')
          const candidate = firstLine(text)
          if (candidate && !candidate.startsWith('# AGENTS.md')) title = candidate
        }
      }
    }
    if (cwd && sessionId && startedAt && title) break
  }

  if (!cwd || !sessionId) return null

  // Re-read one level deeper only when no title was found
  if (!title && bytes < DEEP_BYTES && statSync(path).size > bytes) {
    const deeper = readCodexSession(path, DEEP_BYTES)
    if (deeper?.title) return deeper
  }

  const stat = statSync(path)
  return {
    adapter: 'codex',
    key: `codex:${sessionId}`,
    sessionId,
    cwd,
    title,
    logPath: path,
    startedAt: startedAt || stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    command: 'codex',
    entrypoint: originator
  }
}
export const external: ExternalLogs = {
  files: options => discoverFiles(layout, options),
  read: file => readCodexSession(file.path)
}
