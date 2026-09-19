import type { ReactNode } from 'react'
import { styled, type Theme } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'

const itemShape = ({
  theme,
  action,
  accent
}: {
  theme: Theme
  action?: boolean
  accent?: string
}): Record<string, unknown> => ({
  display: 'flex',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  alignItems: 'center',
  gap: theme.spacing(2),
  height: 20,
  border: 0,
  background: 'transparent',
  padding: `0 ${theme.spacing(1)}`,
  borderRadius: theme.radius.sm,
  ...theme.typography.caption,
  color: accent ?? 'inherit',
  ...(action ? { cursor: 'pointer', '&:hover': { background: theme.palette.surface.hover } } : {})
})

const itemProps = blockProps('action', 'accent')

const ItemStatic = styled('span', { shouldForwardProp: itemProps })<{
  action?: boolean
  accent?: string
}>(itemShape)

const ItemButton = styled('button', { shouldForwardProp: itemProps })<{
  action?: boolean
  accent?: string
}>(itemShape)

export interface StatusBarItemProps {
  title?: string
  /** Pass this and the section becomes pressable. What it opens is a surface showing the contents behind that number */
  onClick?(): void
  /** The color that marks the setting currently in effect */
  accent?: string
  children: ReactNode
}

/**
 * One section of the band along the bottom.
 *
 * It is not a surface for reading but one for "noticing a change", so the numbers are
 * monospaced and fixed-width and do not move as the digit count changes.
 */
export function StatusBarItem({
  title,
  onClick,
  accent,
  children
}: StatusBarItemProps): JSX.Element {
  return onClick ? (
    <ItemButton type="button" action accent={accent} title={title} onClick={onClick}>
      {children}
    </ItemButton>
  ) : (
    <ItemStatic accent={accent} title={title}>
      {children}
    </ItemStatic>
  )
}

/** The pill button at the right end of the band, for switching state. */
export const PillButton = styled('button')(({ theme }) => ({
  display: 'flex',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  alignItems: 'center',
  gap: 5,
  height: 20,
  border: `1px solid ${theme.palette.border.subtle}`,
  borderRadius: theme.radius.full,
  padding: '0 9px',
  background: 'transparent',
  color: theme.palette.text.secondary,
  ...theme.typography.caption,
  cursor: 'pointer',
  '&:hover': {
    borderColor: theme.palette.border.strong,
    color: theme.palette.text.primary
  }
}))

/** The readouts stay walkable without wrapping even when the main surface is narrow. Controls that switch state go outside it. */
export const StatusBarOverflow = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  flex: '1 1 0',
  minWidth: 0,
  gap: theme.spacing(4),
  overflowX: 'auto',
  scrollbarWidth: 'none'
}))

/** The warning shown on the band. When things are fine, not one is shown. */
export const StatusBarNotice = styled('span', { shouldForwardProp: blockProps('tone') })<{
  tone?: 'warning' | 'danger'
}>(({ theme, tone = 'warning' }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  color: tone === 'danger' ? theme.palette.error.main : theme.palette.warning.main,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  maxWidth: '44%'
}))
