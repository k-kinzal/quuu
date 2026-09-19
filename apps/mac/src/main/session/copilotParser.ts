import { MemoryMessages, type MessageBuffer } from './messageBuffer.js'
import type { PushResult } from './parserUtil.js'
import { collectText, firstLine } from './parserUtil.js'
import type { SessionMessage } from './types.js'

/**
 * Converts the GitHub Copilot CLI's `events.jsonl` into a message list for the UI.
 *
 * Lines handled (observed; `~/.copilot/session-state/<sessionId>/events.jsonl`):
 *   user.message            … utterance. `content` is what the human typed,
 *                             `transformedContent` is the send version with preamble added
 *   assistant.message      … response. `content` and `toolRequests`
 *   tool.execution_complete … tool result (joined by toolCallId)
 *   session.error           … error during execution
 *   session.shutdown        … end marker (used for liveness checks; liveness.ts)
 *
 * **Show `content`.** Copilot adds timestamps and reminders to the send body,
 * so showing `transformedContent` puts words in the human's mouth. Other CLIs
 * are filtered by shape (injectedText.ts), but Copilot keeps the raw body
 * separately, so taking that side needs no detection at all.
 */

interface RawToolRequest {
  toolCallId?: string
  name?: string
  arguments?: unknown
}

interface RawData {
  newModel?: unknown
  content?: unknown
  transformedContent?: unknown
  toolRequests?: RawToolRequest[]
  toolCallId?: string
  toolName?: string
  arguments?: unknown
  success?: boolean
  result?: unknown
  message?: unknown
  error?: unknown
  model?: string
  context?: { cwd?: string }
  sessionId?: string
}

interface RawLine {
  type?: string
  data?: RawData
  timestamp?: string
}

export class CopilotSessionParser {
  get messages(): SessionMessage[] { return this.buffer.all() }
  constructor(readonly buffer: MessageBuffer = new MemoryMessages()) {}
  title: string | null = null

  private toolIndex = new Map<string, { m: number; b: number }>()
  private counter = 0
  private model: string | null = null

  pushLines(lines: string[]): PushResult {
    let changedFrom = -1
    const mark = (i: number): void => {
      if (i < 0) return
      changedFrom = changedFrom === -1 ? i : Math.min(changedFrom, i)
    }

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.length === 0) continue

      let entry: RawLine
      try {
        entry = JSON.parse(trimmed) as RawLine
      } catch {
        continue
      }
      const data = entry.data
      const ts = typeof entry.timestamp === 'string' ? entry.timestamp : null

      switch (entry.type) {
        case 'session.model_change': {
          // The observed key is newModel. model is insurance against a future alias.
          const next = data?.newModel ?? data?.model
          if (typeof next === 'string') this.model = next
          break
        }

        case 'user.message': {
          const text = collectText(data?.content).trim()
          if (text.length === 0) break
          if (!this.title) this.title = firstLine(text)
          this.push({ role: 'user', timestamp: ts, blocks: [{ kind: 'text', text }] }, mark)
          break
        }

        case 'assistant.message': {
          const text = collectText(data?.content)
          const calls = data?.toolRequests ?? []
          if (text.trim().length === 0 && calls.length === 0) break

          const blocks: SessionMessage['blocks'] = []
          if (text.trim().length > 0) blocks.push({ kind: 'text', text })
          for (const call of calls) {
            const id = call.toolCallId ?? `tool_${this.counter}_${blocks.length}`
            blocks.push({
              kind: 'tool',
              tool: {
                id,
                name: call.name ?? 'tool',
                input: call.arguments ?? {},
                target: null,
                result: null,
                isError: false,
                images: []
              }
            })
          }

          this.push({ role: 'assistant', timestamp: ts, blocks, model: this.model }, mark)
          const m = this.buffer.length - 1
          blocks.forEach((b, i) => {
            if (b.kind === 'tool') this.toolIndex.set(b.tool.id, { m, b: i })
          })
          break
        }

        case 'tool.execution_complete': {
          const id = data?.toolCallId
          if (!id) break
          const loc = this.toolIndex.get(id)
          if (!loc) break
          const block = this.buffer.get(loc.m)?.blocks[loc.b]
          if (block?.kind === 'tool') {
            block.tool.result = resultText(data?.result)
            // Treat as failed only when success is explicitly false (unspecified means success)
            block.tool.isError = data?.success === false
            mark(loc.m)
            this.toolIndex.delete(id)
          }
          break
        }

        case 'session.error': {
          const text = collectText(data?.message ?? data?.error)
          if (text.trim().length === 0) break
          this.push({ role: 'system', timestamp: ts, blocks: [{ kind: 'text', text }] }, mark)
          break
        }

        default:
          break
      }
    }

    return { changedFromIndex: changedFrom }
  }

  private push(
    message: Pick<SessionMessage, 'role' | 'timestamp' | 'blocks'> & { model?: string | null },
    mark: (i: number) => void
  ): void {
    this.counter += 1
    this.buffer.push({
      id: `copilot_${this.counter}`,
      isSidechain: false,
      model: message.model ?? null,
      role: message.role,
      timestamp: message.timestamp,
      blocks: message.blocks
    })
    mark(this.buffer.length - 1)
  }
}

/**
 * The tool's result.
 *
 * `detailedContent` holds whole file reads and skill bodies — tens of KB per
 * item. In the conversation one wants the result of what was done, so take
 * the short side, falling back to the detail only when the short side is empty.
 */
function resultText(result: unknown): string {
  if (result === null || result === undefined) return ''
  if (typeof result === 'object') {
    const o = result as { content?: unknown; detailedContent?: unknown }
    const brief = collectText(o.content)
    if (brief.trim().length > 0) return brief
    return collectText(o.detailedContent)
  }
  return collectText(result)
}
