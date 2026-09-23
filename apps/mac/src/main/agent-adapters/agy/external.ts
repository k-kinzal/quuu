import {
  readFileSync,
  statSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  agyAnnotationsDir,
  agyConversationsCachePath
} from '../../appPaths.js'
import { DEEP_BYTES, discoverFiles, firstLine, readHead, type ExternalLogs, type ExternalSession } from '../external.js'
import { collectText } from '../parserUtil.js'
import { layout } from './layout.js'
import { userText as agyUserText } from './parser.js'

// ---------------------------------------------------------------------------
// Antigravity (agy)
// ---------------------------------------------------------------------------

/**
 * `brain/<conversationId>/.system_generated/logs/transcript.jsonl`.
 *
 * The transcript names no working directory, and neither does the conversation store: the CLI
 * writes a directory in exactly one place, a cache of **the newest conversation per directory**
 * (measured). So a conversation is importable only while it is the newest one its directory saw;
 * an older one in the same directory cannot be placed in a project, and guessing would file work
 * under whichever project happened to be nearby.
 */
function readAgySession(transcriptPath: string): ExternalSession | null {
  const conversationId = basename(dirname(dirname(dirname(transcriptPath))))
  const cwd = agyCwdOf(conversationId)
  if (!cwd) return null

  const stat = statSync(transcriptPath)
  const head = readAgyHead(transcriptPath)
  return {
    adapter: 'agy',
    key: `agy:${conversationId}`,
    sessionId: conversationId,
    cwd,
    title: agyTitle(conversationId) ?? head.title,
    logPath: transcriptPath,
    startedAt: head.startedAt || stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    command: 'agy',
    // No origin marker is written (observed). Treat as typed by a human.
    entrypoint: null
  }
}

/** Which directory that conversation belongs to. null when it is no longer the newest one there. */
function agyCwdOf(conversationId: string): string | null {
  let text: string
  try {
    text = readFileSync(agyConversationsCachePath(), 'utf8')
  } catch {
    return null
  }
  try {
    const json = JSON.parse(text) as Record<string, unknown>
    for (const [cwd, id] of Object.entries(json)) {
      if (id === conversationId && cwd.startsWith('/')) return cwd
    }
  } catch {
    // An unreadable cache means no conversation can be placed. Better than placing it wrongly
  }
  return null
}

/** The title the CLI generated for that conversation (`annotations/<id>.pbtxt`). */
function agyTitle(conversationId: string): string | null {
  let text: string
  try {
    text = readFileSync(join(agyAnnotationsDir(), `${conversationId}.pbtxt`), 'utf8')
  } catch {
    return null
  }
  const match = /^title:\s*"((?:[^"\\]|\\.)*)"/m.exec(text)
  if (!match) return null
  const title = match[1].replace(/\\(["\\])/g, '$1').trim()
  return title.length > 0 ? title : null
}

/** The first thing the human asked, and when. */
function readAgyHead(transcriptPath: string): { title: string | null; startedAt: string } {
  for (const line of readHead(transcriptPath, DEEP_BYTES).split('\n')) {
    if (line.trim().length === 0) continue
    let step: { source?: string; content?: unknown; created_at?: unknown }
    try {
      step = JSON.parse(line) as typeof step
    } catch {
      continue
    }
    if (step.source !== 'USER_EXPLICIT') continue
    return {
      title: firstLine(agyUserText(collectText(step.content))),
      startedAt: typeof step.created_at === 'string' ? step.created_at : ''
    }
  }
  return { title: null, startedAt: '' }
}
export const external: ExternalLogs = {
  files: options => discoverFiles(layout, options, 1, join('.system_generated', 'logs', 'transcript.jsonl')),
  read: file => readAgySession(file.path)
}
