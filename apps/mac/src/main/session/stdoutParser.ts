import { MemoryMessages, type MessageBuffer } from './messageBuffer.js'
import type { PushResult } from '../agent-adapters/parserUtil.js'
import type { SessionMessage } from './types.js'

/** Raw logs also have no length limit. Keep just the unfinished 200-line message between reads. */
export class StdoutSessionParser {
  title: string | null = null
  private partial = ''
  private lines: string[] = []
  private startLine = 0
  private currentIndex: number | null = null
  private header: string[] | null = []
  constructor(readonly buffer: MessageBuffer = new MemoryMessages()) {}
  get messages(): SessionMessage[] { return this.buffer.all() }

  pushLines(lines: string[]): PushResult {
    const before = this.buffer.length
    this.pushChunk(lines.join('\n') + '\n')
    return { changedFromIndex: Math.max(0, before - 1) }
  }

  pushChunk(chunk: string): void {
    const parts = chunk.split('\n')
    parts[0] = this.partial + parts[0]
    this.partial = parts.pop() ?? ''
    for (const line of parts) {
      if (this.header) {
        this.header.push(line)
        if (this.header.length === 1 && !line.startsWith('# Quuu run ')) {
          this.header = null
        } else if (this.header.length === 5) {
          const header = this.header
          this.header = null
          if (header[1].startsWith('# ') && header[2].startsWith('# cwd: ') && header[3].startsWith('# cmd: ') && header[4] === '') continue
          for (const value of header) this.addLine(value)
          continue
        } else continue
      }
      this.addLine(line)
    }
    if (this.header?.length === 0 && this.partial && !'# Quuu run '.startsWith(this.partial) && !this.partial.startsWith('# Quuu run ')) this.header = null
    if (!this.header) this.save(this.lines.concat(this.partial).join('\n'))
  }

  private addLine(line: string): void {
    this.lines.push(line)
    if (this.lines.length === 200) {
      this.save(this.lines.join('\n'))
      this.startLine += 200
      this.lines = []
      this.currentIndex = null
    }
  }

  private save(text: string): void {
    if (!text.trim()) return
    const blocks: SessionMessage['blocks'] = [{ kind: 'text', text }]
    if (this.currentIndex !== null) {
      const current = this.buffer.get(this.currentIndex)
      if (current) current.blocks = blocks
    } else {
      this.currentIndex = this.buffer.length
      this.buffer.push({ id: `stdout_${this.startLine}`, role: 'system', isSidechain: false, timestamp: null, blocks, model: null })
    }
  }
}
