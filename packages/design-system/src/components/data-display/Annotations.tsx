import { alpha, styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { feedbackMetrics, transcriptColor } from '../../theme/feedback.js'
import { lineHeight } from '../../theme/tokens.js'
import { Text } from './Text.js'
import { SourceBlock } from './SourceBlock.js'

/** The rank of a number is kept separate from what a color means. */
export const NumericLabel = styled('span', { shouldForwardProp: blockProps('color', 'subdued') })<{
  color?: string
  subdued?: boolean
}>(({ theme, color, subdued }) => ({
  ...theme.typography.caption,
  fontWeight: theme.typography.fontWeightBold,
  fontVariantNumeric: 'tabular-nums',
  color,
  opacity: subdued ? feedbackMetrics.opacity.subdued : 1
}))

/** What a quote's color means belongs to the caller; the border, the faint background and the folding belong here. */
export const Quotation = styled('div', {
  shouldForwardProp: blockProps('color', 'tinted', 'collapsed')
})<{
  color: string
  tinted?: boolean
  collapsed?: boolean
}>(({ theme, color, tinted, collapsed }) => ({
  padding: theme.spacing(2),
  borderLeft: `2px solid ${color}`,
  background: tinted ? alpha(color, feedbackMetrics.tint.quotation) : theme.palette.surface.raised,
  ...theme.typography.body2,
  lineHeight: lineHeight.base,
  whiteSpace: 'pre-wrap',
  userSelect: 'text',
  ...(collapsed
    ? {
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 4,
        overflow: 'hidden'
      }
    : {})
}))

/** Expanded code belongs to the enclosing detail surface and keeps one reading width. */
export function TranscriptCode(
  props: Omit<React.ComponentProps<typeof SourceBlock>, 'maxHeight' | 'appearance'>
): JSX.Element {
  return (
    <SourceBlock
      {...props}
      appearance="embedded"
      maxHeight={feedbackMetrics.preview.codeHeight}
      sx={(theme) => ({
        ...(props.tone === 'danger' && {
          '& pre': { color: transcriptColor(theme, theme.palette.error.main) }
        })
      })}
    />
  )
}

export const InlineMarker = styled('span')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  verticalAlign: 'middle',
  marginLeft: theme.spacing(1.25),
  color: theme.palette.primaryText
}))
export const MarkerSlot = styled('span')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: theme.spacing(0.75)
}))
export const InlineNote = styled(Text)(({ theme }) => ({ marginLeft: theme.spacing(2) }))
export const SupportingText = styled(Text)({ opacity: feedbackMetrics.opacity.secondary })

/** The caller never has to work out the badge's position or its digit cap. */
export const NotificationAnchor = styled('span')({ position: 'relative', display: 'inline-flex' })
const Notification = styled('span')(({ theme }) => ({
  position: 'absolute',
  top: -feedbackMetrics.badge.offset,
  left: '100%',
  marginLeft: theme.spacing(-0.5),
  padding: `0 ${theme.spacing(0.75)}`,
  borderRadius: theme.radius.full,
  background: theme.palette.error.main,
  color: theme.palette.text.inverse,
  ...theme.typography.caption,
  fontWeight: theme.typography.fontWeightBold,
  lineHeight: lineHeight.base
}))
export function NotificationBadge({ count }: { count: number }): JSX.Element | null {
  return count > 0 ? <Notification>{count > 99 ? '99+' : count}</Notification> : null
}

export const ColorMark = styled('span', { shouldForwardProp: blockProps('color', 'shape') })<{
  color: string
  shape?: 'circle' | 'square'
}>(({ theme, color, shape }) => ({
  width: theme.markSize,
  height: theme.markSize,
  flex: `0 0 ${theme.markSize}px`,
  borderRadius: shape === 'square' ? theme.radius.xs : theme.radius.full,
  background: color
}))
export const IconMark = styled('span', { shouldForwardProp: blockProps('color') })<{
  color: string
}>(({ theme, color }) => ({
  width: theme.iconSize.sm,
  height: theme.iconSize.sm,
  flex: `0 0 ${theme.iconSize.sm}px`,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color
}))
