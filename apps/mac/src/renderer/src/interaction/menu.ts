import type { MenuItemSpec } from '@design-system/react'
import type { MenuTemplateItem } from '../../../preload/api/desktop.js'

/**
 * **Let the OS open the right-click menu. Only right-click may come through
 * here.**
 *
 * Click-to-open menus (`⋯`, chips, value rows) are a different widget with a
 * different container (`Menu` in `@design-system/react`). The OS menu IS the
 * vocabulary "what appears on right-click", so don't repurpose it by passing
 * a position just because you want it attached to something clicked.
 * Repurposed, a surface appears detached from where you clicked.
 *
 * The screen only assembles "what to show"; drawing, positioning, keyboard,
 * and dismissal belong to the OS. Functions can't cross IPC, so rows get
 * numbers and the chosen number calls back.
 */
export async function contextMenu(items: MenuItemSpec[]): Promise<void> {
  const actions = new Map<string, () => void>()
  const template = serialize(items, actions, '')
  // Nothing pressable, nothing to open (never show an empty menu)
  if (template.length === 0) return

  const chosen = await window.quuu.system.popupMenu({
    items: template,
    // A menu with no position opens at the cursor (correct for right-click).
    // Only when opened by keystroke does it open where the hand is, not under
    // an untouched pointer
    x: keyboardAnchor?.x,
    y: keyboardAnchor?.y
  })
  if (chosen) actions.get(chosen)?.()
}

/** Screen coordinates. Used **only when the right-click menu is invoked by keystroke**. */
export interface MenuAnchor {
  x: number
  y: number
}

/**
 * The position when opened by keystroke.
 *
 * OS convention is that right-click menus "open at the cursor", so the
 * `onContextMenu` handlers pass no position. Only when opening via ⌘⌥⏎ is
 * that assumption swapped out **from the caller's side**. Adding positions
 * at each site would also break the correct pointer behavior (cursor
 * position).
 */
let keyboardAnchor: MenuAnchor | null = null

/**
 * Give a default position to menus opened inside `open`.
 *
 * `open` must be synchronous. `contextMenu` reads the position before its
 * first await (opening the OS menu), so the value arrives as long as the call
 * is synchronous.
 */
export function withMenuAnchor(anchor: MenuAnchor, open: () => void): void {
  keyboardAnchor = anchor
  try {
    open()
  } finally {
    keyboardAnchor = null
  }
}

/** The corner of the focused widget. Keystroke-invoked right-click menus open from there. */
export function focusAnchor(element: HTMLElement): MenuAnchor {
  const rect = element.getBoundingClientRect()
  return { x: Math.round(rect.left), y: Math.round(rect.bottom + 4) }
}

/**
 * Folded continuations (`more`) are unfolded and laid out flat here.
 *
 * OS menus **can't be restructured while open**. Passed folded, "N more"
 * becomes a row that does nothing when pressed and the remaining candidates
 * are out of reach. The OS wraps long lists anyway, so right-click shows
 * everything from the start.
 */
function unfold(items: MenuItemSpec[]): MenuItemSpec[] {
  return items.flatMap((item) => item.more ?? [item])
}

function serialize(
  items: MenuItemSpec[],
  actions: Map<string, () => void>,
  prefix: string
): MenuTemplateItem[] {
  return unfold(items).map((item, index) => {
    const id = `${prefix}${index}`
    if (item.onSelect) actions.set(id, item.onSelect)
    return {
      id,
      label: item.label,
      checked: item.checked,
      accelerator: item.accelerator,
      separatorBefore: item.separatorBefore,
      disabled: item.disabled,
      submenu: item.submenu ? serialize(item.submenu, actions, `${id}.`) : undefined
    }
  })
}
