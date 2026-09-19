import { MemoryMessages, type MessageBuffer } from './messageBuffer.js'
import { t } from '../i18n/index.js'
import { SessionImageStore } from './imageStore.js'
import { isInjectedUserText } from './injectedText.js'
import { readPlanSteps } from './plan.js'
import type { SessionBlock, SessionImage, SessionMessage } from './types.js'

/**
 * Converts a Claude Code session jsonl into a message list for the UI.
 *
 * Supports incremental parsing: calling `pushLines` repeatedly appends while
 * keeping internal state. `tool_result` folds into the preceding `tool_use`,
 * which can rewrite an existing message; `changedFromIndex` then reports the
 * rewound position.
 */

interface RawImageSource {
  type?: string
  media_type?: string
  data?: string
}

interface RawContentBlock {
  type?: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
  source?: RawImageSource
}

interface RawEntry {
  type?: string
  uuid?: string
  timestamp?: string
  isSidechain?: boolean
  sessionId?: string
  aiTitle?: string
  /** A line the CLI injected on its own. Not something the human said. */
  isMeta?: boolean
  /** The recap the CLI writes for itself when it compacts a conversation that ran out of context. */
  isCompactSummary?: boolean
  /** A line the CLI keeps out of its own conversation view and shows only in the transcript. */
  isVisibleInTranscriptOnly?: boolean
  message?: {
    role?: string
    model?: string
    content?: string | RawContentBlock[]
  }
}

export interface PushResult {
  /** Index where appends or changes started. -1 when nothing changed. */
  changedFromIndex: number
}

export class ClaudeSessionParser {
  get messages(): SessionMessage[] { return this.buffer.all() }
  readonly images: SessionImageStore
  constructor(imageNamespace?: string, readonly buffer: MessageBuffer = new MemoryMessages()) { this.images = new SessionImageStore(imageNamespace) }
  title: string | null = null

  /** tool_use_id -> message index / block index */
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

      let entry: RawEntry
      try {
        entry = JSON.parse(trimmed) as RawEntry
      } catch {
        continue // ignore incomplete or corrupt lines
      }

      switch (entry.type) {
        case 'ai-title':
          if (typeof entry.aiTitle === 'string') this.title = entry.aiTitle
          break

        case 'assistant': {
          const msg = this.buildAssistantMessage(entry)
          if (msg) {
            this.registerTools(msg, this.buffer.length)
            this.buffer.push(msg)
            mark(this.buffer.length - 1)
          }
          break
        }

        case 'user': {
          const result = this.handleUserEntry(entry)
          if (result.appended) mark(this.buffer.length - 1)
          for (const i of result.patched) mark(i)
          break
        }

        default:
          // attachment / last-prompt / queue-operation / system etc. are not displayed
          break
      }
    }

    return { changedFromIndex: changedFrom }
  }

  private nextId(entry: RawEntry): string {
    if (typeof entry.uuid === 'string' && entry.uuid.length > 0) return entry.uuid
    this.counter += 1
    return `gen_${this.counter}`
  }

  private buildAssistantMessage(entry: RawEntry): SessionMessage | null {
    const content = entry.message?.content
    if (!Array.isArray(content)) return null

    const blocks: SessionBlock[] = []
    for (const raw of content) {
      if (raw.type === 'text' && typeof raw.text === 'string' && raw.text.trim().length > 0) {
        blocks.push({ kind: 'text', text: raw.text })
      } else if (
        raw.type === 'thinking' &&
        typeof raw.thinking === 'string' &&
        raw.thinking.trim().length > 0
      ) {
        // Empty thinking carries no information, so drop it (displaying it only eats space)
        blocks.push({ kind: 'thinking', text: raw.thinking })
      } else if (raw.type === 'tool_use') {
        blocks.push({
          kind: 'tool',
          tool: {
            id: typeof raw.id === 'string' ? raw.id : `tool_${this.counter++}`,
            name: typeof raw.name === 'string' ? raw.name : 'unknown',
            input: raw.input ?? {},
            ...(raw.name === 'TodoWrite' || raw.name === 'update_plan' ? { plan: readPlanSteps(raw.input) } : {}),
            // Values arrive named, so the display side can pick the target by key (see note in codexTools.ts)
            target: null,
            result: null,
            isError: false,
            images: []
          }
        })
      }
    }
    if (blocks.length === 0) return null

    return {
      id: this.nextId(entry),
      role: 'assistant',
      isSidechain: entry.isSidechain === true,
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : null,
      blocks,
      model: typeof entry.message?.model === 'string' ? entry.message.model : null
    }
  }

  private registerTools(msg: SessionMessage, messageIndex: number): void {
    msg.blocks.forEach((block, b) => {
      if (block.kind === 'tool') this.toolIndex.set(block.tool.id, { m: messageIndex, b })
    })
  }

  private handleUserEntry(entry: RawEntry): { appended: boolean; patched: number[] } {
    const content = entry.message?.content
    const patched: number[] = []
    /*
     * Lines injected by the CLI are not human utterances.
     * Stops things like "[Image: original 2940x1666, ...]" and "Continue from
     * where you left off." from showing up as user messages. Only tool_result
     * folding still passes through (lines of this shape don't carry
     * tool_result, but if one did, we must not drop the result).
     *
     * A compaction recap is the same kind of line, and the worst of them: when
     * context runs out the CLI summarises the conversation to itself under the
     * user role, so **thousands of words the human never wrote land in their
     * mouth** — including quotes of what they said, now wrapped in the agent's
     * reading of it. The CLI keeps it out of its own conversation view for that
     * reason, and the conversation it recaps is still on screen right above it,
     * so dropping it loses nothing.
     */
    const injected =
      entry.isMeta === true || entry.isCompactSummary === true || entry.isVisibleInTranscriptOnly === true

    if (typeof content === 'string') {
      const text = content.trim()
      if (text.length === 0) return { appended: false, patched }
      if (injected || isInjectedUserText(text)) return { appended: false, patched }
      this.buffer.push({
        id: this.nextId(entry),
        role: 'user',
        isSidechain: entry.isSidechain === true,
        timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : null,
        blocks: [{ kind: 'text', text }],
        model: null
      })
      return { appended: true, patched }
    }

    if (!Array.isArray(content)) return { appended: false, patched }

    const blocks: SessionBlock[] = []
    for (const raw of content) {
      if (raw.type === 'tool_result' && typeof raw.tool_use_id === 'string') {
        const loc = this.toolIndex.get(raw.tool_use_id)
        if (loc) {
          const block = this.buffer.get(loc.m)?.blocks[loc.b]
          if (block && block.kind === 'tool') {
            block.tool.result = stringifyToolResult(raw.content)
            // Tools that return images (screenshot reads etc.). Show them as images, not text
            block.tool.images = this.takeImages(raw.content)
            block.tool.isError = raw.is_error === true
            patched.push(loc.m)
            this.toolIndex.delete(raw.tool_use_id)
          }
        }
      } else if (injected) {
        continue
      } else if (raw.type === 'text' && typeof raw.text === 'string' && raw.text.trim().length > 0) {
        if (!isInjectedUserText(raw.text)) blocks.push({ kind: 'text', text: raw.text })
      } else if (raw.type === 'image') {
        const image = this.takeImage(raw)
        if (image) blocks.push({ kind: 'image', image })
      }
    }

    if (blocks.length > 0) {
      this.buffer.push({
        id: this.nextId(entry),
        role: 'user',
        isSidechain: entry.isSidechain === true,
        timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : null,
        blocks,
        model: null
      })
      return { appended: true, patched }
    }

    return { appended: false, patched }
  }

  /** Takes custody of one image block and turns it into a marker. Anything non-base64 can't be displayed, so drop it. */
  private takeImage(raw: RawContentBlock): SessionImage | null {
    const source = raw.source
    if (!source || typeof source.data !== 'string' || source.data.length === 0) return null
    const mediaType =
      typeof source.media_type === 'string' && source.media_type.startsWith('image/')
        ? source.media_type
        : 'image/png'
    return this.images.add(mediaType, source.data)
  }

  /** Extracts only the images out of a tool_result's content. */
  private takeImages(content: unknown): SessionImage[] {
    if (!Array.isArray(content)) return []
    const found: SessionImage[] = []
    for (const item of content) {
      if (!item || typeof item !== 'object') continue
      const block = item as RawContentBlock
      if (block.type !== 'image') continue
      const image = this.takeImage(block)
      if (image) found.push(image)
    }
    return found
  }
}

export function stringifyToolResult(content: unknown): string {
  if (content === null || content === undefined) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c
        if (c && typeof c === 'object') {
          const o = c as RawContentBlock
          if (typeof o.text === 'string') return o.text
          // Images don't become text; they are displayed separately as the tool's result
          if (o.type === 'image') return ''
        }
        return ''
      })
      .filter((x) => x.length > 0)
      .join('\n')
  }
  try {
    return JSON.stringify(content, null, 2)
  } catch {
    // Cannot become JSON (circular references etc.). `[object Object]` is unreadable anyway, so drop it.
    return t('conversation.undisplayable')
  }
}
