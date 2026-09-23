import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs'
import type { LogAdapter } from '../agents/cliAdapter.js'
import { t } from '../i18n/index.js'
import { readsWholeStore } from '../session/logAdapters.js'
import { isStoreParser, newParser, stdoutToMessages } from '../session/sessionWatcher.js'
import type { SessionMessage } from '../session/types.js'
import type { SyncMessage } from './protocol.js'

/**
 * Read a session log **once** and shape it for the trip to the iPhone.
 *
 * The `SessionWatcher` the UI uses is a tool for following the one session currently open, and it
 * holds state. Opening it on every export would steal the watch target out from under the
 * conversation a human is reading. This watches nothing: it reads and throws away.
 *
 * **If only the tail is needed, read only the tail.** Only the last 60 messages travel, yet this
 * used to read the whole log and parse every line. A Claude session log runs to tens of MB, and
 * one export measured **797MB and 3 seconds** (the main process is single-threaded, so IPC stops
 * with it and the on-screen log falls behind).
 */

/** Drop the tool contents and keep only the body. */
function toSyncMessage(message: SessionMessage): SyncMessage | null {
  let text = ''
  let tools = 0
  for (const block of message.blocks) {
    switch (block.kind) {
      case 'text':
        text += (text ? '\n\n' : '') + block.text
        break
      case 'tool':
        tools += 1
        break
      case 'image':
        // The bytes do not travel (tens of MB per session). Only the fact that it existed remains
        text += (text ? '\n\n' : '') + t('mobileSync.imageOmitted')
        break
      case 'thinking':
        // Thinking in progress does not travel. What people want to read is the conclusion
        break
    }
  }
  if (!text && tools === 0) return null
  return {
    id: message.id,
    role: message.role,
    at: message.timestamp,
    text,
    tools
  }
}

/**
 * Read only the tail.
 *
 * The start lands in the middle of a line, so everything up to the first newline is dropped.
 * A multi-byte character cut in half sits on that same line, so it goes with it.
 */
function readTail(logPath: string, maxBytes: number): { text: string; clipped: boolean } {
  const fd = openSync(logPath, 'r')
  try {
    const size = fstatSync(fd).size
    if (size <= maxBytes) return { text: readFileSync(logPath, 'utf8'), clipped: false }
    const buffer = Buffer.allocUnsafe(maxBytes)
    readSync(fd, buffer, 0, maxBytes, size - maxBytes)
    const text = buffer.toString('utf8')
    const nl = text.indexOf('\n')
    return { text: nl >= 0 ? text.slice(nl + 1) : '', clipped: true }
  } finally {
    closeSync(fd)
  }
}

function parseFile(
  logPath: string,
  mode: LogAdapter,
  sessionId: string,
  scanBytes: number
): { messages: SessionMessage[]; clipped: boolean } {
  if (readsWholeStore(mode)) {
    // Not one file per session (Cursor / opencode). How it is read is left to the parser
    const parser = newParser(mode)
    if (isStoreParser(parser)) parser.reload(logPath, sessionId)
    return { messages: parser.messages, clipped: false }
  }

  const { text, clipped } = readTail(logPath, scanBytes)
  if (mode === 'stdout') return { messages: stdoutToMessages(text), clipped }
  return { messages: parseLines(text.split('\n'), mode), clipped }
}

function parseLines(lines: string[], mode: LogAdapter): SessionMessage[] {
  const parser = newParser(mode)
  if (!isStoreParser(parser)) parser.pushLines(lines)
  return parser.messages
}

export interface ConversationTail {
  messages: SyncMessage[]
  truncated: boolean
}

/**
 * Read the tail of the conversation.
 *
 * At most `limit` messages travel. Putting a long session onto iCloud whole clogs both directions
 * and turns into "what you want to read will not load".
 * Sub-agent utterances are dropped (what the Mac folds away is not unfolded on the iPhone).
 */
export function readConversationTail(
  logPath: string | null,
  mode: LogAdapter,
  sessionId: string,
  limit: number,
  maxBytes: number,
  scanBytes: number
): ConversationTail {
  if (!logPath || !existsSync(logPath)) return { messages: [], truncated: false }

  let raw: SessionMessage[]
  let clipped: boolean
  try {
    ; ({ messages: raw, clipped } = parseFile(logPath, mode, sessionId, scanBytes))
  } catch {
    // An unreadable log does not stop the whole export (other tasks' details still want to travel)
    return { messages: [], truncated: false }
  }

  let converted = raw.filter((m) => !m.isSidechain).flatMap((m) => toSyncMessage(m) ?? [])
  /*
   * Read from the tail, the very oldest message is sometimes **assembled from halfway through**
   * (the tool_use it follows sits outside the range read). Drop one
   */
  if (clipped && converted.length > 1) converted = converted.slice(1)

  let truncated = clipped || converted.length > limit
  let tail = converted.length > limit ? converted.slice(-limit) : converted

  // When the count alone is not enough, drop from the old end to fit the size budget
  while (tail.length > 1 && JSON.stringify(tail).length > maxBytes) {
    tail = tail.slice(1)
    truncated = true
  }
  return { messages: tail, truncated }
}
