/**
 * Composer drafts (rule D-②).
 *
 * A half-written instruction is the one thing its author least wants to lose.
 * Yet the composer, being part of the screen, gets unmounted like anything else
 * (opening project settings, switching sections, closing the detail…).
 * Going to look at the configuration mid-typing is a normal move, so
 * "it vanished when I navigated" is a defect of the build, not user error.
 *
 * So drafts do not live inside the composer. They live in one container keyed
 * for lookup, mirrored to localStorage so they survive the window being rebuilt.
 */

/** The draft container. Keys are built by `taskDraftKey` / `newTaskDraftKey`. */
export type Drafts = Record<string, string>

/** Minimal seam so we don't depend on localStorage alone. Tests swap it out. */
export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Kept under the old name. Changing it makes saved drafts unreadable (same reason as `store.ts`). */
export const DRAFTS_KEY = 'taskd.drafts.v1'

/** The conversation composer. Each task holds its own draft. */
export function taskDraftKey(taskId: string): string {
  return `task:${taskId}`
}

/**
 * The list composer. On a project's screen the queue target is fixed, so its
 * draft is kept separate from what was written in the overall list.
 */
export function newTaskDraftKey(projectId?: string): string {
  return `new:${projectId ?? 'all'}`
}

/**
 * Replace a draft. Emptied ones are not kept.
 *
 * Keeping a draft emptied by sending would pile up keys that were supposedly
 * deleted, without bound. Aligning on "empty = no draft" lets deletion take
 * the same path.
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
 * Drop drafts for vanished tasks and projects.
 * A draft whose destination is gone never appears on screen again; holding it only accumulates.
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
    if (key.startsWith('new:')) {
      const scope = key.slice('new:'.length)
      if (scope === 'all' || projects.has(scope)) next[key] = text
      continue
    }
    // Keys of an unknown shape are assumed written by an older version and dropped
  }
  return next
}

/**
 * Read what is saved.
 * Corruption costs at most the work in progress; the screen still starts.
 */
export function loadDrafts(storage: DraftStorage): Drafts {
  try {
    const raw = storage.getItem(DRAFTS_KEY)
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

export function saveDrafts(storage: DraftStorage, drafts: Drafts): void {
  try {
    storage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
  } catch {
    // Even if saving fails, that round of input stays on screen
  }
}
