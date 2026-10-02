import type { CSSObject, Theme } from '@mui/material/styles'
import { canHover } from './styled.js'

/** A size is a complete recipe, never a height chosen independently of its text. */
export function controlMetrics(theme: Theme, size: 'xs' | 'sm' | 'md'): CSSObject {
  return {
    boxSizing: 'border-box',
    height: theme.density.control[size],
    ...theme.typography[size === 'xs' ? 'caption' : 'body2'],
    fontFamily: theme.typography.fontFamily,
    borderRadius: theme.radius.sm,
    padding: `0 ${theme.spacing(size === 'xs' ? 2 : 3)}`
  }
}

/** Inset rings belong to clipped rows; standalone controls have room outside. */
export function focusRing(
  theme: { palette: { primaryText: string } },
  placement: 'outside' | 'inside' = 'outside'
): CSSObject {
  return {
    outline: `2px solid ${theme.palette.primaryText}`,
    outlineOffset: placement === 'inside' ? -2 : 1
  }
}

/** Search, selection and form entry share the same frame and state precedence. */
export function controlFrame(theme: Theme): CSSObject {
  const enabled = ':not(:disabled):not(.Mui-disabled):not([data-disabled="true"])'
  return {
    border: `1px solid ${theme.palette.border.strong}`,
    background: theme.palette.surface.raised,
    color: theme.palette.text.primary,
    outline: 'none',
    transition: theme.transitions.create(['background-color', 'border-color'], {
      duration: theme.transitions.duration.shortest
    }),
    [canHover]: { [`&${enabled}:hover`]: { borderColor: theme.palette.text.tertiary, background: theme.palette.surface.hover } },
    [`&${enabled}:focus-within, &${enabled}.Mui-focused, &${enabled}[aria-expanded="true"]`]: {
      ...focusRing(theme),
      borderColor: theme.palette.primaryText
    },
    [`&${enabled}.Mui-error, &${enabled}.Mui-error:focus-within, &${enabled}.Mui-error.Mui-focused`]: { borderColor: theme.palette.error.main },
    '&:disabled, &.Mui-disabled, &[data-disabled="true"]': {
      opacity: theme.palette.action.disabledOpacity,
      cursor: 'default',
      outline: 'none'
    }
  }
}
