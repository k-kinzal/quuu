import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import type { TextTone } from '../data-display/Text.js'

/**
 * A text-only button.
 *
 * Placed next to a value to say "you can change / open it here". It has no frame and no
 * background, so it does not thin out the density of a surface full of attributes (a
 * surface with a high amount of information per row).
 */
export const LinkButton = styled('button', {
  shouldForwardProp: blockProps('tone', 'mono', 'size')
})<{
  tone?: Extract<TextTone, 'primary' | 'secondary' | 'tertiary' | 'accent' | 'warning' | 'danger'>
  mono?: boolean
  size?: 'xs' | 'sm'
}>(({ theme, tone = 'secondary', mono, size = 'xs' }) => {
  const color =
    tone === 'accent'
      ? theme.palette.primaryText
      : tone === 'warning'
        ? theme.palette.warning.main
        : tone === 'danger'
          ? theme.palette.error.main
          : tone === 'tertiary'
            ? theme.palette.text.tertiary
            : tone === 'primary'
              ? theme.palette.text.primary
              : theme.palette.text.secondary
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    minWidth: 0,
    border: 0,
    background: 'transparent',
    padding: 0,
    font: 'inherit',
    fontFamily: mono ? theme.typography.fontFamilyMono : 'inherit',
    fontSize: size === 'sm' ? theme.typography.body2.fontSize : theme.typography.caption.fontSize,
    color,
    cursor: 'pointer',
    '&:hover': { color: theme.palette.primaryText },
    '&:disabled': { cursor: 'default', opacity: 0.5, '&:hover': { color } }
  }
})
