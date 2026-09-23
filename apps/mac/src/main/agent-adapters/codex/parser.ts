import { MemoryMessages, type MessageBuffer } from '../../session/messageBuffer.js'
import type { SessionBlock, SessionMessage, ToolCall } from '../../session/types.js'
import { isInjectedUserText } from '../injectedText.js'
import type { PushResult } from '../parserUtil.js'
import { collectText, firstLine } from '../parserUtil.js'
import { readCodexOutput, readCodexTool } from './tools.js'

/**
 * Converts a Codex rollout log (jsonl) into a message list for the UI.
 *
 * Lines handled:
 *   session_meta                          … session identity (not used for the title)
 *   response_item / message               … user / assistant utterances (developer is preamble, not shown)
 *   response_item / reasoning             … thinking
 *   response_item / custom_tool_call      … tool execution (current shape; name is always `exec`)
 *   response_item / function_call         … tool execution (old shape; `arguments` is a JSON string)
 *   response_item / *_call_output         … its result (joined by call_id)
 *   response_item / web_search_call       … search that runs server-side
 *
 * **Decoding the call payloads lives in `codexTools.ts`.** Codex writes tool
 * calls as JavaScript fragments, so without decoding them the screen shows
 * only the tool name.
 *
 * Aligned to the same incremental interface as the Claude parser, so the
 * follow mechanism (SessionWatcher) works unchanged.
 */

interface RawPayload {
  type?: string
  role?: string
  content?: unknown
  text?: string
  name?: string
  input?: unknown
  arguments?: unknown
  output?: unknown
  call_id?: string
  summary?: unknown
  action?: { query?: unknown; type?: string }
  query?: unknown
}

interface RawLine {
  type?: string
  timestamp?: string
  payload?: RawPayload
}

export type { PushResult }

export class CodexSessionParser {
  get messages(): SessionMessage[] { return this.buffer.all() }
  constructor(readonly buffer: MessageBuffer = new MemoryMessages()) { }
  title: string | null = null

  private toolIndex = new Map<string, { m: number; b: number }>()
  /**
   * Number of a launched job → target of the call that started it.
   *
   * Codex runs long jobs in the background and waits with `wait({cell_id})`.
   * The waiting side writes only the number, so without linking them
   * **thousands of wait-only rows pile up** (measured: 13% of everything).
   * The number is unreadable to a human, so replace it with the command that
   * started the job.
   */
  private cells = new Map<string, string>()
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
      if (entry.type !== 'response_item' || !entry.payload) continue

      const payload = entry.payload
      const ts = typeof entry.timestamp === 'string' ? entry.timestamp : null

      switch (payload.type) {
        case 'message': {
          if (payload.role !== 'user' && payload.role !== 'assistant') break
          const text = collectText(payload.content)
          if (text.trim().length === 0) break
          /*
           * Codex writes environment, skills, and AGENTS.md as user-role lines.
           * Shown as-is, things the human never said would appear as their
           * utterances, so drop them.
           */
          if (payload.role === 'user' && isInjectedUserText(text)) break
          if (payload.role === 'user' && !this.title) this.title = firstLine(text)
          this.push(
            {
              role: payload.role,
              timestamp: ts,
              blocks: [{ kind: 'text', text }]
            },
            mark
          )
          break
        }

        case 'reasoning': {
          /*
           * The summary can arrive as an empty array (current Codex encrypts
           * the body it sends). `??` can't catch that — `[]` is not nullish,
           * so the empty summary would win even when a body exists.
           * **Choose by whether content was actually extracted.**
           */
          const text = collectText(payload.summary) || collectText(payload.content)
          if (text.trim().length === 0) break
          this.push(
            { role: 'assistant', timestamp: ts, blocks: [{ kind: 'thinking', text }] },
            mark
          )
          break
        }

        case 'custom_tool_call':
        case 'function_call': {
          const id = payload.call_id ?? `tool_${this.counter++}`
          const read = readCodexTool(
            payload.name ?? 'tool',
            payload.arguments ?? payload.input ?? payload.content
          )
          // The waiting side writes only the number. Replace it with the starting command before placing
          const waiting = read.cellId ? this.cells.get(read.cellId) : null
          this.pushTool(
            {
              id,
              name: read.name,
              input: read.input,
              target: read.target ?? waiting ?? null,
              ...(read.plan ? { plan: read.plan } : {}),
              result: null,
              isError: false,
              images: []
            },
            ts,
            mark
          )
          break
        }

        /*
         * Search that runs server-side. Call and result share one line, so
         * place it as a finished item rather than awaiting a result (leaving
         * it waiting would look like it runs forever).
         */
        case 'web_search_call': {
          const query = collectText(payload.action?.query ?? payload.query)
          if (query.trim().length === 0) break
          this.pushTool(
            {
              id: payload.call_id ?? `search_${this.counter++}`,
              name: 'web_search',
              input: { query },
              target: query,
              result: '',
              isError: false,
              images: []
            },
            ts,
            mark
          )
          break
        }

        case 'custom_tool_call_output':
        case 'function_call_output': {
          const id = payload.call_id
          if (!id) break
          const loc = this.toolIndex.get(id)
          if (!loc) break
          const block = this.buffer.get(loc.m)?.blocks[loc.b]
          if (block && block.kind === 'tool') {
            // Strip the preamble (Script completed / Wall time / Output:). The failure marker exists only there too
            const output = readCodexOutput(collectText(payload.output ?? payload.content))
            block.tool.result = output.text
            block.tool.isError = output.isError
            // A job that started in the background. Lets a later wait be read as this call's target
            if (output.cellId && block.tool.target) {
              this.cells.set(output.cellId, block.tool.target)
            }
            mark(loc.m)
            this.toolIndex.delete(id)
          }
          break
        }

        default:
          break
      }
    }

    return { changedFromIndex: changedFrom }
  }

  private pushTool(tool: ToolCall, timestamp: string | null, mark: (i: number) => void): void {
    this.push({ role: 'assistant', timestamp, blocks: [{ kind: 'tool', tool }] }, mark)
    this.toolIndex.set(tool.id, { m: this.buffer.length - 1, b: 0 })
  }

  private push(
    message: Pick<SessionMessage, 'role' | 'timestamp' | 'blocks'>,
    mark: (i: number) => void
  ): void {
    this.counter += 1
    this.buffer.push({
      id: `codex_${this.counter}`,
      isSidechain: false,
      model: null,
      ...message
    })
    mark(this.buffer.length - 1)
  }
}

export type { SessionBlock }
