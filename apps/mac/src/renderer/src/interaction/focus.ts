import { withMenuAnchor } from './menu.js'

/**
 * Pane — "where the keyboard's hand is right now".
 *
 * A pointer addresses whatever it clicks, so it can operate without the concept
 * of a pane. The keyboard has no such thing: something must decide **who** ↑↓
 * and ⏎ are addressed to. We hold that in DOM focus itself (keeping separate
 * state drifts from focus moved by clicks, producing "the list looks selected
 * but arrows do nothing").
 *
 * Panes carry `data-pane`. Ordering uses **DOM order** as-is, so collapsed or
 * hidden panes are skipped automatically (no separate ordering table).
 */
export type PaneId =
  | 'rail'
  | 'list'
  | 'chat'
  | 'review'
  | 'terminal'
  | 'composer'
  | 'inspector'
  | 'settings'

interface PaneProps {
  'data-pane': PaneId
  'data-keyboard-region': string
  tabIndex: number
}

/**
 * Marks a pane.
 *
 * Panes given `tab` are also reachable via ⇥. Panes without it only receive
 * the hand through ⌘⌥← / ⌘⌥→ and explicit moves (to keep the ⇥ count down).
 */
export function pane(id: PaneId, options: { tab?: boolean } = {}): PaneProps {
  return { 'data-pane': id, 'data-keyboard-region': '', tabIndex: options.tab ? 0 : -1 }
}

/**
 * Where the hand actually lands inside a pane.
 *
 * Panes with an input field get their input (`data-pane-focus`); panes with
 * rows get the currently selected row (`data-active`). Neither: the pane
 * itself. Leaving the hand on the container means ⏎ right after entering a
 * pane has no addressee.
 */
function innerTarget(el: HTMLElement): HTMLElement {
  return (
    el.querySelector<HTMLElement>('[data-pane-focus]') ??
    el.querySelector<HTMLElement>('[data-active]') ??
    el
  )
}

function paneElement(id: PaneId): HTMLElement | null {
  return panes().find((element) => element.dataset.pane === id) ?? null
}

function panes(): HTMLElement[] {
  // Exiting motion pictures and hidden tabs must never intercept the next keyboard action.
  return [...document.querySelectorAll<HTMLElement>('[data-pane]')].filter(
    (element) => !element.closest('[inert], [hidden], [aria-hidden="true"]')
  )
}

/**
 * Move the hand to a pane.
 *
 * A pane being absent from the screen is normal (the list isn't there while
 * settings is open). In that case, do **nothing**. Forcing focus onto another
 * pane makes the mapping between the key pressed and where the hand went
 * unreadable.
 */
export function focusPane(id: PaneId): boolean {
  const el = paneElement(id)
  if (!el) return false
  innerTarget(el).focus()
  return true
}

/**
 * Move the hand to the first pane found, in the order given.
 *
 * Panes can be collapsed (e.g. the list is minimized). Hard-coding a single
 * "return-to" pane leaves the hand floating when that pane is collapsed
 * (it falls to body and the next key reaches no one).
 */
export function focusAny(...ids: PaneId[]): boolean {
  for (const id of ids) {
    if (focusPane(id)) return true
  }
  return false
}

/** The pane the hand is in now. null if it belongs to no pane. */
export function currentPane(): PaneId | null {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return null
  const el = active.closest<HTMLElement>('[data-pane]')
  return (el?.dataset.pane as PaneId | undefined) ?? null
}

/**
 * Move the hand to the adjacent pane (⌘⌥← / ⌘⌥→).
 *
 * Wrap at the edges instead of stopping. There are only 3–5 panes; stopping
 * at the edge teaches "looks like a dead end, but you can actually get there
 * by going the other way around".
 */
export function movePaneFocus(delta: 1 | -1): void {
  const list = panes()
  if (list.length === 0) return
  const active = document.activeElement
  const here = active instanceof HTMLElement ? active.closest<HTMLElement>('[data-pane]') : null
  const index = here ? list.indexOf(here) : -1
  // When in no pane, enter from the edge on the side we're moving toward
  const next =
    index < 0
      ? delta === 1
        ? 0
        : list.length - 1
      : (index + delta + list.length) % list.length
  innerTarget(list[next]).focus()
}

/**
 * Walk within a pane using ↑↓ (vertically stacked rows, like the rail or the
 * settings categories).
 *
 * ⇥ can walk them too, but ⇥ also means "next pane". Keeping in-pane movement
 * on ↑↓ means **leaving the pane is one ⇥ no matter how many rows it has**.
 *
 * @param selector what counts as a row inside the pane
 * @returns whether the key was handled
 */
export function moveWithinList(
  event: {
    key: string
    metaKey: boolean
    ctrlKey: boolean
    altKey: boolean
    currentTarget: EventTarget & HTMLElement
    preventDefault(): void
  },
  selector: string
): boolean {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false
  if (event.metaKey || event.ctrlKey || event.altKey) return false

  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(selector)].filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex >= 0
  )
  if (items.length === 0) return false

  event.preventDefault()
  const active = document.activeElement
  const index = active instanceof HTMLElement ? items.indexOf(active) : -1
  if (index < 0) {
    items[0].focus()
    return true
  }
  // Stop at the edges (wrapping jumps to the opposite end when a key is held)
  const next = event.key === 'ArrowDown' ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1)
  items[next].focus()
  return true
}

/**
 * Make non-buttons (table rows etc.) pressable from the keyboard too.
 *
 * `<tr onClick>` looks pressable but is **pointer-only**. Small lists
 * (settings agents, run history) go on the `⇥` order here. Lists with
 * hundreds of rows become one widget per pane (`listNav.ts`) — putting those
 * on `⇥` would take hundreds of presses to leave the pane.
 */
export function rowActivation(run: () => void): {
  tabIndex: number
  role: string
  onKeyDown(event: { key: string; preventDefault(): void }): void
} {
  return {
    tabIndex: 0,
    role: 'button',
    onKeyDown(event) {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      run()
    }
  }
}

/** Is the user typing? ↑↓ and ⏎ here belong to the input field, not the screen. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.closest('input, textarea, select') !== null
}

/**
 * Open the context menu for the focused row/column/pane, at its location
 * (⌘⌥⏎).
 *
 * **Do not rebuild the right-click contents.** Actually dispatch `contextmenu`
 * and let the existing `onContextMenu` answer. That way, menus added later
 * open from the keyboard with no extra wiring (rebuilding leaves newly added
 * menus stranded as pointer-only).
 */
export function openContextMenuAtFocus(): void {
  const target = contextTarget()
  if (!target) return

  const rect = target.getBoundingClientRect()
  /*
   * Match the geometry of opening under the pressing finger.
   * Anchoring at the row's bottom-left lets the menu drop without covering
   * the row's text
   */
  const anchor = {
    x: Math.round(rect.left + 12),
    y: Math.round(Math.min(rect.bottom, window.innerHeight - 8))
  }

  withMenuAnchor(anchor, () => {
    target.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        buttons: 2,
        clientX: anchor.x,
        clientY: anchor.y
      })
    )
  })
}

/**
 * Who the menu is for.
 *
 * Where **the pane holds the hand but points at a separate row** (like the
 * list), let the pointed row answer instead of the pane
 * (`aria-activedescendant` is that row).
 */
function contextTarget(): HTMLElement | null {
  const active = document.activeElement
  const el = active instanceof HTMLElement && active !== document.body ? active : paneElement('list')
  if (!el) return null

  const cursor = el.getAttribute('aria-activedescendant')
  if (cursor) return document.getElementById(cursor) ?? el
  return el
}
