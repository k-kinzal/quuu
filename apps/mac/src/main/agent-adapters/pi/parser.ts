import { SessionImageStore } from '../../session/imageStore.js'
import { MemoryMessages, type MessageBuffer } from '../../session/messageBuffer.js'
import type { SessionBlock, SessionMessage } from '../../session/types.js'
import { collectText, firstLine, type PushResult } from '../parserUtil.js'
import { object, record, timestamp } from './records.js'

/** Reads persisted Pi v3 entries; stream lifecycle events are not conversation messages. */
export class PiSessionParser {
  get messages(): SessionMessage[] { return this.buffer.all() }
  readonly images: SessionImageStore
  title: string | null = null
  private cwd: string | undefined
  private counter = 0
  private tools = new Map<string, { message: number; block: number }>()

  constructor(namespace?: string, readonly buffer: MessageBuffer = new MemoryMessages()) {
    this.images = new SessionImageStore(namespace)
  }

  pushLines(lines: string[]): PushResult {
    let changedFromIndex = -1
    const mark = (index: number): void => { changedFromIndex = changedFromIndex < 0 ? index : Math.min(changedFromIndex, index) }
    for (const line of lines) {
      const entry = record(line)
      if (entry.type === 'session') {
        if (typeof entry.cwd === 'string') this.cwd = entry.cwd
        continue
      }
      if (entry.type === 'session_info' && typeof entry.name === 'string') {
        this.title = entry.name || this.title
        continue
      }
      const message = object(entry.message)
      if (entry.type === 'message' && message.role === 'toolResult') {
        const loc = typeof message.toolCallId === 'string' ? this.tools.get(message.toolCallId) : undefined
        if (!loc) continue
        const block = this.buffer.get(loc.message)?.blocks[loc.block]
        if (block?.kind === 'tool') {
          block.tool.result = collectText(message.content)
          block.tool.isError = message.isError === true
          block.tool.images = this.content(message.content).flatMap(b => b.kind === 'image' ? [b.image] : [])
          mark(loc.message)
        }
        this.tools.delete(message.toolCallId as string)
        continue
      }
      let role: SessionMessage['role']
      let blocks: SessionBlock[]
      if (entry.type === 'message' && (message.role === 'user' || message.role === 'assistant')) {
        role = message.role
        blocks = this.content(message.content)
        if (role === 'assistant' && typeof message.errorMessage === 'string' && message.errorMessage) {
          blocks.push({ kind: 'text', text: message.errorMessage })
        }
        if (role === 'user' && !this.title) this.title = firstLine(collectText(message.content)) || null
      } else if ((entry.type === 'compaction' || entry.type === 'branch_summary') && typeof entry.summary === 'string') {
        role = 'system'
        blocks = [{ kind: 'text', text: entry.summary }]
      } else if (entry.type === 'custom_message' && entry.display === true) {
        role = 'system'
        blocks = this.content(entry.content)
      } else {
        continue
      }
      if (!blocks.length) continue
      const index = this.buffer.length
      this.buffer.push({
        id: typeof entry.id === 'string' ? `pi_${entry.id}` : `pi_generated_${++this.counter}`,
        role, blocks, isSidechain: false,
        timestamp: timestamp(entry.timestamp) ?? timestamp(message.timestamp),
        model: typeof message.model === 'string' ? message.model : null,
        ...(this.cwd ? { cwd: this.cwd } : {})
      })
      blocks.forEach((block, i) => {
        if (block.kind === 'tool') this.tools.set(block.tool.id, { message: index, block: i })
      })
      mark(index)
    }
    return { changedFromIndex }
  }

  private content(value: unknown): SessionBlock[] {
    if (typeof value === 'string') return value ? [{ kind: 'text', text: value }] : []
    if (!Array.isArray(value)) return []
    const blocks: SessionBlock[] = []
    for (const raw of value) {
      const part = object(raw)
      if (part.type === 'text' && typeof part.text === 'string') blocks.push({ kind: 'text', text: part.text })
      if (part.type === 'thinking' && typeof part.thinking === 'string' && part.thinking) blocks.push({ kind: 'thinking', text: part.thinking })
      if (part.type === 'image' && typeof part.data === 'string' && typeof part.mimeType === 'string') {
        blocks.push({ kind: 'image', image: this.images.add(part.mimeType, part.data) })
      }
      if (part.type === 'toolCall' && typeof part.id === 'string' && typeof part.name === 'string') {
        const input = object(part.arguments)
        const target = [input.command, input.path, input.query, input.pattern].find(v => typeof v === 'string')
        blocks.push({ kind: 'tool', tool: {
          id: part.id, name: part.name, input: part.arguments ?? {},
          target: typeof target === 'string' ? target : null, result: null, isError: false, images: []
        } })
      }
    }
    return blocks
  }
}
