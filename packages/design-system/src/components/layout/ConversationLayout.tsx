/** A flexible reading surface plus fixed ancillary sections. Floating controls take the reading surface as their datum and follow the input as it grows. */
import { blockProps } from '../../theme/styled.js'
import { feedbackMetrics } from '../../theme/feedback.js'
import { styled } from '@mui/material/styles'

export const ConversationRoot = styled('div')({
  flex: '1 1 auto',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
  position: 'relative'
})

export const CONVERSATION_PAD = 4

export const ConversationViewport = styled('div')({
  flex: '1 1 auto',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  position: 'relative'
})

export const ConversationScroll = styled('div')(({ theme }) => ({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: `${theme.spacing(CONVERSATION_PAD)} ${theme.spacing(CONVERSATION_PAD)} ${theme.spacing(2)}`
}))

export const ConversationIntro = styled('div')(({ theme }) => ({
  padding: `${theme.spacing(5)} 0`,
  '& > p': { margin: 0 }
}))

export const ConversationMore = styled('div')(({ theme }) => ({
  textAlign: 'center',
  paddingBottom: theme.spacing(3)
}))

export const FloatingAction = styled('button')(({ theme }) => ({
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  bottom: theme.spacing(3),
  zIndex: 3,
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  height: theme.density.control.xs,
  padding: `0 ${theme.spacing(2.5)}`,
  border: `1px solid ${theme.palette.border.strong}`,
  borderRadius: theme.radius.full,
  background: theme.palette.surface.raised,
  boxShadow: theme.shadows[8],
  ...theme.typography.caption,
  color: theme.palette.text.secondary,
  cursor: 'pointer',
  '&:hover': { color: theme.palette.text.primary }
}))

export const DetailFixed = styled('div')(({ theme }) => ({
  flex: '0 0 auto',
  padding: `${theme.spacing(3)} ${theme.spacing(3)} 0`
}))

export const DetailScroll = styled('section')(({ theme }) => ({
  flex: '1 1 auto',
  minHeight: feedbackMetrics.detail.minHeight,
  display: 'flex',
  flexDirection: 'column',
  padding: `0 ${theme.spacing(3)} ${theme.spacing(3)}`
}))

export const DetailGroup = styled('section', { shouldForwardProp: blockProps('last') })<{
  last?: boolean
}>(({ theme, last }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(3),
  marginBottom: last ? theme.spacing(3) : theme.spacing(5),
  // The container decides the spacing, so margins the direct children carry themselves are dropped
  '& > *': { margin: 0 },
  // Lists and quotes stretch to the full surface, but anything meant to be pressed stays at content width
  '& > .MuiButtonBase-root': { alignSelf: 'flex-start' }
}))
