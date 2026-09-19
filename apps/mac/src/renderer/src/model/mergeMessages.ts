import type { SessionAppendedPayload } from '../../../preload/api/desktop.js'
import type { SessionMessage } from '../../../preload/api/session.js'

/**
 * Merge appended messages into the existing list.
 *
 * An append event carries not only "what is newly added" but also "what was rewritten"
 * (a tool_result arrives later and folds into the tool_use before it).
 * So match on id: replace ids already present, and append only the ones that aren't.
 *
 * Naive concatenation lists the same content twice whenever a message older than the
 * display window (the last N) is rewritten. That bug actually showed up with a live
 * session open.
 */
export function mergeMessages(
  current: SessionMessage[],
  payload: SessionAppendedPayload
): SessionMessage[] {
  if (payload.replacement) return payload.messages
  if (payload.messages.length === 0) return current

  const indexById = new Map<string, number>()
  current.forEach((message, index) => indexById.set(message.id, index))

  const next = current.slice()
  const appended: SessionMessage[] = []

  for (const message of payload.messages) {
    const index = indexById.get(message.id)
    if (index === undefined) {
      appended.push(message)
      // The same id arriving twice within one event must not add a second entry
      indexById.set(message.id, next.length + appended.length - 1)
    } else {
      next[index] = message
    }
  }

  return appended.length > 0 ? next.concat(appended) : next
}
