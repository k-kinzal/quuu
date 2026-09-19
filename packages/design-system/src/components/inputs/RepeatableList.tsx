import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { useStrings } from '../../theme/strings.js'
import { ListFrame } from '../layout/ListFrame.js'
import { Column, Row } from '../layout/Stack.js'

/**
 * A column of ordered inputs.
 *
 * Lays out things whose **order carries meaning**, like argument templates or
 * environment variables.
 *
 * Reordering is **grab and move**. Putting ↑ ↓ buttons on every row lines up
 * 3 symbols per row, making a surface where the controls outshine the values
 * (web forms tend to end up that way because they couldn't have a grab gesture).
 * For those who can't grab, the handle is reachable with `⇥` and moves with `↑ ↓` (rule P-3).
 *
 * **While grabbing, the value is never rewritten.**
 * The grabbed row floats with the finger (`raised` + shadow) and the remaining rows
 * shift to open **a gap at the drop target**. The order changes exactly once,
 * the moment the finger lifts.
 *
 * Without this, "swap the instant they overlap" swaps rows before your eyes with
 * no feel of grabbing and no drop target. Even the person moving them can't read
 * what happened.
 */

/** State while grabbing. Holds only **how it looks**, not values */
interface Drag {
  /** The grabbed row */
  from: number
  /** Where it would drop now */
  to: number
  /** How far the grabbed row has moved with the finger */
  dy: number
  /** The pitch of one row (height + gap) */
  pitch: number
}

interface Reorder {
  begin(index: number, event: React.PointerEvent<HTMLElement>): void
  key(index: number, event: React.KeyboardEvent<HTMLElement>): void
  drag: Drag | null
}

/**
 * Where the row should be right now.
 * The grabbed row moves by the finger's amount; rows caught in between shift
 * by one row to open the gap.
 */
function offsetOf(drag: Drag | null, index: number): number {
  if (!drag) return 0
  if (index === drag.from) return drag.dy
  if (index > drag.from && index <= drag.to) return -drag.pitch
  if (index < drag.from && index >= drag.to) return drag.pitch
  return 0
}

const ReorderContext = createContext<Reorder | null>(null)

export interface RepeatableListProps {
  /**
   * The "values actually in effect", shown faintly when empty.
   * Says **by shape** that the defaults are in charge (instead of writing "empty means default").
   */
  placeholder?: readonly string[]
  /** Actions placed in the bottom bar (a row of `ListFrameButton`) */
  bar?: ReactNode
  /** Allows reordering. Without it, no handle appears either */
  onReorder?(from: number, to: number): void
  children: ReactNode
}

export function RepeatableList({
  placeholder,
  bar,
  onReorder,
  children
}: RepeatableListProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const isEmpty = Array.isArray(children) ? children.flat().filter(Boolean).length === 0 : !children

  const rows = (): HTMLElement[] =>
    Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-repeat-row]') ?? [])

  const reorder: Reorder = {
    drag,
    begin(index, event) {
      if (!onReorder || event.button !== 0) return
      // No text gets selected while grabbing (a column of inputs invites selection)
      event.preventDefault()
      const handle = event.currentTarget
      const list = rows()
      // Measure the pitch for real. Row height and gap are the container's to decide, so don't count them
      const first = list[0]?.getBoundingClientRect()
      const second = list[1]?.getBoundingClientRect()
      const pitch = second && first ? second.top - first.top : (first?.height ?? 0)
      if (pitch <= 0) return

      // Until the finger lifts, events come to this handle
      // (synthetic events carry no grabbing finger, so continue even when capture fails)
      try {
        handle.setPointerCapture(event.pointerId)
      } catch {
        /* Reordering still works where capture is unavailable (synthetic events) */
      }

      const startY = event.clientY
      let current: Drag = { from: index, to: index, dy: 0, pitch }
      setDrag(current)

      const move = (e: PointerEvent): void => {
        // Never let the grabbed row leave the column. Show that it moves inside the container
        const dy = Math.min(
          (list.length - 1 - index) * pitch,
          Math.max(-index * pitch, e.clientY - startY)
        )
        current = { ...current, dy, to: index + Math.round(dy / pitch) }
        setDrag(current)
      }
      const end = (): void => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', end)
        handle.removeEventListener('pointercancel', end)
        setDrag(null)
        // The order changes only here, once, when the finger lifts
        if (current.to !== current.from) onReorder(current.from, current.to)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', end)
      handle.addEventListener('pointercancel', end)
    },
    key(index, event) {
      if (!onReorder) return
      const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
      if (delta === 0) return
      const target = index + delta
      const list = rows()
      if (target < 0 || target >= list.length) return
      event.preventDefault()
      onReorder(index, target)
      /*
       * Keep the hand on the row that moved. Row DOM is keyed by position, not order,
       * so doing nothing leaves the hand on "the other row that arrived at that position"
       * instead of "the row that was moved".
       */
      list[target].querySelector<HTMLElement>('[data-grip]')?.focus()
    }
  }

  return (
    <ListFrame pad bar={bar}>
      <ReorderContext.Provider value={onReorder ? reorder : null}>
        {isEmpty && placeholder ? (
          // The defaults are a read-only column. Tighter than editable rows, so spacing too says these are not values
          <Column gap={0}>
            {placeholder.map((value) => (
              <GhostRow key={value}>{value}</GhostRow>
            ))}
          </Column>
        ) : (
          <Column gap={2} ref={rootRef}>
            {children}
          </Column>
        )}
      </ReorderContext.Provider>
    </ListFrame>
  )
}

/** A value left to the defaults. Shown as a frameless row so it reads as untouchable. */
const GhostRow = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  height: theme.density.row.md,
  padding: `0 ${theme.spacing(2)}`,
  fontFamily: theme.typography.fontFamilyMono,
  ...theme.typography.caption,
  color: theme.palette.text.tertiary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
}))

const RowRoot = styled('div', {
  shouldForwardProp: blockProps('selected', 'dragging', 'offset', 'grabbable')
})<{
  selected?: boolean
  dragging?: boolean
  offset?: number
  grabbable?: boolean
}>(({ theme, selected, dragging, offset = 0, grabbable }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  // Always keep enough width for the surface to show around the input when grabbed.
  // If padding grows the moment you grab, the whole column jumps
  padding: `2px ${theme.spacing(1)}`,
  borderRadius: theme.radius.md,
  ...(grabbable && !selected ? { '&:hover': { background: theme.palette.surface.hover } } : {}),
  transform: offset === 0 ? undefined : `translateY(${offset}px)`,
  ...(dragging
    ? {
        /*
         * The grabbed row. **Floats with the finger.**
         * Tracking is not delayed even one frame (a transition lags behind the
         * finger and the feel of grabbing vanishes). The float is shown by the
         * shadow and the surface step.
         */
        position: 'relative',
        zIndex: 2,
        background: theme.palette.surface.raised,
        // A floating surface is shown by a 1px rule + shadow (rule L-5). Don't mix techniques with the in-column surfaces
        outline: `1px solid ${theme.palette.border.strong}`,
        boxShadow: theme.palette.elevation.overlay,
        cursor: 'grabbing'
      }
    : {
        background: selected ? theme.palette.surface.selected : 'transparent',
        // The gap opening is shown with motion. A sudden swap is unreadable
        transition: `transform ${theme.transitions.duration.shortest}ms ease-out`
      })
}))

/**
 * The grab spot. Drawn as a grid of dots instead of relying on a symbol font
 * (glyphs don't fracture across environments). The handle itself is a `⇥` stop
 * and moves with `↑ ↓`.
 */
const Grip = styled('button')(({ theme }) => ({
  flex: '0 0 auto',
  width: 12,
  height: theme.density.control.md,
  // The grab target takes the full row height; **dots are drawn only in the middle 12px**
  // (the background is clipped to the content-box, so widening the padding adds no dots)
  padding: '8px 1px',
  boxSizing: 'border-box',
  border: 0,
  borderRadius: theme.radius.xs,
  backgroundColor: 'transparent',
  backgroundImage: `radial-gradient(currentColor 0.9px, transparent 1.1px)`,
  backgroundSize: '5px 4px',
  backgroundPosition: 'center',
  // Dots are drawn only in the content-box. Widening the target (28px) adds no dots
  backgroundClip: 'content-box',
  color: theme.palette.text.tertiary,
  cursor: 'grab',
  touchAction: 'none',
  '&:hover': { color: theme.palette.text.secondary },
  '&:active': { cursor: 'grabbing' },
  '&:focus-visible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: -1 }
}))

const Ordinal = styled('span')(({ theme }) => ({
  flex: '0 0 auto',
  width: 16,
  textAlign: 'right',
  ...theme.typography.caption,
  fontVariantNumeric: 'tabular-nums',
  color: theme.palette.text.tertiary
}))

export interface RepeatableRowProps {
  /** The row's position. Becomes the reorder destination */
  index: number
  /** Show the number (only for columns where the rank itself has meaning) */
  ordinal?: boolean
  /** The row the bar's "remove" applies to. Marks where the hand is */
  selected?: boolean
  onSelect?(): void
  children: ReactNode
}

/** One row of a reorderable column. */
export function RepeatableRow({
  index,
  ordinal,
  selected,
  onSelect,
  children
}: RepeatableRowProps): JSX.Element {
  const strings = useStrings()
  const reorder = useContext(ReorderContext)
  return (
    <RowRoot
      data-repeat-row
      selected={selected}
      grabbable={Boolean(reorder)}
      dragging={reorder?.drag?.from === index}
      offset={offsetOf(reorder?.drag ?? null, index)}
      onPointerDown={onSelect}
      onFocusCapture={onSelect}
    >
      {reorder && (
        <Grip
          data-grip
          type="button"
          aria-label={strings.repeatableList.reorderAria(index + 1)}
          title={strings.repeatableList.reorderTitle}
          onPointerDown={(e) => reorder.begin(index, e)}
          onKeyDown={(e) => reorder.key(index, e)}
        />
      )}
      {ordinal && <Ordinal>{index + 1}</Ordinal>}
      {children}
    </RowRoot>
  )
}

/* --------------------------------------------------------------- Color picking */

const SwatchButton = styled('button', { shouldForwardProp: blockProps('color', 'on') })<{
  color: string
  on: boolean
}>(({ theme, color, on }) => ({
  width: 20,
  height: 20,
  padding: 0,
  borderRadius: theme.radius.full,
  // Selection is shown by the border. The fill displays the color itself, so it can't be taken
  border: `2px solid ${on ? theme.palette.text.primary : 'transparent'}`,
  background: color,
  cursor: 'pointer'
}))

export interface SwatchGroupProps {
  colors: readonly string[]
  value: string
  label: string
  onChange(color: string): void
}

/** Pick a color. Selection is shown by the border; the fill is the color itself. */
export function SwatchGroup({ colors, value, label, onChange }: SwatchGroupProps): JSX.Element {
  return (
    <Row wrap role="radiogroup" aria-label={label}>
      {colors.map((color) => (
        <SwatchButton
          key={color}
          type="button"
          role="radio"
          aria-checked={color === value}
          aria-label={color}
          title={color}
          color={color}
          on={color === value}
          onClick={() => onChange(color)}
        />
      ))}
    </Row>
  )
}
