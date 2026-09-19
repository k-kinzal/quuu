/**
 * A fingerprint of the content. Used **to avoid rewriting what has not changed**.
 *
 * iCloud spends upstream bandwidth on everything written, and every write notifies the
 * devices. Rewrite identical content every 3 seconds and syncing runs all day over
 * nothing.
 *
 * No cryptographic strength is needed (these are our own files, and this is not for
 * detecting tampering), so FNV-1a is used and no dependency is added.
 */
export function contentHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  // 32 bits collides easily on long strings, so the length is mixed in and two words are used
  let g = 0x01000193
  for (let i = text.length - 1; i >= 0; i--) {
    g ^= text.charCodeAt(i)
    g = Math.imul(g, 0x811c9dc5) >>> 0
  }
  return `${h.toString(36)}${g.toString(36)}${text.length.toString(36)}`
}
