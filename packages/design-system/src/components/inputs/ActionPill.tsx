/** The current selection names the entrance to the action. The shape keeps the hit area from shrinking as the options grow. */
import { styled } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { Text } from '../data-display/Text.js'

const Root = styled('button')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing(0.5),
  minHeight: theme.density.control.xs,
  padding: `0 ${theme.spacing(2)}`,
  border: 0,
  borderRadius: theme.radius.full,
  background: theme.palette.surface.raised,
  color: theme.palette.primaryText,
  font: 'inherit',
  fontSize: theme.typography.body2.fontSize,
  cursor: 'pointer',
  '&:active': { background: theme.palette.surface.hover }
}))

export function ActionPill({
  label,
  onClick,
  indicator
}: {
  label: string
  indicator?: ReactNode
  onClick: () => void
}): JSX.Element {
  return (
    <Root type="button" onClick={onClick} aria-haspopup="dialog">
      <Text color="inherit" size="sm" weight="medium">
        {label}
      </Text>
      {indicator}
    </Root>
  )
}
