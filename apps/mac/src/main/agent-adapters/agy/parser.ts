import { MemoryMessages, type MessageBuffer } from '../../session/messageBuffer.js'
import type { SessionBlock, SessionMessage } from '../../session/types.js'
import type { PushResult } from '../parserUtil.js'
import { collectText, firstLine } from '../parserUtil.js'

/**
 * Converts the Antigravity CLI's (`agy`) transcript into a message list for the UI.
 *
 * Lines handled (observed;
 * `~/.gemini/antigravity-cli/brain/<conversationId>/.system_generated/logs/transcript.jsonl`):
 *
 *   {step_index, source, type, status, created_at, content?, thinking?, tool_calls?}
 *
 *   source USER_EXPLICIT … what the human typed, wrapped in `<USER_REQUEST>`
 *   source MODEL         … PLANNER_RESPONSE carries the reply (`content`), the thinking
 *                          (`thinking`) and the calls (`tool_calls`). **Every other MODEL step is
 *                          the result of the call before it** — the type is named after the tool
 *                          (`VIEW_FILE`) or simply `GENERIC`, and there is no id to join on
 *   source SYSTEM        … context the CLI injects (conversation history, reminders, checkpoint
 *                          summaries). Never shown: the human did not say it
 *
 * Steps are appended as they finish, so **the same step can be written more than once** (once
 * while it is running, again when it is done) and the indices are not always in order. Rows are
 * therefore kept by `step_index` and rewritten in place, rather than appended blindly — otherwise
 * one answer appears twice on screen.
 */

interface RawToolCall {
  name?: string
  /** Each value arrives as a JSON-encoded string (`"\"ls -la\""`). */
  args?: Record<string, unknown>
}

interface RawStep {
  step_index?: number
  source?: string
  type?: string
  status?: string
  created_at?: string
  content?: unknown
  thinking?: unknown
  tool_calls?: RawToolCall[]
}

/** What the human typed is recorded wrapped in this tag; the rest is metadata the CLI added. */
const USER_REQUEST = /<USER_REQUEST>\n?([\s\S]*?)\n?<\/USER_REQUEST>/

/**
 * Keys that name what a call acts on, in the order they are preferred.
 * Measured on run_command / write_to_file / view_file; unknown tools fall through to null.
 */
const TARGET_KEYS = ['CommandLine', 'TargetFile', 'AbsolutePath', 'FilePath', 'Path', 'Query']

export class AgySessionParser {
  get messages(): SessionMessage[] { return this.buffer.all() }
  constructor(readonly buffer: MessageBuffer = new MemoryMessages()) { }
  title: string | null = null

  /** step_index -> where that step's message sits, so a rewritten step replaces its own row. */
  private rows = new Map<number, number>()
  /** Tool rows still waiting for their result, oldest first (calls carry no id). */
  private pending: Array<{ m: number; b: number }> = []
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

      let step: RawStep
      try {
        step = JSON.parse(trimmed) as RawStep
      } catch {
        continue
      }

      // Injected context is not part of the conversation
      if (step.source === 'SYSTEM') continue

      if (step.source === 'USER_EXPLICIT') {
        const text = userText(collectText(step.content))
        if (text.length === 0) continue
        if (!this.title) this.title = firstLine(text)
        this.write(step, { role: 'user', blocks: [{ kind: 'text', text }] }, mark)
        continue
      }

      if (step.source !== 'MODEL') continue

      if (step.type === 'PLANNER_RESPONSE') {
        const blocks: SessionBlock[] = []
        const thinking = collectText(step.thinking)
        if (thinking.trim().length > 0) blocks.push({ kind: 'thinking', text: thinking })
        const text = collectText(step.content)
        if (text.trim().length > 0) blocks.push({ kind: 'text', text })
        for (const call of step.tool_calls ?? []) {
          const input = decodeArgs(call.args)
          blocks.push({
            kind: 'tool',
            tool: {
              id: `agy_tool_${step.step_index ?? this.counter}_${blocks.length}`,
              name: call.name ?? 'tool',
              input,
              target: targetOf(input),
              result: null,
              isError: false,
              images: []
            }
          })
        }
        if (blocks.length === 0) continue
        const index = this.write(step, { role: 'assistant', blocks }, mark)
        blocks.forEach((block, b) => {
          if (block.kind === 'tool') this.pending.push({ m: index, b })
        })
        continue
      }

      /*
       * Any other MODEL step is the result of the call that came before it. It is folded into that
       * call's row instead of becoming a row of its own, so the conversation reads as
       * "called it, and this came back".
       */
      const result = collectText(step.content)
      if (result.length === 0) continue
      const slot = this.pending.shift()
      if (!slot) continue
      const block = this.buffer.get(slot.m)?.blocks[slot.b]
      if (block?.kind === 'tool') {
        block.tool.result = result
        block.tool.isError = step.status === 'ERROR'
        mark(slot.m)
      }
    }

    return { changedFromIndex: changedFrom }
  }

  /**
   * Put a step's message in place. Returns where it sits.
   * A step already written is replaced, so a step the CLI wrote twice shows once.
   */
  private write(
    step: RawStep,
    message: Pick<SessionMessage, 'role' | 'blocks'>,
    mark: (i: number) => void
  ): number {
    const stepIndex = step.step_index
    const built: SessionMessage = {
      id: `agy_${stepIndex ?? this.counter}`,
      isSidechain: false,
      model: null,
      role: message.role,
      timestamp: typeof step.created_at === 'string' ? step.created_at : null,
      blocks: message.blocks
    }
    this.counter += 1

    const at = typeof stepIndex === 'number' ? this.rows.get(stepIndex) : undefined
    const existing = at === undefined ? undefined : this.buffer.get(at)
    if (at !== undefined && existing) {
      // Rewrite in place. Fetching it through the buffer is what marks the row as changed
      existing.role = built.role
      existing.timestamp = built.timestamp
      existing.blocks = built.blocks
      mark(at)
      return at
    }

    this.buffer.push(built)
    const index = this.buffer.length - 1
    if (typeof stepIndex === 'number') this.rows.set(stepIndex, index)
    mark(index)
    return index
  }
}

/** Drop the metadata the CLI appends and keep what the human wrote. */
export function userText(content: string): string {
  const hit = USER_REQUEST.exec(content)
  return (hit ? hit[1] : content).trim()
}

/** Each argument value is a JSON-encoded string. Anything unreadable is passed through as-is. */
function decodeArgs(args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== 'string') {
      out[key] = value
      continue
    }
    try {
      out[key] = JSON.parse(value)
    } catch {
      out[key] = value
    }
  }
  return out
}

/** "What it acts on", as one value. null when the tool names nothing recognizable. */
function targetOf(input: Record<string, unknown>): string | null {
  for (const key of TARGET_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}
