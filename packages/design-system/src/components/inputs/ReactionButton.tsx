import type { ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import { IconButton, type IconButtonProps } from './Button.js'

const Control = styled(IconButton)(({ theme }) => ({
  border: `1px solid ${theme.palette.border.subtle}`,
  color: theme.palette.text.secondary,
  '&[aria-pressed="true"]': {
    background: theme.palette.surface.selected,
    borderColor: theme.palette.primaryText,
    color: theme.palette.primaryText
  }
}))

/** A reaction is a named, pressed control. Selected and loading states never change its geometry. */
export function ReactionButton({ selected = false, icon, ...props }: Omit<IconButtonProps, 'aria-pressed' | 'size' | 'icon'> & {
  selected?: boolean
  icon: ReactNode
}): JSX.Element {
  return <Control {...props} icon={icon} size="xs" aria-pressed={selected} />
}
