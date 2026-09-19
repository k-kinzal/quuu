import type { ReactNode } from 'react'
import Modal from '@mui/material/Modal'
import { keyframes, styled } from '@mui/material/styles'
import { blockProps, fadeIn } from '../../theme/styled.js'

/**
 * The container for jumping to a destination without walking the hierarchy.
 *
 * This is **a shortcut**, not a replacement for the hierarchy. Build a feature that can
 * only be reached from here and the moment the shortcut breaks, the operation stops
 * being possible at all.
 */

const rise = keyframes({ from: { opacity: 0, transform: 'translateY(-10px) scale(0.985)' } })

/*
 * The scrim. backdrop-filter creates a compositing layer and draws unreliably depending
 * on the environment, so it is not used. A flat color is enough, and the palette itself
 * is always drawn opaque.
 *
 * `zIndex: -1` is not decoration. The scrim and the contents are siblings and only the
 * scrim is positioned, so without it the scrim paints after the contents and **the
 * curtain falls over the palette itself too**. MUI's default backdrop carries the same
 * value, but replacing it via slots takes that with it, so we hold it again here.
 */
const Backdrop = styled('div')(({ theme }) => ({
  position: 'fixed',
  inset: 0,
  zIndex: -1,
  background: theme.palette.surface.overlay,
  animation: `${fadeIn} ${theme.transitions.duration.shortest}ms ease-out`
}))

/*
 * The container decides the position. MUI lines the scrim and the contents up as
 * siblings, so alignment written on the scrim does not move the contents.
 */
const Overlay = styled(Modal)({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  paddingTop: '14vh'
})

const Box = styled('div', { shouldForwardProp: blockProps('width') })<{ width?: number }>(
  ({ theme, width = 680 }) => ({
    width,
    maxWidth: 'calc(100vw - 64px)',
    maxHeight: '62vh',
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${theme.palette.border.strong}`,
    borderRadius: 14,
    background: theme.palette.surface.raised,
    boxShadow: theme.shadows[24],
    overflow: 'hidden',
    outline: 'none',
    animation: `${rise} ${theme.transitions.duration.short}ms cubic-bezier(0.2, 0.9, 0.3, 1)`
  })
)

export interface CommandDialogProps {
  open: boolean
  width?: number
  onClose(): void
  children: ReactNode
}

export function CommandDialog({ open, width, onClose, children }: CommandDialogProps): JSX.Element {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      slots={{ backdrop: Backdrop }}
      disableAutoFocus
      /*
       * On close, **do not return focus to where it came from**.
       *
       * This container exists to "jump to a destination", so being sent back to the
       * pre-open spot after the jump puts the chosen result and the hand's location at
       * odds. It is fatal when a text field had focus before opening: at the
       * destination both ↑↓ and ⏎ belong to that field, and **the list cannot be moved
       * by keyboard at all** (that is what happened). Where focus goes is decided by
       * the side that jumped (the caller), looking at where it landed.
       */
      disableRestoreFocus
    >
      <Box width={width}>{children}</Box>
    </Overlay>
  )
}

/** The input band. Only here is the text larger, so there is no doubt where to type. */
export const CommandInputRow = styled('div')(({ theme }) => ({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(3),
  height: 52,
  padding: `0 ${theme.spacing(4)}`,
  borderBottom: `1px solid ${theme.palette.border.subtle}`,
  color: theme.palette.text.tertiary
}))

export const CommandList = styled('div')(({ theme }) => ({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: `${theme.spacing(2)} 0`
}))

export const CommandGroup = styled('div')(({ theme }) => ({
  padding: `${theme.spacing(2)} ${theme.spacing(4)} 2px`,
  ...theme.typography.caption,
  fontWeight: 600,
  color: theme.palette.text.tertiary
}))

export const CommandEmpty = styled('div')(({ theme }) => ({
  padding: `${theme.spacing(5)} ${theme.spacing(4)}`,
  textAlign: 'center',
  color: theme.palette.text.tertiary,
  ...theme.typography.body2
}))

/**
 * One candidate row.
 * Only the matched part (`<mark>`) takes the primary color, showing why it was a hit.
 */
export const CommandRow = styled('button', { shouldForwardProp: blockProps('active') })<{
  active?: boolean
}>(({ theme, active }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(3),
  height: 36,
  whiteSpace: 'nowrap',
  padding: `0 ${theme.spacing(3)}`,
  margin: `0 ${theme.spacing(2)}`,
  width: `calc(100% - ${theme.spacing(4)})`,
  border: 0,
  borderRadius: theme.radius.md,
  background: active ? theme.palette.surface.selected : 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  color: theme.palette.text.primary,
  '& [data-icon]': {
    color: active ? theme.palette.primaryText : theme.palette.text.tertiary
  },
  '& mark': {
    background: 'transparent',
    color: theme.palette.primaryText,
    fontWeight: 600
  }
}))

const RowIcon = styled('span')({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 18,
  flex: '0 0 18px'
})

/** The glyph at the head of a row. Its color is decided by the row's state (selected or not). */
export function CommandRowIcon({ children }: { children: ReactNode }): JSX.Element {
  return <RowIcon data-icon>{children}</RowIcon>
}

/** The hint along the bottom. Only the keys that work right now are shown. */
export const CommandFooter = styled('div')(({ theme }) => ({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(4),
  height: 32,
  padding: `0 ${theme.spacing(4)}`,
  borderTop: `1px solid ${theme.palette.border.subtle}`,
  background: theme.palette.surface.default,
  ...theme.typography.caption,
  color: theme.palette.text.tertiary
}))
