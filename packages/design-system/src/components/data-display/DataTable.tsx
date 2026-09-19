import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import TableCell, { type TableCellProps } from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Table from '@mui/material/Table'
import { styled, type Theme } from '@mui/material/styles'
import { blockProps, flash } from '../../theme/styled.js'
import { useStrings } from '../../theme/strings.js'
import { Text } from './Text.js'

export const DataTable = styled(Table, { shouldForwardProp: blockProps('minWidth') })<{
  minWidth?: number
}>(({ minWidth }) => ({ minWidth }))
export { default as DataTableHead } from '@mui/material/TableHead'
export { default as DataTableBody } from '@mui/material/TableBody'
export { default as DataTableHeadRow } from '@mui/material/TableRow'

/** The character of a value. Only what should catch the eye while scanning gets a color. */
export type CellTone = 'default' | 'muted' | 'info' | 'success' | 'warning' | 'danger' | 'quiet'

interface CellShape {
  /**
   * Column width.
   *
   * **Give the identifier column a width too.** A column without one absorbs all the
   * space a wider window adds, leaving an empty band between name and attributes and
   * forcing the eye to traverse it to read one row.
   * Leftover width goes to `FillerCell` (`max-width` has no effect on table cells).
   *
   * Never use a fixed width for a value that can grow — that rule stands (convention K-2).
   * Width here means "the width this column asks for"; it shrinks when content is short
   */
  width?: number
  /** Left/right edge of the table. Carries the outer margin */
  edge?: 'start' | 'end'
  tone?: CellTone
  align?: 'left' | 'right'
  /**
   * Suppress the ellipsis (`…`) in this cell.
   *
   * Only two uses:
   * - **Marker-only columns.** An `…` in a single-symbol column looks like a broken mark
   * - **Columns whose content truncates itself** (identifier columns holding a `CellButton`).
   *   If both truncate you get `…  …` side by side
   *
   * An ellipsis signals "there is more", so say it in exactly one place.
   */
  clip?: boolean
}

const cellProps = blockProps('width', 'edge', 'tone', 'align', 'clip')

const shapeStyles = (theme: Theme, { width, edge, tone = 'default', align }: CellShape) => ({
  width: width ?? 'auto',
  textAlign: align,
  paddingLeft: edge === 'start' ? theme.spacing(4) : undefined,
  paddingRight: edge === 'end' ? theme.spacing(4) : undefined,
  color:
    tone === 'default'
      ? undefined
      : tone === 'muted' || tone === 'quiet'
        ? theme.palette.text.tertiary
        : theme.palette[tone === 'danger' ? 'error' : tone].main,
  fontStyle: tone === 'quiet' ? 'italic' : undefined
})

/**
 * Header cell. **Column widths are decided here.**
 * Writing widths on the body side fights the body's `max-width` and crushes the column.
 *
 * The resize handle (`ColumnResizer`) overlays using the `position: sticky` the header
 * already has as its positioning anchor. Writing `relative` here breaks that tracking.
 */
export const HeadCell = styled(TableCell, { shouldForwardProp: cellProps })<
  TableCellProps & CellShape
>(({ theme, ...shape }) => shapeStyles(theme, shape))

export const DataCell = styled(TableCell, { shouldForwardProp: cellProps })<
  TableCellProps & CellShape
>(({ theme, ...shape }) => ({
  ...shapeStyles(theme, shape),
  /*
   * Body cells may only shrink. Remove max-width here and long values
   * push the table wider, defeating the ellipsis (…).
   */
  maxWidth: 0,
  borderBottom: '1px solid transparent',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: shape.clip ? 'clip' : 'ellipsis'
}))

/**
 * A column whose only job is to absorb leftover width.
 *
 * It exists to pull the attribute columns next to the identifier and
 * **keep what must be read in one place.** Window width is no reason
 * to scatter the attributes.
 */
export const FillerCell = styled(TableCell)({ width: 'auto', padding: 0 })

/* ------------------------------------------------------------- Sorting */

export type SortDirection = 'asc' | 'desc'

/**
 * Direction mark. Drawn as a shape, not a symbol font (so glyphs don't break
 * across environments). Even on unsorted columns it fades in on hover, to show
 * "press and it sorts".
 */
const Caret = styled('span', { shouldForwardProp: blockProps('direction', 'idle') })<{
  direction: SortDirection
  idle?: boolean
}>(({ direction, idle }) => ({
  flex: '0 0 auto',
  width: 0,
  height: 0,
  marginLeft: 4,
  borderLeft: '3px solid transparent',
  borderRight: '3px solid transparent',
  ...(direction === 'asc'
    ? { borderBottom: '4px solid currentColor' }
    : { borderTop: '4px solid currentColor' }),
  opacity: idle ? 0 : 1,
  transition: 'opacity 120ms ease-out'
}))

const SortRoot = styled('button', { shouldForwardProp: blockProps('active', 'align') })<{
  active: boolean
  align?: 'left' | 'right'
}>(({ theme, active, align }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
  width: '100%',
  border: 0,
  padding: 0,
  background: 'transparent',
  font: 'inherit',
  letterSpacing: 'inherit',
  // Only the sorted column's text gets brighter. Don't flood the header band with color
  color: active ? theme.palette.text.primary : 'inherit',
  cursor: 'pointer',
  overflow: 'hidden',
  '&:hover': { color: theme.palette.text.primary },
  '&:hover [data-caret]': { opacity: active ? 1 : 0.45 }
}))

const SortText = styled('span')({ overflow: 'hidden', textOverflow: 'ellipsis' })

export interface SortLabelProps {
  /** The direction this column is sorted in. `null` means "not sorting on this column" */
  direction: SortDirection | null
  align?: 'left' | 'right'
  title?: string
  onToggle(): void
  children: ReactNode
}

/**
 * Makes the header the entry point for sorting.
 *
 * **Not-sorted is a state to show too** (a faint mark on hover).
 * If pressability doesn't show, nobody discovers the table can sort
 * until they try pressing a header.
 */
export function SortLabel({
  direction,
  align,
  title,
  onToggle,
  children
}: SortLabelProps): JSX.Element {
  return (
    <SortRoot
      type="button"
      active={direction !== null}
      align={align}
      title={title}
      onClick={onToggle}
    >
      <SortText>{children}</SortText>
      <Caret data-caret direction={direction ?? 'asc'} idle={direction === null} />
    </SortRoot>
  )
}

/* --------------------------------------------------------- Column width */

const ResizerRoot = styled('span', { shouldForwardProp: blockProps('active') })<{
  active: boolean
}>(({ theme, active }) => ({
  position: 'absolute',
  top: 0,
  bottom: 0,
  // Straddles the boundary. Nobody can aim at a 1px line, so only the hit area is widened
  right: -4,
  width: 9,
  cursor: 'col-resize',
  touchAction: 'none',
  zIndex: 1,
  '&::after': {
    content: '""',
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 4,
    width: 1,
    background: active ? theme.palette.primaryText : 'transparent'
  },
  '&:hover::after': { background: theme.palette.primaryText },
  // Show which column the keyboard has grabbed (the line alone doesn't read as focus)
  '&:focus-visible': { outline: 'none' },
  '&:focus-visible::after': { background: theme.palette.primaryText, width: 2, left: 3 }
}))

export interface ColumnResizerProps {
  value: number
  min: number
  max?: number
  /** Which column this handle belongs to. The name read out when reached by keyboard */
  label?: string
  /** Default width restored on double-press of the handle. Without it there is no way back */
  onReset?(): void
  onChange(width: number): void
}

/** How far one arrow press moves. Hold ⇧ to fine-tune 1px at a time. */
const COLUMN_STEP = 8

/**
 * Handle for resizing a column. Overlaid on the right edge of the header cell.
 *
 * Unlike a pane boundary (`Resizer`), **a column is not a pane**, so no line is
 * drawn permanently. It appears only on touch, keeping vertical lines from
 * lining up across the header band.
 */
export function ColumnResizer({
  value,
  min,
  max = 640,
  label,
  onReset,
  onChange
}: ColumnResizerProps): JSX.Element {
  const strings = useStrings()
  const resizerLabel = label ?? strings.dataTable.columnWidth
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startValue = useRef(value)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      // Don't drag the header's sort into this
      e.preventDefault()
      e.stopPropagation()
      startX.current = e.clientX
      startValue.current = value
      setDragging(true)
    },
    [value]
  )

  useEffect(() => {
    if (!dragging) return

    const move = (e: PointerEvent): void => {
      const next = startValue.current + (e.clientX - startX.current)
      onChange(Math.round(Math.min(max, Math.max(min, next))))
    }
    const up = (): void => setDragging(false)

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    document.body.style.cursor = 'col-resize'
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
  }, [dragging, max, min, onChange])

  /**
   * Make the width adjustable by keyboard too.
   * ⏎ is the same "restore default" as a double-press. Leave no value that
   * can't be undone without grabbing the handle.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>): void => {
    const step = e.shiftKey ? 1 : COLUMN_STEP
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      e.stopPropagation()
      const delta = e.key === 'ArrowLeft' ? -step : step
      onChange(Math.round(Math.min(max, Math.max(min, value + delta))))
      return
    }
    if (e.key === 'Enter' && onReset) {
      e.preventDefault()
      e.stopPropagation()
      onReset()
    }
  }

  return (
    <ResizerRoot
      active={dragging}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={strings.dataTable.columnAria(resizerLabel)}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      title={strings.dataTable.columnTitle(resizerLabel, Boolean(onReset))}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onReset?.()
      }}
    />
  )
}

/** One row. Selected, just-added, and finished rows must be tellable apart. */
export const DataRow = styled(TableRow, {
  shouldForwardProp: blockProps('selected', 'flashing', 'dimmed')
})<{
  selected?: boolean
  /** Flash briefly right after adding, to show where the row landed */
  flashing?: boolean
  /** A finished item. Readable but not assertive */
  dimmed?: boolean
}>(({ theme, selected, flashing, dimmed }) => ({
  height: theme.density.row.xl,
  cursor: 'pointer',
  '& > td': {
    background: selected ? theme.palette.surface.selected : undefined,
    ...(flashing
      ? { '--flash-color': theme.palette.primary.main + '24', animation: `${flash} 900ms ease-out` }
      : {})
  },
  '&:hover > td': { background: selected ? undefined : theme.palette.surface.hover },
  ...(selected
    ? // The 2px band is a mark, not a fill, so use a value that won't sink into the ground
      { '& > td:first-of-type': { boxShadow: `inset 2px 0 0 ${theme.palette.primaryText}` } }
    : {}),
  ...(dimmed
    ? { '& button': { color: theme.palette.text.tertiary, textDecoration: 'line-through' } }
    : {}),
  // Row actions appear only while you're on the row (don't paint constant repetition)
  '& [data-row-actions]': { opacity: selected ? 1 : 0 },
  '&:hover [data-row-actions]': { opacity: 1 }
}))

/**
 * Height of a group header.
 *
 * **Don't let content decide the height.** A table with many rows draws only what
 * fits the screen (windowing), so positions must be computable by arithmetic.
 * If font size changes the height, nothing can be counted.
 */
export const GROUP_ROW_HEIGHT = 34

const GroupCell = styled(TableCell)(({ theme }) => ({
  height: GROUP_ROW_HEIGHT,
  padding: `${theme.spacing(3)} ${theme.spacing(2)} 2px`
}))

export interface TableGroupRowProps {
  label: ReactNode
  count?: number
  colSpan: number
}

/**
 * Group header. Placed as a row inside the table.
 *
 * To read as a heading without larger type, it differs by **weight and letter-spacing**.
 * A bigger size breaks the row rhythm; added color competes with the value colors.
 */
export function TableGroupRow({ label, count, colSpan }: TableGroupRowProps): JSX.Element {
  return (
    <TableRow>
      <GroupCell colSpan={colSpan}>
        <Text size="xs" weight="bold" tone="secondary" sx={{ mr: 2, letterSpacing: '0.04em' }}>
          {label}
        </Text>
        {count !== undefined && (
          <Text size="xs" tone="tertiary" tabular>
            {count}
          </Text>
        )}
      </GroupCell>
    </TableRow>
  )
}

/**
 * A row that holds the height of rows not currently in the window.
 *
 * A table with many rows **draws only what fits the screen.** By carrying the height
 * of the undrawn rows here, scroll position and extent stay sized to the full set
 * (the thumb doesn't stretch and shrink).
 */
export function SpacerRow({ height, colSpan }: { height: number; colSpan: number }): JSX.Element {
  return (
    <TableRow aria-hidden style={{ height }}>
      <TableCell colSpan={colSpan} style={{ padding: 0, border: 0 }} />
    </TableRow>
  )
}

/**
 * Gives the identifier a pressable form.
 *
 * Even in a table where pressing the whole row opens it, the identifier stays
 * pressable, so that **one place in the row names where to press to get inside**
 * (a whole row reacting to hover doesn't say where pressing leads).
 * Truncated full text comes back via `title`. Never trim the identifier's ends
 * (if trimming, trim the middle).
 */
export const CellButton = styled('button')(({ theme }) => ({
  border: 0,
  background: 'transparent',
  padding: 0,
  font: 'inherit',
  color: theme.palette.text.primary,
  cursor: 'pointer',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'left',
  '&:hover': { color: theme.palette.primaryText }
}))

const RowActionsRoot = styled('span')({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  justifyContent: 'flex-end',
  opacity: 0
})

/** Actions folded into the row's right edge. Appear only on hover and selection. */
export function RowActions({ children }: { children: ReactNode }): JSX.Element {
  return <RowActionsRoot data-row-actions>{children}</RowActionsRoot>
}
