import { styled } from '@mui/material/styles'
import { blockProps, canHover } from '../../theme/styled.js'

/** An IDE ancillary surface. The band, the context, the scanning area and the selection's detail all sit on the same vertical axis. */
export const ToolPanel = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden'
})

/** The band for search, sort and filter. It is a tool rather than content, so it always stays at the top. */
export const ToolPanelToolbar = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  flex: `0 0 ${theme.density.row.lg}px`,
  height: theme.density.row.lg,
  padding: `0 ${theme.spacing(2)}`,
  borderBottom: `1px solid ${theme.palette.border.subtle}`,
  background: theme.palette.surface.default,
  userSelect: 'none'
}))

/** Holds the selected target and this surface's conclusion. Kept apart from the repetition of the list. */
export const ToolPanelSummary = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1),
  flex: '0 0 auto',
  padding: theme.spacing(2),
  borderBottom: `1px solid ${theme.palette.border.subtle}`,
  background: theme.palette.surface.canvas,
  userSelect: 'none'
}))

export const ToolPanelSummaryRow = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  minWidth: 0
}))

/** The only region whose quantity is unbounded. It drags neither the context above nor the selection detail below along with it. */
export const ToolPanelScroller = styled('div')({
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  outline: 0
})

export const ToolPanelGroup = styled('details')({
  display: 'block'
})

export const ToolPanelGroupHeader = styled('summary')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  height: theme.density.row.md,
  padding: `0 ${theme.spacing(2)}`,
  listStyle: 'none',
  color: theme.palette.text.tertiary,
  background: theme.palette.surface.default,
  ...theme.typography.caption,
  fontWeight: 600,
  userSelect: 'none',
  cursor: 'default',
  '&::-webkit-details-marker': { display: 'none' },
  [canHover]: { '&:hover': { background: theme.palette.surface.hover, color: theme.palette.text.secondary } }
}))

export const ToolPanelDisclosure = styled('span')(({ theme }) => ({
  width: theme.iconSize.sm,
  height: theme.iconSize.sm,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: `0 0 ${theme.iconSize.sm}px`,
  transition: theme.transitions.create('transform', {
    duration: theme.transitions.duration.shortest
  }),
  'details[open] > summary &': { transform: 'rotate(90deg)' }
}))

export const ToolPanelRow = styled('button', {
  shouldForwardProp: blockProps('selected', 'depth', 'lines')
})<{ selected?: boolean; depth?: number; lines?: 1 | 2 }>(({ theme, selected, depth = 0, lines = 1 }) => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  width: '100%',
  height: lines === 2 ? theme.density.row.md + theme.density.row.xs : theme.density.row.md,
  padding: `0 ${theme.spacing(2)} 0 ${theme.spacing(2 + Math.min(depth, 8) * 3)}`,
  border: 0,
  background: selected ? theme.palette.surface.selected : 'transparent',
  color: selected ? theme.palette.text.primary : theme.palette.text.secondary,
  textAlign: 'left',
  cursor: 'default',
  userSelect: 'none',
  [canHover]: {
    '&:hover': { background: selected ? theme.palette.surface.selected : theme.palette.surface.hover }
  },
  '&:focus-visible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: -2 },
  '&::before': selected
    ? {
        content: '""',
        position: 'absolute',
        left: 0,
        top: theme.spacing(1),
        bottom: theme.spacing(1),
        width: 2,
        background: theme.palette.primaryText
      }
    : undefined
}))

export const ToolPanelRowIcon = styled('span')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: theme.iconSize.sm,
  height: theme.iconSize.sm,
  flex: `0 0 ${theme.iconSize.sm}px`,
  color: theme.palette.text.tertiary
}))

export const ToolPanelRowBody = styled('span')({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  flex: '1 1 auto',
  minWidth: 0,
  overflow: 'hidden'
})

export const ToolPanelRowLabel = styled('span')(({ theme }) => ({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  ...theme.typography.caption,
  color: 'inherit'
}))

export const ToolPanelRowDetail = styled('span')(({ theme }) => ({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  ...theme.typography.caption,
  color: theme.palette.text.tertiary,
  fontFamily: theme.typography.fontFamilyMono
}))

export const ToolPanelRowProgress = styled('span')(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.spacing(2),
  minWidth: 0,
  ...theme.typography.caption,
  color: theme.palette.text.tertiary,
  fontVariantNumeric: 'tabular-nums'
}))

export const ToolPanelRowMeta = styled('span')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: theme.spacing(2),
  flex: '0 0 auto',
  color: theme.palette.text.tertiary,
  ...theme.typography.caption,
  fontVariantNumeric: 'tabular-nums'
}))

/** The selected row's values and the primary action. Pinned outside the scroll, so the end point is never lost in a long list. */
export const ToolPanelFooter = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  flex: `0 0 ${theme.density.row.lg}px`,
  height: theme.density.row.lg,
  padding: `0 ${theme.spacing(2)}`,
  borderTop: `1px solid ${theme.palette.border.subtle}`,
  background: theme.palette.surface.subtle,
  userSelect: 'none'
}))

export const ToolPanelMetricGrid = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: theme.spacing(1)
}))

export const ToolPanelMetric = styled('button', { shouldForwardProp: blockProps('selected') })<{
  selected?: boolean
}>(({ theme, selected }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: 0,
  minWidth: 0,
  height: theme.density.row.lg + theme.density.row.xs,
  padding: `0 ${theme.spacing(2)}`,
  border: `1px solid ${selected ? theme.palette.primaryText : theme.palette.border.subtle}`,
  borderRadius: theme.radius.sm,
  background: selected ? theme.palette.surface.selected : 'transparent',
  color: selected ? theme.palette.text.primary : theme.palette.text.tertiary,
  ...theme.typography.caption,
  cursor: 'default',
  [canHover]: { '&:hover': { background: theme.palette.surface.hover, color: theme.palette.text.primary } }
}))
