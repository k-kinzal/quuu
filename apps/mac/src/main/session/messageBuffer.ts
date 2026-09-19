import type { SessionMessage } from './types.js'

export interface MessageBuffer {
  readonly length: number
  push(message: SessionMessage): void
  get(index: number): SessionMessage | undefined
  all(): SessionMessage[]
}

/** Standalone parsers and bounded tail previews keep their small result directly. */
export class MemoryMessages implements MessageBuffer {
  private values: SessionMessage[] = []
  get length(): number { return this.values.length }
  push(message: SessionMessage): void { this.values.push(message) }
  get(index: number): SessionMessage | undefined { return this.values[index] }
  all(): SessionMessage[] { return this.values }
}

/** Only this read batch lives in memory. A late tool result retrieves its original call from storage. */
export class IndexedMessages implements MessageBuffer {
  private count = 0
  private dirty = new Map<number, SessionMessage>()
  constructor(private read: (index: number) => SessionMessage | undefined) {}
  get length(): number { return this.count }
  push(message: SessionMessage): void { this.dirty.set(this.count++, message) }
  get(index: number): SessionMessage | undefined {
    const message = this.dirty.get(index) ?? this.read(index)
    // Parsers retrieve existing rows only when a result will modify them.
    if (message) this.dirty.set(index, message)
    return message
  }
  takeChanges(): Array<{ index: number; message: SessionMessage }> {
    const changes = [...this.dirty].map(([index, message]) => ({ index, message }))
    this.dirty.clear()
    return changes
  }
  all(): SessionMessage[] { throw new Error('Indexed sessions must be read through bounded pages') }
}
