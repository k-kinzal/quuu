import type { ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import Button from '@mui/material/Button'
import { Text } from '../data-display/Text.js'
import { useStrings } from '../../theme/strings.js'
import { LoadingDots } from './LoadingDots.js'

export { default as Skeleton } from '@mui/material/Skeleton'
export type { SkeletonProps } from '@mui/material/Skeleton'

const Root = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: theme.spacing(2),
  height: '100%',
  minHeight: 200,
  padding: `${theme.spacing(6)} ${theme.spacing(4)}`,
  textAlign: 'center',
  color: theme.palette.text.tertiary,
  ...theme.typography.body2,
  lineHeight: theme.typography.body1.lineHeight
}))

/**
 * The surface with nothing on it.
 *
 * **It has no field for an explanation.** Provide somewhere to write "here is how you
 * fill this", and the empty surface fills up with that prose. If there is a next move,
 * give `action`; if not, leave it empty (the boundary alone already says "nothing yet").
 */
export interface EmptyStateProps {
  title: string
  /** The next move. Placed as something pressable instead of explained in prose */
  action?: { label: string; onClick(): void }
  children?: ReactNode
}

export function EmptyState({ title, action, children }: EmptyStateProps): JSX.Element {
  return (
    <Root>
      <Text tone="secondary">{title}</Text>
      {action && (
        <Button size="xs" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
      {children}
    </Root>
  )
}

const SpinnerRoot = styled('span')({ display: 'inline-flex', alignItems: 'center', gap: 6 })

export interface SpinnerProps {
  /** The diameter. Omitted, it follows the density */
  size?: number
  label?: string
}

/**
 * In progress. Used for things whose end cannot be read; not for things with a known
 * progress.
 *
 * The density sets the size so the dots remain distinct on touch surfaces too.
 */
export function Spinner({ size, label }: SpinnerProps): JSX.Element {
  const strings = useStrings()
  return (
    <SpinnerRoot role="status" aria-label={label ?? strings.spinner.label}>
      <LoadingDots size={size} />
      {label && (
        <Text size="sm" tone="tertiary">
          {label}
        </Text>
      )}
    </SpinnerRoot>
  )
}
