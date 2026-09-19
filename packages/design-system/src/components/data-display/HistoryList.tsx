/** A history that compares short values in columns. Selection, hover and column widths are unified; what the history is of comes from the children. */
import { blockProps } from '../../theme/styled.js'
import { feedbackMetrics } from '../../theme/feedback.js'
import { styled } from '@mui/material/styles'

export const HistoryTable = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  userSelect: 'none'
})

export const HistoryRow = styled('div', { shouldForwardProp: blockProps('selected') })<{
  selected?: boolean
}>(({ theme, selected }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  width: '100%',
  height: theme.density.row.lg,
  padding: `0 ${theme.spacing(1)}`,
  border: 0,
  borderRadius: theme.radius.sm,
  background: selected ? theme.palette.surface.selected : 'transparent',
  textAlign: 'left',
  ...theme.typography.caption,
  cursor: 'pointer',
  overflow: 'hidden',
  // A surface designed as one line. Its contents never wrap, no exceptions
  '& > *': { whiteSpace: 'nowrap' },
  '&:hover': { background: selected ? undefined : theme.palette.surface.hover }
}))

export const HistoryTime = styled('span')(({ theme }) => ({
  flex: '0 0 auto',
  fontVariantNumeric: 'tabular-nums',
  color: theme.palette.text.secondary
}))

export const HistoryTarget = styled('span')(({ theme }) => ({
  flex: '1 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: theme.palette.text.secondary
}))

export const HistoryResult = styled('span', { shouldForwardProp: blockProps('color') })<{
  color: string
}>(({ color }) => ({
  flex: `0 0 ${feedbackMetrics.history.resultWidth}px`,
  marginLeft: 'auto',
  fontWeight: feedbackMetrics.fontWeight.bold,
  color
}))

export const HistoryDuration = styled('span')(({ theme }) => ({
  flex: `0 0 ${feedbackMetrics.history.durationWidth}px`,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  color: theme.palette.text.tertiary
}))

export const HistoryChain = styled('div', { shouldForwardProp: blockProps('color') })<{
  color?: string
}>(({ theme, color }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1.25),
  height: theme.density.row.xs,
  paddingLeft: feedbackMetrics.history.chainIndent,
  ...theme.typography.caption,
  color: color ?? theme.palette.text.tertiary
}))
