import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'

export type ProgressTone = 'neutral' | 'success' | 'warning' | 'danger'

const Root = styled('span')(({ theme }) => ({
  display: 'block',
  width: '100%',
  height: theme.spacing(1),
  overflow: 'hidden',
  borderRadius: theme.radius.full,
  background: theme.palette.border.subtle
}))

const Fill = styled('span', { shouldForwardProp: blockProps('value', 'tone') })<{
  value: number
  tone: ProgressTone
}>(({ theme, value, tone }) => ({
  display: 'block',
  width: `${String(Math.max(0, Math.min(100, value)))}%`,
  height: '100%',
  borderRadius: 'inherit',
  background:
    tone === 'success'
      ? theme.palette.success.main
      : tone === 'warning'
        ? theme.palette.warning.main
        : tone === 'danger'
          ? theme.palette.error.main
          : theme.palette.primaryText
}))

export interface ProgressBarProps {
  value: number
  tone?: ProgressTone
  label: string
}

/** A progress meter that leaves the exact value to screen readers and lets the surface be compared by length. */
export function ProgressBar({ value, tone = 'neutral', label }: ProgressBarProps): JSX.Element {
  return (
    <Root role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      <Fill value={value} tone={tone} />
    </Root>
  )
}
