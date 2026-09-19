import type { ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'

export { default as Card } from '@mui/material/Card'
export { default as Dialog } from '@mui/material/Dialog'
export { default as DialogActions } from '@mui/material/DialogActions'
export { default as DialogContent } from '@mui/material/DialogContent'
export { default as DialogTitle } from '@mui/material/DialogTitle'

/**
 * A band that keeps the summary up and opens the contents only when needed.
 *
 * The summary is what carries the most value per unit of area, so the summary is always
 * visible and the detail stays folded.
 */
export const Disclosure = styled('div', { shouldForwardProp: blockProps('accent') })<{
  /** The color for an out-of-the-ordinary state. Drawn as a line at the left edge */
  accent?: string
}>(({ theme, accent }) => ({
  flex: '0 0 auto',
  borderBottom: `1px solid ${theme.palette.border.subtle}`,
  background: theme.palette.surface.raised,
  ...(accent ? { boxShadow: `inset 2px 0 0 ${accent}` } : {})
}))

/** The summary row. Unpressable when there is nothing to open (never open onto nothing). */
export const DisclosureSummary = styled('button')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(3),
  width: '100%',
  height: 30,
  padding: `0 ${theme.spacing(3)}`,
  border: 0,
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  '&:disabled': { cursor: 'default' },
  '&:not(:disabled):hover': { background: theme.palette.surface.hover }
}))

/** The opened contents. Their length is unknowable, so a ceiling is set and only that scrolls. */
export const DisclosureDetail = styled('div', { shouldForwardProp: blockProps('maxHeight') })<{
  maxHeight?: number
}>(({ theme, maxHeight = 220 }) => ({
  padding: `0 ${theme.spacing(3)} ${theme.spacing(2)}`,
  maxHeight,
  overflowY: 'auto'
}))

const Caret = styled('span', { shouldForwardProp: blockProps('open') })<{ open?: boolean }>(
  ({ theme, open }) => ({
    display: 'inline-block',
    width: 0,
    height: 0,
    borderLeft: '4px solid currentColor',
    borderTop: '3.5px solid transparent',
    borderBottom: '3.5px solid transparent',
    color: theme.palette.text.tertiary,
    transform: open ? 'rotate(90deg)' : 'none',
    transition: `transform ${theme.transitions.duration.shortest}ms ease-out`
  })
)

/** The triangle that shows which way it opens. Drawn as a shape rather than trusting a glyph font. */
export function DisclosureCaret({ open }: { open?: boolean }): JSX.Element {
  return <Caret open={open} aria-hidden />
}

/** One item of a tally. The conclusion (the number) comes first, the word after. */
export const SummaryStat = styled('span', { shouldForwardProp: blockProps('tone') })<{
  tone?: 'default' | 'muted' | 'danger'
}>(({ theme, tone = 'default' }) => {
  const color =
    tone === 'danger'
      ? theme.palette.error.main
      : tone === 'muted'
        ? theme.palette.text.tertiary
        : theme.palette.text.secondary
  return {
    ...theme.typography.body2,
    color,
    whiteSpace: 'nowrap',
    '& b': {
      fontVariantNumeric: 'tabular-nums',
      fontWeight: tone === 'default' ? 600 : 400,
      color: tone === 'default' ? theme.palette.text.primary : color,
      marginRight: 2
    }
  }
})

export interface CollapsibleTextProps {
  /** The number of lines to fold to. The full text escapes into `title` */
  lines: number
  title?: string
  children: ReactNode
}

const Clamped = styled('div', { shouldForwardProp: blockProps('lines') })<{ lines: number }>(
  ({ theme, lines }) => ({
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    overflow: 'hidden',
    ...theme.typography.body2,
    whiteSpace: 'pre-wrap',
    userSelect: 'text'
  })
)

/**
 * Fold a read-only section down to a few lines.
 *
 * Bolting a scroll of its own onto something of unknowable length makes "which part do
 * I move to read this" unanswerable within the surface. If it is only to be read, fold
 * it.
 */
export function CollapsibleText({ lines, title, children }: CollapsibleTextProps): JSX.Element {
  return (
    <Clamped lines={lines} title={title}>
      {children}
    </Clamped>
  )
}
