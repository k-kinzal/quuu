import { forwardRef, useMemo, type HTMLAttributes } from 'react'
import { alpha, styled, ThemeProvider, useTheme } from '@mui/material/styles'
import { headerBandHeight } from './Panel.js'
import { glassMaterial } from '../../theme/glass.js'

/**
 * Wraps adjacent ancillary sections as a single sheet of glass.
 * Children use surface="transparent" and never stack another film or blur.
 * The OS handles blurring what is outside the window; this container handles what is
 * behind it within the same page.
 */
const GlassPanelRoot = styled('aside')(({ theme }) => ({
  display: 'flex',
  flex: '0 0 auto',
  minHeight: 0,
  minWidth: 0,
  position: 'relative',
  background: `var(--ds-glass-panel-background, ${theme.palette.surface.glassPanel})`,
  backgroundImage: `var(--ds-glass-panel-image, ${glassMaterial(theme).backgroundImage})`,
  backdropFilter: `var(--ds-glass-panel-filter, ${glassMaterial(theme).backdropFilter})`,
  // The resizing line and its hit target must also stop below the shared header.
  '& > [role="separator"]': { marginTop: headerBandHeight(theme) },
  // The glowing edge is distinct from the internal dividers. It covers neither clicks nor scrolling.
  '&::before': {
    content: '""',
    position: 'absolute',
    top: headerBandHeight(theme),
    right: 0,
    bottom: 0,
    width: 12,
    background: `linear-gradient(to left, ${alpha('#000000', theme.palette.mode === 'dark' ? 0.14 : 0.05)}, transparent)`,
    borderRight: `1px solid ${alpha('#ffffff', theme.palette.mode === 'dark' ? 0.14 : 0.7)}`,
    pointerEvents: 'none'
  },
  // Folded thin, the window buttons overhang the main surface. So the outer edge is not drawn across the top band either.
  '&::after': {
    content: '""',
    position: 'absolute',
    top: headerBandHeight(theme),
    right: 0,
    bottom: 0,
    borderRight: `1px solid ${theme.palette.border.subtle}`,
    pointerEvents: 'none'
  },
  // A grabbable outer edge is drawn by the Resizer itself. Laying a rule over it wipes out the color it shows while being dragged.
  '&:has(> [role="separator"])::after': { display: 'none' },
  '@media (prefers-reduced-transparency: reduce)': {
    background: `var(--ds-glass-panel-background, ${theme.palette.surface.subtle})`,
    backdropFilter: 'none',
    '&::before': { display: 'none' }
  }
}))

export const GlassPanel = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(function GlassPanel(props, ref) {
  const theme = useTheme()
  // Thickening the film to rescue the text would kill the transparency, so only this surface's ink is strengthened.
  const glassTheme = useMemo(() => ({
    ...theme,
    palette: { ...theme.palette, text: { ...theme.palette.text, ...theme.palette.glassText } }
  }), [theme])
  return <ThemeProvider theme={glassTheme}><GlassPanelRoot data-motion-container="" {...props} ref={ref} /></ThemeProvider>
})

/** Splits the sections while keeping the top edge continuous. The interactive area also stays below the window buttons. */
const DividerRoot = styled('div')(({ theme }) => ({
  display: 'flex',
  flex: '0 0 1px',
  marginTop: headerBandHeight(theme),
  marginBottom: theme.spacing(2),
  background: theme.palette.border.subtle
}))

export function GlassPanelDivider(props: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <DividerRoot data-motion-divider="" {...props} />
}
