/**
 * The container that keeps half-written text from being lost. **The same promise as
 * the Mac.**
 *
 * A half-written instruction is the thing its author least wants to lose. Yet on a
 * phone screens vanish readily - moving between tabs, following a notification into
 * another app, the OS reclaiming memory. **Looking elsewhere mid-input is ordinary**,
 * so "it disappears when you move" is fixed as a defect of construction, not as a
 * usage mistake.
 *
 * Rather than living inside a screen, it lives in one keyed container mirrored into
 * `localStorage`. (Under `file://` there is no `localStorage` - one of the reasons the
 * app is served over a custom scheme.)
 */

export type Drafts = Record<string, string>

/** The version is in the name. Change the shape and change the name with it, so nothing old is read */
const KEY = 'quuu.mobile.drafts.v1'

/** The draft for a new task. Only one can be written, so the key is fixed */
export const NEW_TITLE = 'new.title'
export const NEW_BODY = 'new.body'
export const NEW_PROJECT = 'new.project'
export const NEW_PRIORITY = 'new.priority'

/** A follow-up to a conversation. **Each task keeps its own draft** */
export function replyKey(taskId: string): string {
  return `task:${taskId}`
}

/**
 * Replaces an entry. **Nothing empty is kept.**
 * Keep drafts that were emptied on send and keys you meant to delete pile up without
 * limit.
 */
export function setDraftIn(drafts: Drafts, key: string, text: string): Drafts {
  if (text.length === 0) {
    if (!(key in drafts)) return drafts
    const next = { ...drafts }
    delete next[key]
    return next
  }
  if (drafts[key] === text) return drafts
  return { ...drafts, [key]: text }
}

/**
 * Drops drafts whose target is gone.
 * Holding what will never appear on a screen again only grows.
 */
export function pruneDrafts(
  drafts: Drafts,
  live: { taskIds: Iterable<string>; projectIds: Iterable<string> }
): Drafts {
  const tasks = new Set(live.taskIds)
  const projects = new Set(live.projectIds)
  const next: Drafts = {}
  for (const [key, text] of Object.entries(drafts)) {
    if (key.startsWith('task:')) {
      if (tasks.has(key.slice('task:'.length))) next[key] = text
      continue
    }
    if (key === NEW_PROJECT) {
      if (projects.has(text)) next[key] = text
      continue
    }
    next[key] = text
  }
  return next
}

/** When corrupt, lose only the half-written text and still let the screen start. */
export function loadDrafts(): Drafts {
  try {
    const raw = storage()?.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const drafts: Drafts = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.length > 0) drafts[key] = value
    }
    return drafts
  } catch {
    return {}
  }
}

export function saveDrafts(drafts: Drafts): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(drafts))
  } catch {
    // Even when saving fails, that session's input stays on screen
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
