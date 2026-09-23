import type { SessionBlock, SessionMessage } from '../../session/types.js'
import { firstDifference } from '../messageDifference.js'
import type { StoreReloadResult } from '../parserUtil.js'
import { collectText, firstLine } from '../parserUtil.js'
import type { OpencodeMessage } from './store.js'
import { readOpencodeMessages } from './store.js'

/**
 * Converts an opencode CLI session into a message list for the UI.
 *
 * Like Cursor this is **replacement, not append** (`opencodeStore.ts`): rows are rewritten as a
 * turn streams in, so remembering a read position means nothing. Re-read, then say where the
 * difference from last time starts; SessionWatcher re-pastes from there.
 *
 * Rows (observed; opencode v2.0.8):
 *
 *   user      … {text, files}                  the prompt, as the CLI recorded it
 *   assistant … {model, content:[…], time}     reasoning / text / tool, in the order they happened
 *   idle      … {outcome}                      the turn finished. Machinery, never shown
 *   system / compaction …                      context the CLI manages for itself. Not shown
 */

interface ContentBlock {
  type?: string
  text?: unknown
  id?: string
  name?: string
  state?: {
    status?: string
    input?: unknown
    content?: unknown
    output?: unknown
    error?: unknown
  }
}

/** Keys that name what a call acts on, in the order they are preferred (opencode's own tools). */
const TARGET_KEYS = ['command', 'path', 'filePath', 'pattern', 'query', 'url']

export class OpencodeSessionParser {
  messages: SessionMessage[] = []
  title: string | null = null

  /**
   * Re-reads the session out of the store. Returns where changes start (-1 for no change).
   *
   * Also -1 when unreadable. A read can land mid-write, and emptying the conversation there makes
   * the screen flash blank, so the previous content is kept.
   */
  reload(storePath: string, sessionId: string): StoreReloadResult {
    const rows = readOpencodeMessages(sessionId, { storePath })
    if (rows === null) return { changedFromIndex: -1, readSucceeded: false }

    const next: SessionMessage[] = []
    let title: string | null = null

    for (const row of rows) {
      const message = convert(row, next.length)
      if (!message) continue
      if (message.role === 'user' && !title) {
        const text = message.blocks.find((b) => b.kind === 'text')
        if (text?.kind === 'text') title = firstLine(text.text)
      }
      next.push(message)
    }

    const changed = firstDifference(this.messages, next)
    this.messages = next
    this.title = title
    return { changedFromIndex: changed, readSucceeded: true }
  }
}

function convert(row: OpencodeMessage, index: number): SessionMessage | null {
  const data = (row.data ?? {}) as { text?: unknown; content?: unknown; model?: { id?: unknown } }

  if (row.type === 'user') {
    const text = unquotePrompt(collectText(data.text))
    if (text.length === 0) return null
    return message(row, index, 'user', [{ kind: 'text', text }], null)
  }

  if (row.type !== 'assistant') return null

  const blocks: SessionBlock[] = []
  for (const block of blocksOf(data.content)) {
    if (block.type === 'reasoning') {
      const text = collectText(block.text)
      if (text.trim().length > 0) blocks.push({ kind: 'thinking', text })
    } else if (block.type === 'text') {
      const text = collectText(block.text)
      if (text.trim().length > 0) blocks.push({ kind: 'text', text })
    } else if (block.type === 'tool') {
      const input = block.state?.input ?? {}
      const error = block.state?.status === 'error'
      const result = error
        ? errorText(block.state?.error)
        : collectText(block.state?.content ?? block.state?.output)
      blocks.push({
        kind: 'tool',
        tool: {
          id: block.id ?? `opencode_tool_${index}_${blocks.length}`,
          name: block.name ?? 'tool',
          input,
          target: targetOf(input),
          // A call still running has neither result nor error yet
          result: result.length > 0 ? result : null,
          isError: error,
          images: []
        }
      })
    }
  }

  if (blocks.length === 0) return null
  const model = typeof data.model?.id === 'string' ? data.model.id : null
  return message(row, index, 'assistant', blocks, model)
}

function message(
  row: OpencodeMessage,
  index: number,
  role: SessionMessage['role'],
  blocks: SessionBlock[],
  model: string | null
): SessionMessage {
  return {
    id: `opencode_${row.id || index}`,
    role,
    isSidechain: false,
    timestamp: row.createdMs > 0 ? new Date(row.createdMs).toISOString() : null,
    blocks,
    model
  }
}

function blocksOf(content: unknown): ContentBlock[] {
  if (!Array.isArray(content)) return []
  return content.filter((c): c is ContentBlock => Boolean(c) && typeof c === 'object')
}

/**
 * Undo the quoting `opencode run` puts around a prompt it was handed on the command line.
 *
 * Measured: `opencode run "fix it"` is stored as `"fix it"`, and inner quotes come back escaped.
 * Left alone, every prompt Quuu sends would appear on screen wearing quote marks it never had.
 * Only a text that is quoted **end to end** is unwrapped, so a message that merely contains
 * quotes is shown exactly as it was written.
 */
export function unquotePrompt(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length < 2 || !trimmed.startsWith('"') || !trimmed.endsWith('"')) return trimmed
  const inner = trimmed.slice(1, -1)
  // A bare `"` inside means the quotes are not a wrapper but part of what was written
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] === '\\') {
      i += 1
      continue
    }
    if (inner[i] === '"') return trimmed
  }
  return inner.replace(/\\(["\\])/g, '$1')
}

/**
 * What went wrong, said in words.
 *
 * A failed call carries `{type, message}`. Without picking the message out, the row shows the
 * JSON of the error object, which buries the one line that says what happened.
 */
function errorText(error: unknown): string {
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
  }
  return collectText(error)
}

/** "What it acts on", as one value. null when the tool names nothing recognizable. */
function targetOf(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const values = input as Record<string, unknown>
  for (const key of TARGET_KEYS) {
    const value = values[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}
