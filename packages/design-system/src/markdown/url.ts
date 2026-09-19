/**
 * Is this a destination we may open?
 *
 * Strings arriving in a conversation are treated as **written by someone else**.
 * Render `javascript:` or `data:` as something pressable and we no longer decide what
 * happens on the other side of the press. Only what is known to be safe to open becomes
 * a link.
 */
const OPENABLE = /^(?:https?|mailto|file):/i

export function safeUrl(url: string): string | null {
  const value = url.trim()
  if (value === '') return null
  // A relative destination (`./doc.md`, `#section`) is not somewhere we can open, so it stays as text
  return OPENABLE.test(value) ? value : null
}
