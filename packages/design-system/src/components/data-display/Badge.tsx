import { styled } from '@mui/material/styles'
import { alpha } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'

export { default as Chip } from '@mui/material/Chip'
export type { ChipProps } from '@mui/material/Chip'

/**
 * A small mark set beside a value. It says **only that this differs from the default**.
 * Mark the things that match the default too and the mark becomes background and loses
 * its meaning.
 */
export const Badge = styled('span', { shouldForwardProp: blockProps('tone') })<{
  tone?: 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger'
}>(({ theme, tone = 'neutral' }) => {
  const color =
    tone === 'accent'
      ? theme.palette.primaryText
      : tone === 'neutral'
        ? theme.palette.text.tertiary
        : theme.palette[tone === 'danger' ? 'error' : tone].main
  return {
    flex: '0 0 auto',
    padding: '1px 5px',
    borderRadius: theme.radius.sm,
    background: tone === 'neutral' ? theme.palette.surface.raised : alpha(color, 0.16),
    color,
    fontSize: 10,
    whiteSpace: 'nowrap'
  }
})

/** A tally. At 0 it is not made prominent (never assert that there is nothing). */
export const Counter = styled('span', { shouldForwardProp: blockProps('tone', 'zero') })<{
  tone?: 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger'
  /** Is the value 0? At 0 it recedes */
  zero?: boolean
}>(({ theme, tone = 'neutral', zero }) => ({
  minWidth: 16,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  fontWeight: zero ? 400 : 600,
  color: zero
    ? theme.palette.text.tertiary
    : tone === 'accent'
      ? theme.palette.primaryText
      : tone === 'neutral'
        ? 'inherit'
        : theme.palette[tone === 'danger' ? 'error' : tone].main
}))
