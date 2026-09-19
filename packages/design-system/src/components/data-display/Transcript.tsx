/** The display rules for a conversation. Sticky headings share the body's padding, and expanded contents share their summary's surface. It carries no meaning about fetching, CLIs, or actions. */
/** Rendering of conversations and action logs. Fetching, what a speaker means, and running an action all belong to the caller. */
import { blockProps, canHover } from '../../theme/styled.js'
import { lineHeight } from '../../theme/tokens.js'
import { alpha } from '@mui/material/styles'
import { feedbackMetrics, transcriptColor } from '../../theme/feedback.js'
import { styled } from '@mui/material/styles'
import { CONVERSATION_PAD } from '../layout/ConversationLayout.js'

export const TranscriptSession = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0
})

export const TranscriptSessionScroll = styled('div')(({ theme }) => ({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: `${theme.spacing(3)} ${theme.spacing(3)} ${theme.spacing(4)}`
}))

export const TranscriptSection = styled('section')({})

export const TranscriptSectionHead = styled('header', {
  shouldForwardProp: blockProps('floating')
})<{
  floating?: boolean
}>(({ theme, floating }) => ({
  position: 'sticky',

  top: `-${theme.spacing(CONVERSATION_PAD)}`,
  zIndex: 2,
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  height: theme.density.row.sm,
  marginBottom: theme.spacing(1),
  marginInline: `-${theme.spacing(CONVERSATION_PAD)}`,
  padding: `0 ${theme.spacing(CONVERSATION_PAD)}`,
  background: theme.palette.surface.canvas,
  // Draw the rule only while it is floating. Overlap cannot be said with a background value (rule L-2)
  borderBottom: `1px solid ${floating ? theme.palette.border.subtle : 'transparent'}`,
  ...theme.typography.caption,
  color: theme.palette.text.tertiary
}))

export const TranscriptSectionTitle = styled('span')(({ theme }) => ({
  flex: 1,
  minWidth: 0,
  ...theme.typography.body2,
  color: theme.palette.text.secondary,
  // Rule K-1: a surface designed as one line never wraps
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
}))

export const TranscriptSectionAnchor = styled('div')({ height: 1, marginTop: -1 })

export const TranscriptTurn = styled('article', { shouldForwardProp: blockProps('sidechain') })<{
  sidechain?: boolean
}>(({ theme, sidechain }) => ({
  margin: `0 0 ${theme.spacing(6)}`,
  opacity: sidechain ? feedbackMetrics.opacity.secondary : 1
}))

export const TranscriptTurnHead = styled('header')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  height: theme.density.row.xs,
  marginBottom: theme.spacing(2),
  ...theme.typography.caption,
  color: theme.palette.text.tertiary
}))

export const TranscriptTurnRule = styled('span')(({ theme }) => ({
  flex: 1,
  height: 1,
  background: `linear-gradient(to right, ${theme.palette.border.subtle}, transparent)`
}))

export const TranscriptTurnRole = styled('span', { shouldForwardProp: blockProps('user') })<{
  user?: boolean
}>(({ theme, user }) => ({
  ...theme.typography.caption,
  fontWeight: theme.typography.fontWeightBold,
  color: user ? theme.palette.primaryText : theme.palette.text.secondary,
  whiteSpace: 'nowrap'
}))

export const TranscriptTurnBody = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2)
}))

export const TranscriptTurnText = styled('div', { shouldForwardProp: blockProps('role') })<{
  role?: 'user' | 'assistant' | 'system'
}>(({ theme, role }) => ({
  fontSize: theme.typography.body1.fontSize,
  lineHeight: lineHeight.read,
  // Markdown emits the body as structure, so line breaks are preserved here only for logs
  whiteSpace: role === 'system' ? 'pre-wrap' : 'normal',
  wordBreak: 'break-word',
  userSelect: 'text',
  ...(role === 'user'
    ? {
        padding: `${theme.spacing(2)} ${theme.spacing(3)}`,
        borderLeft: `2px solid ${theme.palette.primaryText}`,
        background: alpha(theme.palette.primary.main, feedbackMetrics.tint.message),
        borderRadius: `0 ${theme.radius.md}px ${theme.radius.md}px 0`
      }
    : {}),
  ...(role === 'system'
    ? {
        fontFamily: theme.typography.fontFamilyMono,
        ...theme.typography.caption,
        color: theme.palette.text.secondary
      }
    : {})
}))

export const TranscriptPendingBody = styled('div', { shouldForwardProp: blockProps('color') })<{
  color: string
}>(({ theme, color }) => ({
  padding: `${theme.spacing(2)} ${theme.spacing(3)}`,
  borderLeft: `2px dashed ${color}`,
  borderRadius: `0 ${theme.radius.md}px ${theme.radius.md}px 0`,
  background: alpha(color, feedbackMetrics.tint.pending)
}))

/** That there is something to open, and whether it is open, are both said by the same chevron rather than an underlined link. */
const disclosureMark = {
  content: '""',
  width: 5,
  height: 5,
  flex: '0 0 auto',
  borderRight: '1.5px solid currentColor',
  borderBottom: '1.5px solid currentColor',
  transform: 'rotate(-45deg)'
} as const

export const TranscriptThinkingToggle = styled('button')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  minHeight: theme.density.control.sm,
  border: 0,
  borderRadius: theme.radius.sm,
  background: 'transparent',
  padding: `0 ${theme.spacing(2)}`,
  ...theme.typography.caption,
  color: theme.palette.text.secondary,
  cursor: 'pointer',
  '&::before': disclosureMark,
  '&[aria-expanded="true"]::before': { transform: 'rotate(45deg)' },
  [canHover]: { '&:hover': { background: theme.palette.surface.hover, color: theme.palette.text.primary } },
  '&:focus-visible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: -2 }
}))

export const TranscriptThinkingBody = styled('div')(({ theme }) => ({
  marginTop: theme.spacing(1),
  paddingLeft: theme.spacing(3),
  borderLeft: `1px solid ${theme.palette.border.subtle}`,
  ...theme.typography.body2,
  color: theme.palette.text.tertiary,
  userSelect: 'text'
}))

export const TRANSCRIPT_IMAGE_HEIGHT = feedbackMetrics.preview.imageHeight

export const TranscriptImageStrip = styled('div')(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  gap: theme.spacing(2)
}))

export const TranscriptImageFrame = styled('button', {
  shouldForwardProp: blockProps('expanded', 'ratio')
})<{
  expanded?: boolean
  ratio?: number
}>(({ theme, expanded, ratio = 1.5 }) => ({
  display: 'block',
  padding: 0,
  maxWidth: '100%',

  border: 0,
  boxShadow: `inset 0 0 0 1px ${theme.palette.border.subtle}`,
  borderRadius: theme.radius.md,
  background: theme.palette.surface.subtle,
  overflow: 'hidden',
  cursor: expanded ? 'zoom-out' : 'zoom-in',
  ...(expanded
    ? { width: '100%' }
    : { width: TRANSCRIPT_IMAGE_HEIGHT * ratio, aspectRatio: String(ratio) }),
  '& img': {
    display: 'block',
    width: '100%',
    // The folded side stays within its frame. Never silently crop an image wider than the surface (a wide banner would vanish at the right edge)
    ...(expanded ? { height: 'auto' } : { height: '100%', objectFit: 'contain' })
  }
}))

export const TranscriptToolImages = styled('div')(({ theme }) => ({
  padding: theme.spacing(2)
}))

export const TranscriptImageMissing = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  padding: `0 ${theme.spacing(3)}`,
  ...theme.typography.caption,
  color: theme.palette.text.tertiary
}))

export type TranscriptToolTone = 'accent' | 'success' | 'neutral'

export const TranscriptToolCluster = styled('div', { shouldForwardProp: blockProps('tone') })<{
  tone: TranscriptToolTone
}>(({ theme, tone }) => ({
  display: 'flex',
  flexDirection: 'column',
  '& [data-verb]': {
    color:
      tone === 'accent'
        ? transcriptColor(theme, theme.palette.primaryText)
        : tone === 'success'
          ? transcriptColor(theme, theme.palette.success.main)
          : theme.palette.text.tertiary
  }
}))

/** The summary and its revealed sections share one surface, without nested cards. */
export const TranscriptToolEntry = styled('div', { shouldForwardProp: blockProps('open') })<{
  open?: boolean
}>(({ theme, open }) => ({
  minWidth: 0,
  borderRadius: theme.radius.sm,
  background: open ? theme.palette.surface.subtle : 'transparent',
  boxShadow: open ? `inset 0 0 0 1px ${theme.palette.border.subtle}` : 'none',
  overflow: 'hidden'
}))

export const TranscriptToolDetail = styled('div')(({ theme }) => ({
  minWidth: 0,
  borderTop: `1px solid ${theme.palette.border.subtle}`,
  '& > :not(:first-child)': { borderTop: `1px solid ${theme.palette.border.subtle}` }
}))

export const TranscriptToolLine = styled('button', { shouldForwardProp: blockProps('outcome') })<{
  outcome?: 'ok' | 'error' | 'pending' | 'more'
}>(({ theme, outcome = 'ok' }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  width: '100%',
  minHeight: theme.density.row.md,
  padding: `0 ${theme.spacing(2)} 0 0`,
  border: 0,
  borderRadius: theme.radius.sm,
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  [canHover]: { '&:hover': { background: theme.palette.surface.hover } },
  '&:focus-visible': { outline: `2px solid ${theme.palette.primaryText}`, outlineOffset: -2 },
  '&[aria-expanded]::after': { ...disclosureMark, marginRight: theme.spacing(1), color: theme.palette.text.tertiary },
  '&[aria-expanded="true"]': { background: theme.palette.surface.subtle },
  '&[aria-expanded="true"]::after': { transform: 'rotate(45deg)' },
  // The target is the part needed to identify it. Always keep the tail (the file name)
  '& [data-target]': {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: outcome === 'more' ? theme.typography.fontFamily : theme.typography.fontFamilyMono,
    ...theme.typography.caption,
    color:
      outcome === 'error'
        ? transcriptColor(theme, theme.palette.error.main)
        : outcome === 'pending' || outcome === 'more'
          ? theme.palette.text.tertiary
          : theme.palette.text.secondary
  },
  // Success gets no label. Only trouble is inked
  '& [data-flag]': {
    flex: '0 0 auto',
    ...theme.typography.caption,
    color: outcome === 'pending' ? theme.palette.text.tertiary : transcriptColor(theme, theme.palette.error.main)
  }
}))

export const TranscriptToolVerb = styled('span')(({ theme }) => ({
  flex: `0 0 ${feedbackMetrics.transcript.labelWidth}px`,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  ...theme.typography.caption,
  fontWeight: theme.typography.fontWeightBold,
  textAlign: 'right',
  color: theme.palette.text.tertiary
}))

export const TranscriptToolError = styled('div')(({ theme }) => ({
  padding: `0 ${theme.spacing(2)} ${theme.spacing(0.5)} ${feedbackMetrics.transcript.indent}px`,
  fontFamily: theme.typography.fontFamilyMono,
  ...theme.typography.caption,
  lineHeight: lineHeight.base,
  color: transcriptColor(theme, theme.palette.error.main),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  userSelect: 'text'
}))
