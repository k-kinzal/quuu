import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { styled, useTheme } from '@mui/material/styles'
import { blockProps, surfaceStyles, type SurfaceLevel } from '../../theme/styled.js'
import { paneProfiles, restorePaneWidth, type PaneProfile, type PaneWidth } from '../../layoutSpec.js'
import { useStrings } from '../../theme/strings.js'

const ResizerRoot = styled('div', { shouldForwardProp: blockProps('active') })<{
  active: boolean
}>(({ theme, active }) => ({
  flex: '0 0 1px',
  position: 'relative',
  background: active ? theme.palette.primaryText : theme.palette.border.subtle,
  cursor: 'col-resize',
  // Nobody can aim at 1px. Keep the look at 1px and widen only the hit target
  '&::after': { content: '""', position: 'absolute', inset: '0 -3px' },
  '&:hover': { background: theme.palette.primaryText },
  /*
   * Show that the keyboard has grabbed it.
   * Drawing the default outline on a 1px line just looks like the line got slightly
   * thicker — "the hand is here right now" doesn't read. Light up the hit target
   * (`::after`) instead
   */
  '&:focus-visible': { outline: 'none', background: theme.palette.primaryText },
  '&:focus-visible::after': {
    outline: `2px solid ${theme.palette.primaryText}`,
    borderRadius: 3
  }
}))

export interface ResizerProps {
  value: PaneWidth
  profile: PaneProfile
  /** Invert for panes on the right (ones that grow leftward) */
  invert?: boolean
  /** What this is the boundary of. Readable before pressing, for those arriving by keyboard */
  label?: string
  onChange(value: PaneWidth): void
}

/** How far one arrow press moves. Hold ⇧ for 1px steps when fine-tuning. */
const STEP = 8

/** The boundary that changes a pane's width. Keep one flexible-width pane, and place one boundary at a time. */
export function Resizer({
  value,
  profile,
  invert = false,
  label,
  onChange
}: ResizerProps): JSX.Element {
  const strings = useStrings()
  const resizerLabel = label ?? strings.resizer.paneWidth
  const { min, max } = paneProfiles[profile]
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startValue = useRef(value)

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      startX.current = e.clientX
      startValue.current = value
      setDragging(true)
    },
    [value]
  )

  useEffect(() => {
    if (!dragging) return

    const move = (e: PointerEvent): void => {
      const delta = e.clientX - startX.current
      const next = startValue.current + (invert ? -delta : delta)
      onChange(restorePaneWidth(profile, next))
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
  }, [dragging, invert, profile, onChange])

  /**
   * Make the width changeable by keyboard too.
   *
   * A value that can only be changed by grabbing and dragging **does not exist for
   * people without a pointer**. Direction matches the pointer (→ moves the boundary
   * right). On an inverted pane that means "narrower", but what moves is always the
   * visible line, so nobody gets lost.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = e.shiftKey ? 1 : STEP
    const move = (delta: number): void => {
      e.preventDefault()
      onChange(restorePaneWidth(profile, value + (invert ? -delta : delta)))
    }
    if (e.key === 'ArrowLeft') move(-step)
    else if (e.key === 'ArrowRight') move(step)
    else if (e.key === 'Home') {
      e.preventDefault()
      onChange(restorePaneWidth(profile, invert ? max : min))
    } else if (e.key === 'End') {
      e.preventDefault()
      onChange(restorePaneWidth(profile, invert ? min : max))
    }
  }

  return (
    <ResizerRoot
      active={dragging}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={strings.resizer.horizontalAria(resizerLabel)}
      title={strings.resizer.horizontalTitle(resizerLabel)}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
    />
  )
}

const StackResizerRoot = styled('div', { shouldForwardProp: blockProps('active') })<{
  active: boolean
}>(({ theme, active }) => ({
  flex: '0 0 1px',
  width: '100%',
  position: 'relative',
  zIndex: 1,
  background: active ? theme.palette.primaryText : theme.palette.border.subtle,
  cursor: 'row-resize',
  // The horizontal one also stays 1px visually, grabbable up to 3px above and below
  '&::after': { content: '""', position: 'absolute', inset: '-3px 0' },
  '&:hover': { background: theme.palette.primaryText },
  '&:focus-visible': { outline: 'none', background: theme.palette.primaryText },
  '&:focus-visible::after': {
    outline: `2px solid ${theme.palette.primaryText}`,
    borderRadius: 3
  }
}))

export interface StackResizerProps {
  /** Share of the combined height that the pane above the boundary takes (0-1) */
  value: number
  /** What this is the boundary of. Name it so the target is clear when reached by keyboard */
  label?: string
  /** Minimum height per pane. Defaults to 3 medium rows at the current density */
  minSize?: number
  onChange(value: number): void
  /** Pass when double-click or Enter can restore the default ratio */
  onReset?(): void
}

function adjacentHeight(element: HTMLDivElement): number {
  const before = element.previousElementSibling?.getBoundingClientRect().height ?? 0
  const after = element.nextElementSibling?.getBoundingClientRect().height ?? 0
  return before + after
}

function shareRange(total: number, minSize: number): { min: number; max: number } {
  if (total <= 0) return { min: 0, max: 1 }
  const min = Math.min(0.5, minSize / total)
  return { min, max: 1 - min }
}

function clampShare(value: number, total: number, minSize: number): number {
  const range = shareRange(total, minSize)
  return Math.min(range.max, Math.max(range.min, value))
}

/**
 * The horizontal boundary that changes the heights of two vertically stacked panes.
 *
 * The value is a ratio between the two adjacent panes, not pixels, so the split
 * survives window height changes. Only during pointer drags is the minimum height
 * derived from actual sizes, so neither pane gets crushed down to just its header.
 */
export function StackResizer({
  value,
  label,
  minSize,
  onChange,
  onReset
}: StackResizerProps): JSX.Element {
  const strings = useStrings()
  const resizerLabel = label ?? strings.resizer.stackedPaneHeight
  const theme = useTheme()
  const minimum = minSize ?? theme.density.row.md * 3
  const [dragging, setDragging] = useState(false)
  const startY = useRef(0)
  const startValue = useRef(value)
  const totalSize = useRef(0)

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      startY.current = event.clientY
      startValue.current = value
      totalSize.current = adjacentHeight(event.currentTarget)
      setDragging(true)
    },
    [value]
  )

  useEffect(() => {
    if (!dragging) return

    const move = (event: PointerEvent): void => {
      if (totalSize.current <= 0) return
      const delta = (event.clientY - startY.current) / totalSize.current
      onChange(clampShare(startValue.current + delta, totalSize.current, minimum))
    }
    const up = (): void => setDragging(false)

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
    document.body.style.cursor = 'row-resize'
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', up)
      document.body.style.cursor = ''
    }
  }, [dragging, minimum, onChange])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const total = adjacentHeight(event.currentTarget)
    const ratioStep =
      total > 0 ? (event.shiftKey ? 1 : STEP) / total : event.shiftKey ? 0.01 : 0.05
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      onChange(clampShare(value + (event.key === 'ArrowDown' ? ratioStep : -ratioStep), total, minimum))
    } else if (event.key === 'Home') {
      event.preventDefault()
      onChange(shareRange(total, minimum).min)
    } else if (event.key === 'End') {
      event.preventDefault()
      onChange(shareRange(total, minimum).max)
    } else if (event.key === 'Enter' && onReset) {
      event.preventDefault()
      onReset()
    }
  }

  return (
    <StackResizerRoot
      active={dragging}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      role="separator"
      tabIndex={0}
      aria-orientation="horizontal"
      aria-label={strings.resizer.verticalAria(resizerLabel)}
      title={strings.resizer.verticalTitle(resizerLabel)}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    />
  )
}

export const COLLAPSE_HANDLE_WIDTH = 18

const HandleRoot = styled('button', { shouldForwardProp: blockProps('surface', 'bordered') })<{
  surface?: SurfaceLevel
  bordered?: boolean
}>(({ theme, surface = 'subtle', bordered = true }) => ({
  flex: `0 0 ${COLLAPSE_HANDLE_WIDTH}px`,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  border: 0,
  ...(bordered ? { borderRight: `1px solid ${theme.palette.border.subtle}` } : {}),
  ...surfaceStyles(theme, surface),
  color: theme.palette.text.tertiary,
  cursor: 'pointer',
  padding: 0,
  '& [data-grip]': {
    width: 3,
    height: 32,
    borderRadius: 2,
    background: theme.palette.border.strong
  },
  '&:hover': { background: theme.palette.surface.hover, color: theme.palette.primaryText },
  '&:hover [data-grip]': { background: theme.palette.primaryText }
}))

export interface CollapseHandleProps {
  /** Inside a single vessel, leave the outer edge to the vessel */
  bordered?: boolean
  /** Always says what it restores. The result must be readable before pressing */
  title: string
  /** A hint of direction. Pass an icon pointing the way it opens */
  icon?: ReactNode
  /** Surface level. Pass the same one as the collapsed pane (the trace is a continuation of it) */
  surface?: SurfaceLevel
  onClick(): void
}

/**
 * The trace left behind by a collapsed pane.
 *
 * **Restores only on press. Never slides out on hover** — a pane that opens in
 * passing steals the view mid-read. All this carries is "you can go back one step".
 */
export function CollapseHandle({
  title,
  icon,
  surface,
  bordered,
  onClick
}: CollapseHandleProps): JSX.Element {
  return (
    <HandleRoot type="button" surface={surface} bordered={bordered} title={title} aria-label={title} onClick={onClick}>
      <span data-grip />
      {icon}
    </HandleRoot>
  )
}
