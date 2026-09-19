import { createHash, randomUUID } from 'node:crypto'
import { imageSize } from './imageMeta.js'
import type { SessionImage } from './types.js'

/**
 * A box on the main-process side holding the actual images that appeared in
 * the conversation.
 *
 * base64 isn't mixed into messages because one session reaches tens of MB.
 * Shipping everything to the renderer the moment a conversation opens stalls
 * the screen for images nobody looks at. Keep them here and hand over only
 * what gets displayed, later, via `get`.
 */

/** Length of the head decoded from base64 to read dimensions. Reaches the JPEG SOF. */
const HEAD_CHARS = 8192

/**
 * Cap per session.
 *
 * Measured, even a conversation that kept taking screenshots stayed around
 * 15MB, but log size has no upper bound. Anything beyond the cap isn't kept
 * (the marker remains; display is given up). A readable conversation beats
 * every image appearing.
 */
const BUDGET_BYTES = 64 * 1024 * 1024

interface Stored {
  mediaType: string
  base64: string
}

export class SessionImageStore {
  private stored = new Map<string, Stored>()
  private held = 0
  constructor(private namespace: string = randomUUID()) {}

  /** Takes custody of an image and returns the marker to place in the conversation. */
  add(mediaType: string, base64: string): SessionImage {
    const id = `img_${createHash('sha256').update(this.namespace).update(mediaType).update(base64).digest('hex')}`
    const byteSize = decodedSize(base64)
    const size = imageSize(Buffer.from(base64.slice(0, HEAD_CHARS), 'base64'))

    if (!this.stored.has(id) && this.held + byteSize <= BUDGET_BYTES) {
      this.stored.set(id, { mediaType, base64 })
      this.held += byteSize
    }

    return {
      id,
      mediaType,
      byteSize,
      width: size?.width ?? null,
      height: size?.height ?? null
    }
  }

  /** data URL usable for display. null when not held (renderer shows a missing marker). */
  get(id: string): string | null {
    const hit = this.stored.get(id)
    if (!hit) return null
    return `data:${hit.mediaType};base64,${hit.base64}`
  }

  /** Once the session index owns the bytes, parser memory no longer needs a second copy. */
  release(id: string): void {
    const hit = this.stored.get(id)
    if (!hit) return
    this.held -= decodedSize(hit.base64)
    this.stored.delete(id)
  }
}

/** Derives the original byte count from base64. */
function decodedSize(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor(base64.length / 4) * 3 - padding)
}
