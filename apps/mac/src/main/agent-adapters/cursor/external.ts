import {
  readFileSync,
  statSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { discoverFiles, firstLine, type ExternalLogs, type ExternalSession } from '../external.js'
import { layoutLastWrittenMs } from '../files.js'
import { isMachineNotification } from '../injectedText.js'
import { collectText, extractUserQuery } from '../parserUtil.js'
import { layout } from './layout.js'
import { readCursorChat } from './store.js'

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

/**
 * How many messages to read for the title and provenance.
 *
 * A single Cursor conversation can be tens of MB. Import only needs
 * "who, where, and what was asked", so read the head and stop.
 * A few preamble messages (system prompt, environment info) come first, so leave room for them.
 */
const CURSOR_HEAD_MESSAGES = 8

function readCursorSession(storePath: string): ExternalSession | null {
  const chatId = basename(dirname(storePath))
  const meta = readCursorMeta(dirname(storePath))
  const chat = readCursorChat(storePath, chatId, { maxMessages: CURSOR_HEAD_MESSAGES })
  if (!chat) return null

  const cwd = meta?.cwd ?? chat.workspacePath
  if (!cwd) return null

  const stat = statSync(storePath)
  const createdMs = meta?.createdAtMs ?? null
  /*
   * For the last-active time, take the newer of meta.json and the file timestamps.
   *
   * meta.json's updatedAtMs is written at the start of a turn and is not updated
   * by writes to store.db after that (we observed a chat off by 7 minutes).
   * Using it alone as the last update would drop the session to "done" that much earlier.
   */
  const updatedMs = newest([meta?.updatedAtMs ?? null, layoutLastWrittenMs(layout, storePath)])

  return {
    adapter: 'cursor',
    key: `cursor:${chatId}`,
    sessionId: chatId,
    cwd,
    title: cursorTitle(chat.messages) ?? placeholderName(chat.name),
    logPath: storePath,
    startedAt: (createdMs === null ? stat.birthtime : new Date(createdMs)).toISOString(),
    updatedAt: (updatedMs === null ? stat.mtime : new Date(updatedMs)).toISOString(),
    command: 'cursor-agent',
    /*
     * Only chats started from the CLI carry the `cli` marker (ones created in the IDE do not).
     * Subagents have no marker; instead a preamble saying they run under a parent agent
     * is injected, so we tell them apart by that.
     */
    entrypoint: isCursorSubagent(chat.messages) ? 'cursor-subagent' : chat.entrypoint
  }
}

interface CursorMeta {
  cwd: string | null
  createdAtMs: number | null
  updatedAtMs: number | null
}

/** `<chatId>/meta.json`. The cheapest place to read cwd and the timestamps. */
function readCursorMeta(dir: string): CursorMeta | null {
  let text: string
  try {
    text = readFileSync(join(dir, 'meta.json'), 'utf8')
  } catch {
    return null
  }
  try {
    const json = JSON.parse(text) as {
      cwd?: unknown
      createdAtMs?: unknown
      updatedAtMs?: unknown
    }
    return {
      cwd: typeof json.cwd === 'string' ? json.cwd : null,
      createdAtMs: typeof json.createdAtMs === 'number' ? json.createdAtMs : null,
      updatedAtMs: typeof json.updatedAtMs === 'number' ? json.updatedAtMs : null
    }
  } catch {
    return null
  }
}

function cursorTitle(messages: Array<{ role: string; content: unknown }>): string | null {
  for (const message of messages) {
    if (message.role !== 'user') continue
    const text = collectText(message.content)
    // Cursor's own prompt to itself wears the same wrapper (injectedText.ts)
    if (isMachineNotification(text)) continue
    const body = extractUserQuery(text)
    // Messages without `<user_query>` are preamble such as environment info
    if (body === text.trim()) continue
    const line = firstLine(body)
    if (line) return line
  }
  return null
}

/** Preamble injected into subagents (observed). */
function isCursorSubagent(messages: Array<{ role: string; content: unknown }>): boolean {
  return messages.some(
    (m) => m.role === 'user' && collectText(m.content).includes('running as a subagent')
  )
}

/** Newest of the candidate times. null when none is readable. */
function newest(candidates: Array<number | null>): number | null {
  let out: number | null = null
  for (const value of candidates) {
    if (value === null) continue
    if (out === null || value > out) out = value
  }
  return out
}

/** Default names like `New Agent` are meaningless as titles. */
function placeholderName(name: string | null): string | null {
  if (!name || name === 'New Agent') return null
  return name
}
export const external: ExternalLogs = {
  files: options => discoverFiles(layout, options, 2, 'store.db'),
  read: file => readCursorSession(file.path)
}
