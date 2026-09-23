import {
  statSync
} from 'node:fs'
import { basename, dirname } from 'node:path'
import { DEEP_BYTES, discoverFiles, firstLine, readHead, type ExternalLogs, type ExternalSession } from '../external.js'
import { collectText } from '../parserUtil.js'
import { layout } from './layout.js'
import { readCopilotWorkspace } from './paths.js'

// ---------------------------------------------------------------------------
// GitHub Copilot
// ---------------------------------------------------------------------------

function readCopilotSession(eventsPath: string): ExternalSession | null {
  const sessionId = basename(dirname(eventsPath))
  const workspace = readCopilotWorkspace(sessionId)
  const fromEvents = workspace ? null : readCopilotStart(eventsPath)

  const cwd = workspace?.cwd ?? fromEvents?.cwd
  if (!cwd) return null

  const stat = statSync(eventsPath)
  return {
    adapter: 'copilot',
    key: `copilot:${sessionId}`,
    sessionId,
    cwd,
    title: workspace?.title ?? readCopilotTitle(eventsPath),
    logPath: eventsPath,
    startedAt: workspace?.createdAt ?? fromEvents?.startedAt ?? stat.birthtime.toISOString(),
    updatedAt: workspace?.updatedAt ?? stat.mtime.toISOString(),
    command: 'copilot',
    // No origin marker is written (observed). Treat as typed by a human.
    entrypoint: null
  }
}

function readCopilotStart(eventsPath: string): { cwd: string; startedAt: string } | null {
  for (const line of readHead(eventsPath).split('\n')) {
    if (line.trim().length === 0) continue
    let entry: { type?: string; data?: { context?: { cwd?: unknown }; startTime?: unknown } }
    try {
      entry = JSON.parse(line) as typeof entry
    } catch {
      continue
    }
    if (entry.type !== 'session.start') continue
    const cwd = entry.data?.context?.cwd
    if (typeof cwd !== 'string') continue
    const startTime = entry.data?.startTime
    return { cwd, startedAt: typeof startTime === 'string' ? startTime : '' }
  }
  return null
}

function readCopilotTitle(eventsPath: string): string | null {
  for (const line of readHead(eventsPath, DEEP_BYTES).split('\n')) {
    if (line.trim().length === 0) continue
    let entry: { type?: string; data?: { content?: unknown } }
    try {
      entry = JSON.parse(line) as typeof entry
    } catch {
      continue
    }
    if (entry.type !== 'user.message') continue
    // Copilot keeps the raw body (the preamble lives in transformedContent)
    const line1 = firstLine(collectText(entry.data?.content))
    if (line1) return line1
  }
  return null
}
export const external: ExternalLogs = {
  files: options => discoverFiles(layout, options, 1, 'events.jsonl'),
  read: file => readCopilotSession(file.path)
}
