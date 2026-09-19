/**
 * A fingerprint of the content. Used **so unchanged things are not rewritten**.
 *
 * iCloud spends upload bandwidth on everything written and notifies the device. Rewriting the same
 * content every 3 seconds keeps sync running all day with nothing changed.
 *
 * Cryptographic strength is not needed (these are our own files and this is not about detecting
 * tampering), so FNV-1a is used and no dependency is added.
 */
export function contentHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  // 32 bits collides easily on a long string, so the length is mixed in to make two words
  let g = 0x01000193
  for (let i = text.length - 1; i >= 0; i--) {
    g ^= text.charCodeAt(i)
    g = Math.imul(g, 0x811c9dc5) >>> 0
  }
  return `${h.toString(36)}${g.toString(36)}${text.length.toString(36)}`
}
