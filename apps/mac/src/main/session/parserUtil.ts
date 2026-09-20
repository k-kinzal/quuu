import { t } from '../i18n/index.js'

/**
 * The pieces every session-log parser shares.
 *
 * Every CLI writes its body as a mix of string / array / {text} / {content}.
 * Writing that folding per parser leaves four subtly different collectText functions side by side
 * as CLIs are added. Only the parsers should multiply, so it is collected here.
 */

export interface PushResult {
  /** Index of the message where the change starts. -1 for no change. */
  changedFromIndex: number
}

/** A failed store read must be retried even if its file stamp stays unchanged. */
export interface StoreReloadResult extends PushResult {
  readSucceeded: boolean
}

/** Fold a nested body into a single text. */
export function collectText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const o = item as { text?: unknown; content?: unknown }
          if (typeof o.text === 'string') return o.text
          if (o.content !== undefined) return collectText(o.content)
        }
        return ''
      })
      .filter((x) => x.length > 0)
      .join('\n')
  }
  if (typeof value === 'object') {
    const o = value as { text?: unknown; content?: unknown; output?: unknown }
    if (typeof o.text === 'string') return o.text
    if (o.content !== undefined) return collectText(o.content)
    if (o.output !== undefined) return collectText(o.output)
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      // A cycle or the like makes it un-JSONable. `[object Object]` is unreadable, so it is dropped.
      return t('conversation.undisplayable')
    }
  }
  // What reaches here is a number, a boolean and the like. No other type appears in a JSON log.
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  return ''
}

/**
 * Extracting the body a human typed.
 *
 * Cursor and Grok wrap a human's utterance in `<user_query>` and prepend a timestamp and so on.
 * Without unwrapping it, the tags themselves line the conversation surface.
 * When it is not wrapped, only the surrounding whitespace is trimmed.
 */
const USER_QUERY = /<user_query>\n?([\s\S]*?)\n?<\/user_query>/

export function extractUserQuery(text: string): string {
  const hit = USER_QUERY.exec(text)
  return (hit ? hit[1] : text).trim()
}

/** One line for the title. Anything too long is elided. */
export function firstLine(text: string): string {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!line) return ''
  return line.length > 120 ? `${line.slice(0, 119)}…` : line
}
