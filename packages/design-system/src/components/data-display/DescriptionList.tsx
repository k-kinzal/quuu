import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { feedbackMetrics } from '../../theme/feedback.js'

/**
 * A list of attributes. Label and value are pinned to two columns, so it can be scanned
 * without being read.
 *
 * The value is a surface checked in one line, so it does not wrap. Only values that grow
 * to 0..n use `DetailStack` and stack vertically.
 */
export const DescriptionList = styled('dl', { shouldForwardProp: blockProps('labels') })<{
  /** Even a surface of short attribute names does not re-decide its column width per screen. */
  labels?: 'standard' | 'short'
}>(({ theme, labels = 'standard' }) => ({
  display: 'grid',
  gridTemplateColumns: `${labels === 'short' ? feedbackMetrics.attributes.shortLabelWidth : feedbackMetrics.attributes.labelWidth}px 1fr`,
  gap: `6px ${theme.spacing(2)}`,
  margin: 0,
  ...theme.typography.body2,
  alignItems: 'center',
  '& dt': { ...theme.typography.caption, color: theme.palette.text.tertiary },
  '& dd': {
    margin: 0,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(2),
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap',
    overflow: 'hidden'
  }
}))

/**
 * Values that grow to 0..n. Only here is the one-line premise released and the values
 * stacked vertically. Each individual row still does not wrap, so the rhythm holds.
 */
export const DetailStack = styled('dd')({
  // It has to win over `DescriptionList`'s `& dd`, so the class is doubled
  '&&': {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    whiteSpace: 'normal',
    overflow: 'visible'
  }
})

/**
 * The monospaced version. For things compared digit by digit: commands, paths, IDs.
 */
export const DataList = styled('dl', { shouldForwardProp: blockProps('placement') })<{
  placement?: 'standalone' | 'history'
}>(({ theme, placement = 'standalone' }) => ({
  display: 'grid',
  gridTemplateColumns: `${feedbackMetrics.attributes.dataLabelWidth}px 1fr`,
  gap: `2px ${theme.spacing(2)}`,
  margin: 0,
  paddingLeft: placement === 'history' ? feedbackMetrics.history.chainIndent : 0,
  ...theme.typography.caption,
  color: theme.palette.text.secondary,
  '& dt': { color: theme.palette.text.tertiary },
  '& dd': {
    margin: 0,
    minWidth: 0,
    fontFamily: theme.typography.fontFamilyMono,
    wordBreak: 'break-all',
    userSelect: 'text'
  }
}))
