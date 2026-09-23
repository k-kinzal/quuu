import { MemoryMessages, type MessageBuffer } from '../../session/messageBuffer.js'
import type { SessionMessage } from '../../session/types.js'
import { isInjectedUserText } from '../injectedText.js'
import type { PushResult } from '../parserUtil.js'
import { collectText, firstLine } from '../parserUtil.js'

/**
 * Converts the Grok CLI's `chat_history.jsonl` into a message list for the UI.
 *
 * Lines handled (observed; `~/.grok/sessions/<cwd>/<sessionId>/chat_history.jsonl`):
 *   system            … system prompt (not shown)
 *   user              … utterance. content is [{type:'text', text}]
 *   reasoning         … thinking. summary is [{type:'summary_text', text}]
 *   assistant         … response (content is a string) and tool_calls
 *   tool_result       … tool result (joined by tool_call_id)
 *   backend_tool_call … tool that runs server-side (web_search etc.). Results mix into the body
 *
 * Aligned to the same incremental interface as the Claude / Codex parsers,
 * so the follow mechanism (SessionWatcher) works unchanged.
 */

interface RawToolCall {
  id?: string
  name?: string
  /** Arrives as a JSON string (sometimes an object). */
  arguments?: unknown
}

interface RawLine {
  type?: string
  content?: unknown
  summary?: unknown
  tool_calls?: RawToolCall[]
  tool_call_id?: string
  model_id?: string
  /**
   * Sequence number carried only by prompts the human typed.
   *
   * Grok also writes environment info, AGENTS.md, and the skill list as
   * user-role lines, so "human utterance" can't be told by shape alone.
   * Lines with this marker are treated as human utterances.
   */
  prompt_index?: number
  kind?: { tool_type?: string; action?: unknown; id?: string; status?: string }
}

/** What the human typed is recorded wrapped in `<user_query>`. */
const USER_QUERY = /^<user_query>\n?([\s\S]*?)\n?<\/user_query>$/

export class GrokSessionParser {
  get messages(): SessionMessage[] { return this.buffer.all() }
  constructor(readonly buffer: MessageBuffer = new MemoryMessages()) { }
  title: string | null = null

  private toolIndex = new Map<string, { m: number; b: number }>()
  private counter = 0

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

      switch (entry.type) {
        case 'user': {
          const raw = collectText(entry.content)
          const text = unwrapQuery(raw)
          if (text.length === 0) break
          /*
           * Don't list preamble (environment, skills, AGENTS.md) as human
           * utterances. Lines with prompt_index are known to be human-typed,
           * so those are shown regardless of the content's shape.
           */
          const fromHuman = typeof entry.prompt_index === 'number'
          if (!fromHuman && isInjectedUserText(raw)) break
          if (!this.title) this.title = firstLine(text)
          this.push({ role: 'user', timestamp: null, blocks: [{ kind: 'text', text }] }, mark)
          break
        }

        case 'reasoning': {
          const text = collectText(entry.summary ?? entry.content)
          if (text.trim().length === 0) break
          this.push(
            { role: 'assistant', timestamp: null, blocks: [{ kind: 'thinking', text }] },
            mark
          )
          break
        }

        case 'assistant': {
          const text = collectText(entry.content)
          const calls = entry.tool_calls ?? []
          if (text.trim().length === 0 && calls.length === 0) break

          const blocks: SessionMessage['blocks'] = []
          if (text.trim().length > 0) blocks.push({ kind: 'text', text })
          for (const call of calls) {
            const id = call.id ?? `tool_${this.counter}_${blocks.length}`
            blocks.push({
              kind: 'tool',
              tool: {
                id,
                name: call.name ?? 'tool',
                input: parseArguments(call.arguments),
                target: null,
                result: null,
                isError: false,
                images: []
              }
            })
          }

          this.push(
            {
              role: 'assistant',
              timestamp: null,
              blocks,
              model: entry.model_id ?? null
            },
            mark
          )
          // Remember where the tool rows are so results can be filled in later
          const m = this.buffer.length - 1
          blocks.forEach((b, i) => {
            if (b.kind === 'tool') this.toolIndex.set(b.tool.id, { m, b: i })
          })
          break
        }

        case 'tool_result': {
          const id = entry.tool_call_id
          if (!id) break
          const loc = this.toolIndex.get(id)
          if (!loc) break
          const block = this.buffer.get(loc.m)?.blocks[loc.b]
          if (block?.kind === 'tool') {
            block.tool.result = collectText(entry.content)
            mark(loc.m)
            this.toolIndex.delete(id)
          }
          break
        }

        case 'backend_tool_call': {
          // Server-side tool (web_search etc.). Show only the fact of the call.
          const kind = entry.kind
          if (!kind) break
          this.push(
            {
              role: 'assistant',
              timestamp: null,
              blocks: [
                {
                  kind: 'tool',
                  tool: {
                    id: kind.id ?? `backend_${this.counter}`,
                    name: kind.tool_type ?? 'backend_tool',
                    input: kind.action ?? {},
                    target: null,
                    result: kind.status ?? null,
                    isError: false,
                    images: []
                  }
                }
              ]
            },
            mark
          )
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
      id: `grok_${this.counter}`,
      isSidechain: false,
      model: message.model ?? null,
      role: message.role,
      timestamp: message.timestamp,
      blocks: message.blocks
    })
    mark(this.buffer.length - 1)
  }
}

/** Removes the `<user_query>…</user_query>` wrapper. Unwrapped text passes through. */
export function unwrapQuery(text: string): string {
  const trimmed = text.trim()
  const hit = USER_QUERY.exec(trimmed)
  return (hit ? hit[1] : trimmed).trim()
}

/** tool_calls.arguments arrives as a JSON string. If unreadable, pass the string through. */
function parseArguments(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? {}
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
