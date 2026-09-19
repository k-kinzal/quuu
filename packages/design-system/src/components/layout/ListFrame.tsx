import type { ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'

/**
 * The container for an editable list (rule O).
 *
 * For a table or a run of input rows alike, **fence the list in and put add/remove on
 * the band along the bottom**. Put the buttons outside the list and which list they act
 * on can only be read from their position, and that position drifts from screen to
 * screen (it really did: one list had them at the top right, another had them stuck 8px
 * under the list).
 *
 * The container owns the padding and the border, so the contents (a table, input rows)
 * own no padding.
 */
const FrameRoot = styled('div')(({ theme }) => ({
  border: `1px solid ${theme.palette.border.subtle}`,
  borderRadius: theme.radius.md,
  background: theme.palette.surface.canvas,
  overflow: 'hidden'
}))

/**
 * The contents. **The height holds even with zero items** — an empty container says
 * "there is nothing yet" by its shape. Not in prose ("there is nothing here yet").
 */
const FrameBody = styled('div', { shouldForwardProp: blockProps('pad') })<{ pad?: boolean }>(
  ({ theme, pad }) => ({
    minHeight: theme.density.row.xl,
    padding: pad ? theme.spacing(3) : undefined
  })
)

/**
 * The band along the bottom. Only actions on the list itself (add, remove) go here.
 *
 * **Push the actions to the right edge.** On a horizontally written surface, reading
 * ends on the right. Having read the list top to bottom and arrived at "right, let's
 * add one", that is where the hand goes; put them at the left edge and you send the eye
 * back to the start of the line. Same reason a dialog's confirm sits on the right
 * (rule J-5), applied inside the surface too.
 */
const FrameBar = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: theme.spacing(1),
  height: theme.density.row.lg,
  padding: `0 ${theme.spacing(2)}`,
  borderTop: `1px solid ${theme.palette.border.subtle}`,
  background: theme.palette.surface.subtle
}))

export interface ListFrameProps {
  /** The actions on the bottom band. Line `ListFrameButton`s up here */
  bar?: ReactNode
  /** Give the contents padding (for a run of input rows; a table brings its own) */
  pad?: boolean
  children: ReactNode
}

export function ListFrame({ bar, pad, children }: ListFrameProps): JSX.Element {
  return (
    <FrameRoot>
      <FrameBody pad={pad}>{children}</FrameBody>
      {bar && <FrameBar>{bar}</FrameBar>}
    </FrameRoot>
  )
}

/**
 * A button on the band. Glyph only, but kept big enough to press.
 *
 * **The icon arrives via props** (the design system does not ship icons).
 */
const BarButton = styled('button')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 20,
  padding: 0,
  border: 0,
  borderRadius: theme.radius.xs,
  background: 'transparent',
  color: theme.palette.text.secondary,
  cursor: 'pointer',
  '&:hover': { background: theme.palette.surface.hover, color: theme.palette.text.primary },
  '&:disabled': { color: theme.palette.text.tertiary, opacity: 0.4, cursor: 'default' },
  '&:disabled:hover': { background: 'transparent' }
}))

export interface ListFrameButtonProps {
  /** What the button does. It is glyph-only, so this cannot be omitted */
  title: string
  icon: ReactNode
  disabled?: boolean
  onClick(event: React.MouseEvent<HTMLButtonElement>): void
}

export function ListFrameButton({
  title,
  icon,
  disabled,
  onClick
}: ListFrameButtonProps): JSX.Element {
  return (
    <BarButton type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      {icon}
    </BarButton>
  )
}
