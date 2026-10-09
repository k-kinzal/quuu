import type { ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import { blockProps, canHover } from '../../theme/styled.js'
import { focusRing } from '../../theme/controls.js'
import { lineHeight } from '../../theme/tokens.js'
import { Button } from '../inputs/Button.js'

/** A shared text column keeps messages and their input on the same reading axis. */
export const MessageColumn = styled('div')(({ theme }) => ({
  width: '100%',
  maxWidth: theme.measure,
  minWidth: 0,
  marginInline: 'auto'
}))

/** Selection belongs to the conversation being read, not to individual words or roles. */
export const MessageGroup = styled('article', { shouldForwardProp: blockProps('selected') })<{ selected?: boolean }>(({ theme, selected }) => ({
  position: 'relative',
  paddingBlock: theme.spacing(2),
  marginBottom: theme.spacing(2),
  borderRadius: theme.radius.md,
  ...(selected ? {
    '&::before': {
      content: '""', position: 'absolute', left: `-${theme.spacing(2)}`,
      top: theme.spacing(2), bottom: theme.spacing(2), width: 2,
      borderRadius: theme.radius.full, background: theme.palette.primaryText
    }
  } : {})
}))

const Root = styled('div')(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: `${theme.density.control.sm}px minmax(0, 1fr)`,
  columnGap: theme.spacing(2),
  rowGap: theme.spacing(1),
  minWidth: 0,
  '& + &': { marginTop: theme.spacing(4) }
}))
const Mark = styled('span')(({ theme }) => ({
  gridColumn: 1,
  gridRow: '1 / span 3',
  height: theme.density.control.sm,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  color: theme.palette.text.secondary,
  '& > svg': { display: 'block', flexShrink: 0 }
}))
const Header = styled('div')(({ theme }) => ({
  gridColumn: 2,
  display: 'flex',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  gap: theme.spacing(2),
  minHeight: theme.density.control.sm,
  paddingTop: theme.spacing(0.5),
  ...theme.typography.body2,
  fontWeight: theme.typography.fontWeightBold,
  color: theme.palette.text.primary
}))
const Meta = styled('span')(({ theme }) => ({
  ...theme.typography.caption,
  fontWeight: theme.typography.fontWeightRegular,
  color: theme.palette.text.tertiary
}))
const Body = styled('div')(({ theme }) => ({
  gridColumn: 2,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2),
  ...theme.typography.body1,
  lineHeight: lineHeight.read,
  overflowWrap: 'anywhere'
}))

/** Speakers use the same typography. Identity is a caller-supplied mark, never a role color. */
export function Message({ speaker, icon, meta, children }: {
  speaker: string
  icon: ReactNode
  meta?: ReactNode
  children: ReactNode
}): JSX.Element {
  return <Root>
    <Mark aria-hidden="true">{icon}</Mark>
    <Header>{speaker}{meta && <Meta>{meta}</Meta>}</Header>
    <Body>{children}</Body>
  </Root>
}

export const MessageActions = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: theme.spacing(1),
  marginTop: theme.spacing(1),
  minWidth: 0
}))

const Action = styled(Button)(({ theme }) => ({
  // Conversation actions sit on the reading axis, without a form button's inset or fill.
  paddingInline: 0,
  height: 'auto',
  minHeight: theme.density.control.sm,
  whiteSpace: 'normal',
  textAlign: 'start',
  justifyContent: 'flex-start',
  flexShrink: 1,
  color: theme.palette.text.primary,
  background: 'transparent',
  borderColor: 'transparent',
  [canHover]: { '&:hover': { background: 'transparent', color: theme.palette.text.primary, textDecoration: 'underline' } },
  '&:active': { background: 'transparent', color: theme.palette.text.primary },
  '&.Mui-focusVisible': focusRing(theme, 'inside'),
  '& .MuiButton-loadingIndicator': { left: 0 },
  '&.Mui-disabled': { background: 'transparent', borderColor: 'transparent' }
}))

/** A named conversation action; the host owns its operation and loading copy. */
export function MessageAction({ children, icon, loading = false, disabled, onClick }: {
  children: string
  icon?: ReactNode
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
}): JSX.Element {
  return <Action variant="ghost" color="neutral" size="sm" startIcon={icon} loading={loading}
    loadingPosition="start" disabled={disabled} onClick={onClick}>{children}</Action>
}

/** Status and its neighboring action share the conversation's supporting type scale. */
export const MessageStatus = styled('span')(({ theme }) => ({
  ...theme.typography.body2,
  color: theme.palette.text.secondary,
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  '& > svg': { flexShrink: 0 }
}))

/** A channel excerpt leaves full Markdown, tables and code to its opened conversation. */
export const MessageExcerpt = styled('p', { shouldForwardProp: blockProps('primary') })<{ primary?: boolean }>(({ theme, primary }) => ({
  margin: 0,
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 3,
  overflow: 'hidden',
  // Paragraph breaks must not consume the last excerpt line and leave only an ellipsis.
  whiteSpace: 'normal',
  color: primary ? theme.palette.text.primary : theme.palette.text.secondary
}))

const AttachmentRoot = styled('div')(({ theme }) => ({
  minWidth: 0,
  border: `1px solid ${theme.palette.border.subtle}`,
  borderRadius: theme.radius.sm,
  background: theme.palette.surface.default,
  overflow: 'hidden'
}))
const AttachmentSummary = styled('summary')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  padding: theme.spacing(2, 3),
  cursor: 'pointer',
  listStyle: 'none',
  '&::-webkit-details-marker': { display: 'none' },
  '&:focus-visible': focusRing(theme, 'inside'),
  [canHover]: { '&:hover': { background: theme.palette.surface.hover } },
  '&:active': { background: theme.palette.surface.selected }
}))
const AttachmentLabel = styled('span')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(0.5),
  minWidth: 0,
  flex: 1,
  ...theme.typography.body1,
  lineHeight: lineHeight.read,
  fontWeight: theme.typography.fontWeightMedium,
  overflowWrap: 'anywhere'
}))
const AttachmentCaret = styled('span')(({ theme }) => ({
  display: 'flex',
  flexShrink: 0,
  color: theme.palette.text.tertiary,
  'details[open] > summary > &': { transform: 'rotate(180deg)' }
}))
const AttachmentBody = styled('div')(({ theme }) => ({
  borderTop: `1px solid ${theme.palette.border.subtle}`,
  padding: theme.spacing(3),
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(3),
  minWidth: 0
}))

const AttachmentActions = styled('div')(({ theme }) => ({
  padding: theme.spacing(0, 3, 2),
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.spacing(3),
  minWidth: 0
}))

/** The summary remains the compact attachment; its supporting detail opens in place. */
export function MessageAttachment({ title, meta, caret, actions, children }: {
  title: string
  meta?: ReactNode
  caret: ReactNode
  actions?: ReactNode
  children: ReactNode
}): JSX.Element {
  return <AttachmentRoot>
    <details>
      <AttachmentSummary>
        <AttachmentLabel>{meta && <Meta>{meta}</Meta>}{title}</AttachmentLabel>
        <AttachmentCaret aria-hidden="true">{caret}</AttachmentCaret>
      </AttachmentSummary>
      <AttachmentBody>{children}</AttachmentBody>
    </details>
    {actions && <AttachmentActions>{actions}</AttachmentActions>}
  </AttachmentRoot>
}
