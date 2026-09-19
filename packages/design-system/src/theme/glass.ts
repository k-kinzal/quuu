import { alpha, type Theme } from '@mui/material/styles'

/**
 * Set to `none` by the theme of a translucent window.
 *
 * The material's blur handles what lies behind it within the page. A translucent window
 * leaves its ground unpainted for the OS to blur, so inside the page there is nothing
 * behind the window's glass; the blur would only re-blur that empty ground, and it does
 * so as a full-window pass on every frame the window draws.
 */
export const windowGlassFilter = '--ds-window-glass-filter'

/** One film and one highlight must cover connected glass regions without restarting at pane boundaries. */
export function glassMaterial(theme: Theme) {
  return {
    background: theme.palette.surface.glassPanel,
    backgroundImage: `linear-gradient(155deg, ${alpha('#ffffff', theme.palette.mode === 'dark' ? 0.09 : 0.6)}, transparent 46%, ${alpha(theme.palette.surface.canvas, 0.12)})`,
    backdropFilter: `var(${windowGlassFilter}, blur(40px) saturate(160%))`,
    '@media (prefers-reduced-transparency: reduce)': {
      background: theme.palette.surface.subtle,
      backdropFilter: 'none'
    }
  }
}
