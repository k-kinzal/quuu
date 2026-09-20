import type { Task } from '../../../preload/api/tasks.js'
import { useStore } from '../state/store.js'
import { focusAny, focusPane } from './focus.js'

/** Rows jumped by ⇞ ⇟. Not tied to window height (the same key moves the same amount in every pane). */
const PAGE = 10

/**
 * The row's DOM id.
 * Needed for the pane (`role="listbox"`) to point at a row via
 * `aria-activedescendant`. The ⌘⌥⏎ context menu also follows this id to
 * decide "which row is this about".
 */
export function taskRowId(taskId: string): string {
  return `task-row-${taskId}`
}

interface KeyLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  preventDefault(): void
}

/**
 * List key handling.
 *
 * All three — the full-width table, the side-by-side list, and no-focus
 * (body) — **must come through here**. Scattered, the meaning of ↑↓ varies by
 * pane, giving "the same key sometimes moves and sometimes doesn't" (that
 * actually happened).
 *
 * Movement order must match `useTaskView().ordered` (= the order on screen).
 * The caller passes that.
 *
 * @returns whether the key was handled. Handled keys must not be processed
 * again by the caller
 */
export function runTaskListKey(event: KeyLike, ordered: Task[]): boolean {
  /*
   * Modified keys belong to the native menu (defined in one place).
   * ⌃ is not exempted here because ⌃↵ remains the composer's submit key
   */
  if (event.metaKey || event.altKey || event.ctrlKey) return false

  const state = useStore.getState()
  const cursor = state.cursorTaskId
  const index = ordered.findIndex((t) => t.id === cursor)

  if (event.key === 'Enter' || event.key === ' ') {
    if (!cursor) return false
    event.preventDefault()
    /*
     * ⏎ always means "go one level deeper". Reopening what is already open
     * does nothing, so the second press moves the hand to the conversation.
     *
     * **The first press does not move to the conversation.** The side-by-side
     * list exists for "open, look, next"; taking the hand away the moment
     * something opens turns ↑↓ into conversation scrolling and you can no
     * longer move to the next task. The hand stays on the list even after
     * opening
     */
    if (state.detailOpen) focusPane('chat')
    else {
      void state.openTask(cursor)
      // The full-width table gets replaced by the side-by-side list. Return to the same pane after the redraw
      requestAnimationFrame(() => focusAny('list', 'chat'))
    }
    return true
  }

  const next = targetIndex(event.key, index, ordered.length)
  if (next === null) return false

  event.preventDefault()
  const id = ordered[next].id
  /*
   * Moving with the detail open reopens whatever we move to (the point of the
   * side-by-side list) — `moveCursor` already re-reads the conversation when the
   * detail is open, so this stays one action. It has to: walking a list is
   * **moving the cursor**, not going somewhere, and routing it through
   * `openTask` would file every row passed on the way as a place to go back to
   */
  void state.moveCursor(id)
  return true
}

/**
 * Where to move.
 *
 * **Stop** at the edges. Wrapping jumps to the opposite end when a key is
 * held, giving "meant to go back, ended up at the top" (a list is a column,
 * not a ring).
 */
function targetIndex(key: string, index: number, length: number): number | null {
  if (length === 0) return null
  // Pointing at nothing yet: start from the top regardless of direction
  const from = index < 0 ? null : index
  const clamp = (n: number): number => Math.min(length - 1, Math.max(0, n))

  switch (key) {
    case 'ArrowDown':
    case 'j':
      return from === null ? 0 : clamp(from + 1)
    case 'ArrowUp':
    case 'k':
      return from === null ? 0 : clamp(from - 1)
    case 'PageDown':
      return from === null ? 0 : clamp(from + PAGE)
    case 'PageUp':
      return from === null ? 0 : clamp(from - PAGE)
    case 'Home':
      return 0
    case 'End':
      return length - 1
    default:
      return null
  }
}
