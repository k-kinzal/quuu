import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import { createPortal } from 'react-dom'
import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { PopoverSurface, usePopoverPanel, type PanelPlacement } from './PopoverPanel.js'

/**
 * The vocabulary of menus, and **the surface for a menu you open by pressing**.
 *
 * ## There are two surfaces. Which one applies is decided by how it is invoked
 *
 * | How it is invoked | Surface | Who draws it |
 * |---------|-----|---------|
 * | Right click (and its keyboard equivalent) | The OS menu | The OS |
 * | **Pressed** a button, a chip, a value row | This `Menu` | This surface |
 *
 * **Do not reuse the right-click surface for things you open by pressing.** The OS
 * menu *is* the vocabulary "the thing that appears when you right click"; it does not
 * turn into a different part just because you move it somewhere else. A menu attached
 * to a button is a separate part that comes out stuck to that button, as the
 * continuation of the thing you pressed.
 *
 * We once collapsed the two onto the same surface ("let the OS draw the menu"), and
 * then `⋯`, chips and value rows all opened on the right-click surface too. The way
 * that breaks: a surface appears detached from the place you pressed. This file is
 * the revert of that.
 *
 * ## What breaks when you draw inside the window
 *
 * Four things: it gets crushed at the edge, the scrim swallows the press, it follows
 * you when you scroll, it stays up when you switch apps. **`PopoverPanel` takes on all
 * of them.** The keyboard (`↑↓` `Home/End` `⏎` `Esc` `→` to descend) belongs to this
 * surface.
 */

export interface MenuItemSpec {
  label: string
  onSelect?(): void
  /**
   * The submenu.
   *
   * **Nest one level, no deeper.** From the second level on it gets hard to keep it
   * open while you walk it. If the contents run past five, make it a separate menu
   * rather than a submenu. Only line items up here when you are "picking one and the
   * same value again" (priority, agent). This is not a place to fold away an
   * assortment of operations.
   */
  submenu?: MenuItemSpec[]
  /**
   * The folded remainder. **Pressing it replaces that row with the remainder** (the
   * same surface grows in place).
   *
   * When there are dozens of candidates, listing them all from the start means you
   * never reach the one you want. But silently cutting them off creates **candidates
   * you cannot pick**. A row that merely says "N more" is just confessing that it cut
   * them; you still cannot name them. Show the head, fold the rest in here, and reveal
   * the remainder only to whoever presses.
   *
   * Not the same thing as `submenu`. That one is a separate surface opening sideways,
   * for picking one value again. This one is **the continuation of the same list**, so
   * it is added in place without adding a surface.
   */
  more?: MenuItemSpec[]
  /** A row that carries a check. This is how the current value is shown (no word appended at the right edge) */
  checked?: boolean
  /**
   * The shortcut notation shown at the right edge (`Cmd+N` / `Cmd+Alt+1`).
   * **Display only** — it does not bind the key. Bindings are defined in exactly one place: the native menu
   */
  accelerator?: string
  separatorBefore?: boolean
  disabled?: boolean
}

/** Accepts both React's synthetic events and DOM events. */
interface PointerLike {
  target: EventTarget | null
  clientX: number
  clientY: number
  preventDefault(): void
  stopPropagation(): void
}

/** Over a text field? That is the OS edit menu's territory, so the app does not take it. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.closest('input, textarea') !== null
}

/**
 * Take the right click on ourselves.
 *
 * When it returns `false`, **do nothing**. Over a text field is exactly that case, and
 * the OS puts up cut / copy / paste.
 *
 * When we do take it, stop propagation too. If the inner surface answered, the outer
 * surface does not (a row's menu and the menu of the surface that row sits on must not
 * both come up).
 *
 * What we hand off to here is **the OS menu**, not the press-to-open menu (`Menu`).
 */
export function claimContextMenu(event: PointerLike): boolean {
  if (isEditable(event.target)) return false
  event.preventDefault()
  event.stopPropagation()
  return true
}

// ---------------------------------------------------------------------------
// The press-to-open menu
// ---------------------------------------------------------------------------

/**
 * Holds the open state.
 *
 * We remember what was pressed because **the menu comes out stuck to it**. Multiple
 * triggers within one list (filter chips, say) are told apart by `payload`.
 */
export function useMenu<T = undefined>(): {
  open(event: MouseEvent<HTMLElement>, payload?: T): void
  close(): void
  isOpen: boolean
  anchorEl: HTMLElement | null
  payload: T | undefined
} {
  const [state, setState] = useState<{ el: HTMLElement; payload: T | undefined } | null>(null)

  const open = useCallback((event: MouseEvent<HTMLElement>, payload?: T): void => {
    const el = event.currentTarget
    // Pressing the same thing again closes it (not a toggle that stays stuck open)
    setState((prev) => (prev?.el === el ? null : { el, payload }))
  }, [])

  const close = useCallback(() => setState(null), [])

  return {
    open,
    close,
    isOpen: state !== null,
    anchorEl: state?.el ?? null,
    payload: state?.payload
  }
}

export interface MenuProps {
  open: boolean
  /** What it sticks to. It comes out from the corner of the thing you pressed */
  anchorEl: HTMLElement | null
  /**
   * What to put up. **Evaluated when it opens** (built from the state at press time).
   * Taken as a function so we do not rebuild it on every render.
   */
  items(): MenuItemSpec[]
  /** What menu this is. It opens from glyph-only buttons, so screen readers need it */
  label: string
  placement?: PanelPlacement
  onClose(): void
}

const Separator = styled('div')(({ theme }) => ({
  height: 1,
  margin: `${theme.spacing(1)} ${theme.spacing(1)}`,
  background: theme.palette.border.subtle
}))

/**
 * One row.
 *
 * The background lands on **the row the hand is on right now** (the row that acts if
 * you press), not on the value currently in effect. The value in effect is said by the
 * check on the left.
 */
const Row = styled('button', { shouldForwardProp: blockProps('on') })<{ on?: boolean }>(
  ({ theme, on }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    width: '100%',
    height: theme.density.control.sm,
    padding: `0 ${theme.spacing(2)}`,
    border: 0,
    borderRadius: theme.radius.sm,
    background: on ? theme.palette.surface.selected : 'transparent',
    color: theme.palette.text.primary,
    ...theme.typography.body2,
    whiteSpace: 'nowrap',
    textAlign: 'left',
    cursor: 'pointer',
    '&:focus, &:focus-visible': { outline: 'none' },
    '&:disabled': { color: theme.palette.text.tertiary, cursor: 'default' }
  })
)

/** The check column. Rows without one still reserve the width, so labels start flush */
const Lead = styled('span')({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 12,
  flex: '0 0 12px'
})

const Label = styled('span')({
  flex: '1 1 auto',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
})

/** What is appended at the right edge (shortcut notation, the mark for a submenu). */
const Trailing = styled('span')(({ theme }) => ({
  flex: '0 0 auto',
  marginLeft: theme.spacing(3),
  color: theme.palette.text.tertiary,
  ...theme.typography.caption
}))

/** The selected mark. Drawn as a shape rather than trusting a glyph font (so the form does not vary by environment). */
const CheckMark = styled('span')(({ theme }) => ({
  display: 'inline-block',
  width: 5,
  height: 9,
  marginTop: -3,
  borderRight: `1.5px solid ${theme.palette.primaryText}`,
  borderBottom: `1.5px solid ${theme.palette.primaryText}`,
  transform: 'rotate(45deg)'
}))

/**
 * The mark that says there is a submenu. Drawn as a shape as well.
 *
 * Do not drop the `inline-block`. A bare `span` is an inline box, so width and height
 * do not apply, and it collapses into what looks like a single vertical line (that
 * actually happened).
 */
const ChevronMark = styled('span')(({ theme }) => ({
  display: 'inline-block',
  width: 5,
  height: 5,
  marginLeft: theme.spacing(3),
  borderTop: '1.5px solid currentColor',
  borderRight: '1.5px solid currentColor',
  borderRadius: 1,
  transform: 'rotate(45deg)',
  color: theme.palette.text.tertiary
}))

export function Menu({
  open,
  anchorEl,
  items,
  label,
  placement,
  onClose
}: MenuProps): JSX.Element | null {
  const { panelRef, position } = usePopoverPanel({ open, anchorEl, placement, onClose })
  const [active, setActive] = useState(0)
  const [openSub, setOpenSub] = useState<number | null>(null)
  /** Rows whose folded remainder was opened. Remembered by row, not index (the order shifts afterwards) */
  const [unfolded, setUnfolded] = useState<readonly MenuItemSpec[]>([])
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Built from the state at open time (not rebuilt on every render)
  const rows = useMemo(() => (open ? items() : []), [open, items])

  /**
   * The rows that actually line up. An opened `more` **replaces that row**.
   * If "N more" stayed, the same row would sit there after the press and you could not
   * read where the remainder begins.
   */
  const visible = useMemo(
    () => rows.flatMap((item) => (item.more && unfolded.includes(item) ? item.more : [item])),
    [rows, unfolded]
  )

  // Back to the top on every open. We do not remember where the hand was (a different story is starting)
  useEffect(() => {
    if (!open) return
    setActive(rows.findIndex((r) => !r.disabled))
    setOpenSub(null)
    setUnfolded([])
  }, [open, rows])

  /*
   * Place the hand **only after the position is settled**. Focusing before we measure
   * jumps once to the surface parked at the top-left of the screen and then corrects
   * itself (that spot flickers).
   */
  useEffect(() => {
    if (!open || position.visibility !== 'visible') return
    const row = rowRefs.current[active]
    if (row) row.focus()
    else panelRef.current?.focus()
    // Watch `visible` too. Opening the remainder swaps out the DOM including the pressed row, leaving the hand in mid-air
  }, [open, position.visibility, active, visible, panelRef])

  const move = (from: number, step: number): void => {
    const count = visible.length
    if (count === 0) return
    for (let i = 1; i <= count; i++) {
      const next = (((from + step * i) % count) + count) % count
      if (!visible[next].disabled) {
        setActive(next)
        setOpenSub(null)
        return
      }
    }
  }

  const choose = (item: MenuItemSpec): void => {
    if (item.disabled || item.submenu || item.more) return
    item.onSelect?.()
    onClose()
  }

  /**
   * Open the folded remainder. **Do not close the surface** (revealing the remainder is
   * a move made before choosing). The pressed row disappears, so move the hand to the
   * head of the remainder.
   */
  const unfold = (item: MenuItemSpec, index: number): void => {
    const first = item.more?.findIndex((r) => !r.disabled) ?? -1
    setUnfolded((prev) => [...prev, item])
    setActive(first < 0 ? index : index + first)
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      move(active, 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      move(active, -1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      move(-1, 1)
    } else if (e.key === 'End') {
      e.preventDefault()
      move(visible.length, -1)
    } else if (e.key === 'ArrowRight' && visible[active]?.submenu) {
      e.preventDefault()
      setOpenSub(active)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setOpenSub(null)
    }
  }

  if (!open) return null

  return createPortal(
    <PopoverSurface
      ref={panelRef}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{
        top: position.top,
        left: position.left,
        right: position.right,
        visibility: position.visibility
      }}
    >
      {visible.map((item, index) => (
        <div key={`${item.label}-${index}`}>
          {item.separatorBefore && index > 0 && <Separator />}
          <Row
            ref={(el: HTMLButtonElement | null) => {
              rowRefs.current[index] = el
            }}
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            aria-haspopup={item.submenu ? 'menu' : undefined}
            aria-expanded={item.submenu ? openSub === index : undefined}
            on={index === active}
            disabled={item.disabled}
            tabIndex={index === active ? 0 : -1}
            /* Even with a pointer there is only one hand. Move the hand itself to the row being grazed (no background on two rows) */
            onPointerEnter={() => {
              if (item.disabled) return
              setActive(index)
              setOpenSub(item.submenu ? index : null)
            }}
            onClick={() => {
              if (item.submenu) setOpenSub(index)
              else if (item.more) unfold(item, index)
              else choose(item)
            }}
          >
            <Lead>{item.checked && <CheckMark />}</Lead>
            <Label>{item.label}</Label>
            {item.accelerator && <Trailing>{item.accelerator}</Trailing>}
            {item.submenu && <ChevronMark />}
          </Row>
          {item.submenu && openSub === index && (
            <SubMenu
              anchorEl={rowRefs.current[index]}
              items={item.submenu}
              label={item.label}
              onClose={onClose}
            />
          )}
        </div>
      ))}
    </PopoverSurface>,
    document.body
  )
}

/**
 * The submenu. Comes out to the right of the parent row.
 *
 * Opens on hover. "Do not build surfaces that lunge out on hover" is a rule about
 * **surfaces that steal the view in passing**; walking inside an already-open menu is
 * not that. It also opens on press and on `→`, so it can be walked by hands for which
 * hover does not work.
 */
function SubMenu({
  anchorEl,
  items,
  label,
  onClose
}: {
  anchorEl: HTMLElement | null
  items: MenuItemSpec[]
  label: string
  onClose(): void
}): JSX.Element | null {
  /* To the right of the row. If it does not fit, it swings left (the parent may be pinned to the right edge of the screen) */
  const { panelRef, position } = usePopoverPanel({
    open: anchorEl !== null,
    anchorEl,
    placement: { prefer: 'right' },
    onClose
  })
  if (!anchorEl) return null

  return createPortal(
    <PopoverSurface
      ref={panelRef}
      role="menu"
      aria-label={label}
      style={{ top: position.top, left: position.left, visibility: position.visibility }}
    >
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`}>
          {item.separatorBefore && i > 0 && <Separator />}
          <Row
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect?.()
              onClose()
            }}
          >
            <Lead>{item.checked && <CheckMark />}</Lead>
            <Label>{item.label}</Label>
            {item.accelerator && <Trailing>{item.accelerator}</Trailing>}
          </Row>
        </div>
      ))}
    </PopoverSurface>,
    document.body
  )
}
