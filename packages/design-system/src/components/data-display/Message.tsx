import type { ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import { blockProps, canHover } from '../../theme/styled.js'
import { focusRing } from '../../theme/controls.js'
import { lineHeight } from '../../theme/tokens.js'

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

/** A channel excerpt leaves full Markdown, tables and code to its opened conversation. */
export const MessageExcerpt = styled('p', { shouldForwardProp: blockProps('primary') })<{ primary?: boolean }>(({ theme, primary }) => ({
  margin: 0,
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 3,
  overflow: 'hidden',
  whiteSpace: 'pre-line',
  color: primary ? theme.palette.text.primary : theme.palette.text.secondary
}))

const AttachmentRoot = styled('details')(({ theme }) => ({
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
  ...theme.typography.body2,
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

/** The summary remains the compact attachment; its supporting detail opens in place. */
export function MessageAttachment({ title, meta, caret, children }: {
  title: string
  meta?: ReactNode
  caret: ReactNode
  children: ReactNode
}): JSX.Element {
  return <AttachmentRoot>
    <AttachmentSummary>
      <AttachmentLabel>{meta && <Meta>{meta}</Meta>}{title}</AttachmentLabel>
      <AttachmentCaret aria-hidden="true">{caret}</AttachmentCaret>
    </AttachmentSummary>
    <AttachmentBody>{children}</AttachmentBody>
  </AttachmentRoot>
}
