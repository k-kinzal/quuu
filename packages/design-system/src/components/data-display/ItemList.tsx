import { alpha, styled } from '@mui/material/styles'
import {
  blockProps,
  canHover,
  flash,
  surfaceStyles,
  type SurfaceLevel
} from '../../theme/styled.js'

/** The container rows stack into. Vertical scrolling belongs to this surface. */
export const ItemList = styled('div', { shouldForwardProp: blockProps('scroll', 'inset') })<{
  scroll?: boolean
  inset?: boolean
}>(({ theme, scroll = true, inset = false }) => ({
  flex: 1,
  minHeight: 0,
  overflowY: scroll ? 'auto' : 'visible',
  paddingBottom: theme.spacing(3),
  paddingInline: inset ? theme.spacing(1.5) : undefined,
  userSelect: 'none',
  ...(inset ? {
    '& button': { borderRadius: theme.radius.sm }
  } : {})
}))

/**
 * A group heading. It is the axis you scan by, so it stays at the top through scrolling.
 * Its background must match the parent surface, or the rows underneath show through.
 */
export const ItemGroupHeader = styled('div', { shouldForwardProp: blockProps('surface') })<{
  surface?: SurfaceLevel
}>(({ theme, surface = 'default' }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  height: theme.density.row.xs,
  whiteSpace: 'nowrap',
  padding: `0 ${theme.spacing(3)}`,
  marginTop: theme.spacing(2),
  ...theme.typography.caption,
  fontWeight: 600,
  color: theme.palette.text.tertiary,
  ...surfaceStyles(theme, surface),
  ...(surface === 'glass' ? {
    // Do not stack an opaque plate on the same film; just blur out the text flowing past.
    background: theme.palette.surface.glassPanel,
    backdropFilter: 'blur(24px)',
    borderRadius: theme.radius.sm,
    paddingInline: theme.spacing(2),
    marginBottom: theme.spacing(1)
  } : {}),
  position: 'sticky',
  top: 0,
  zIndex: 1
}))

/**
 * One row.
 *
 * The condition is that the identifier (the title) stays readable however narrow it
 * gets. Rather than build an unreadable degenerate form (a row of dots and nothing
 * else), hide the whole surface.
 *
 * `lines={2}` is the two-line form. Use it on a narrow surface when **there is an
 * attribute that has to appear alongside the identifier**. Adding an attribute to the
 * right of the same line steals width from the name, because only the identifier
 * shrinks (rule K-2). What cannot be added horizontally escapes downward, and the first
 * line gives all of its width to the identifier.
 */
export const ItemRow = styled('button', {
  shouldForwardProp: blockProps('selected', 'flashing', 'size', 'lines')
})<{
  selected?: boolean
  flashing?: boolean
  size?: 'md' | 'lg'
  lines?: 1 | 2
}>(({ theme, selected, flashing, size = 'lg', lines = 1 }) => ({
  position: 'relative',
  display: 'flex',
  // In the two-line form the contents decide the vertical placement (the mark to line one, each line centring itself)
  alignItems: lines === 2 ? 'stretch' : 'center',
  gap: theme.spacing(2),
  width: '100%',
  // The two-line height is built without inventing a new step (identifier row md + secondary row xs)
  height:
    lines === 2
      ? theme.density.row.md + theme.density.row.xs
      : size === 'lg'
        ? theme.density.row.xl
        : theme.density.row.lg,
  padding: `0 ${theme.spacing(3)}`,
  border: 0,
  background: selected ? theme.palette.surface.selected : 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  transition: theme.transitions.create('background-color', { duration: theme.transitions.duration.shortest }),
  '&:focus-visible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: -2 },
  '&:disabled': { opacity: theme.palette.action.disabledOpacity, cursor: 'default', pointerEvents: 'none' },
  [canHover]: { '&:hover': { background: selected ? alpha(theme.palette.primaryText, 0.22) : theme.palette.surface.hover } },
  // Feedback for surfaces touched by finger. With no hover, the background is laid only while pressed
  '&:active': { background: selected ? alpha(theme.palette.primaryText, 0.22) : theme.palette.surface.hover },
  ...(selected
    ? {
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 0,
          top: theme.spacing(2),
          bottom: theme.spacing(2),
          width: 2,
          borderRadius: theme.radius.full,
          // A 2px band is a mark, not a fill. Use a value that does not sink into the background
          background: theme.palette.primaryText
        }
      }
    : {}),
  ...(flashing
    ? { '--flash-color': theme.palette.primary.main + '24', animation: `${flash} 900ms ease-out` }
    : {})
}))

/** Metadata pushed to the right edge of a row: time, category color, marks. */
export const ItemMeta = styled('span')({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 5
})

/**
 * In the two-line form, the container that places the left-edge mark **aligned to the
 * first line**.
 *
 * Centred on the row height, the mark floats between line one and line two and you
 * cannot read which it belongs to. What the mark points at is the identifier, so it
 * goes up top.
 */
export const ItemMarker = styled('span')(({ theme }) => ({
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  height: theme.density.row.md,
  '& > *': { transform: `translateY(${theme.spacing(0.5)})` }
}))

/**
 * The container that stacks the contents of the two-line form (`ItemRow lines={2}`).
 * Drop the `minWidth: 0` and truncation inside stops working, pushing the row wider.
 */
export const ItemBody = styled('span')({
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  overflow: 'hidden'
})

/**
 * The second line: the secondary row placed under the identifier.
 * It is demoted by size and color (never by weight).
 */
export const ItemSubline = styled('span')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  minWidth: 0,
  whiteSpace: 'nowrap',
  ...theme.typography.caption,
  color: theme.palette.text.tertiary
}))
