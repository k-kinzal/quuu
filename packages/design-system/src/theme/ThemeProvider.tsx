import { useEffect, useMemo, useState, type ReactNode } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import GlobalStyles from '@mui/material/GlobalStyles'
import {
  ThemeProvider as MuiThemeProvider,
  useTheme as useMuiTheme,
  type Theme
} from '@mui/material/styles'
import { createTheme } from './createTheme.js'
import { windowGlassFilter } from './glass.js'
import { StringsProvider, enStrings, type DsStrings } from './strings.js'
import type { ColorScheme, Density } from './tokens.js'

/** The choice that appears in settings. `system` follows the OS setting. */
export type ColorSchemePreference = ColorScheme | 'system'

function systemScheme(): ColorScheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/**
 * Color-scheme resolution. Under `system` it also tracks OS changes.
 *
 * Resolution is closed off in this one place, so apps never look at
 * `matchMedia` or paste `data-theme` themselves.
 */
export function useColorScheme(preference: ColorSchemePreference): ColorScheme {
  const [os, setOs] = useState<ColorScheme>(systemScheme)

  useEffect(() => {
    if (preference !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: light)')
    const sync = (): void => setOs(query.matches ? 'light' : 'dark')
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [preference])

  return preference === 'system' ? os : preference
}

export interface ThemeProviderProps {
  /** Color scheme. Defaults to `dark` */
  colorScheme?: ColorSchemePreference
  /**
   * Dimensional density. Defaults to `compact` (mouse-and-keyboard surfaces).
   * Surfaces touched by finger (iPhone) pass `comfortable`.
   *
   * **Decide once for the whole app.** Switch it per screen and the same part
   * comes out at different sizes depending on the surface
   */
  density?: Density
  /**
   * Theme assembly.
   *
   * The default is the design system's own, but the app may return a Theme
   * layered with its own tokens (domain colors and vocabulary). This is the
   * opening that keeps the app's vocabulary out of the design system.
   */
  buildTheme?: (scheme: ColorScheme, density: Density) => Theme
  /** Whether to include the bare-element reset. Turn off only when it's already applied elsewhere */
  baseline?: boolean
  /**
   * Don't paint the window's ground.
   *
   * Set for desktop apps that **let the OS blur (vibrancy) show through**.
   * With the ground painted, that color sits in front and no blur appears even
   * with see-through surfaces on top. Once set, surfaces paint their own ground
   * (wherever nothing paints, the desktop shows)
   */
  translucent?: boolean
  /**
   * The kit's own built-in copy (aria labels, tooltips). Defaults to English.
   * An app following a non-English OS locale passes a whole pack (e.g. `jaStrings`).
   */
  strings?: DsStrings
  children: ReactNode
}

/**
 * The design system's entrance.
 *
 * The bare-element reset, scrollbars, and focus rings all ride on
 * `CssBaseline`, so consumers keep no CSS file.
 */
export function ThemeProvider({
  colorScheme = 'dark',
  density = 'compact',
  buildTheme,
  baseline = true,
  translucent = false,
  strings = enStrings,
  children
}: ThemeProviderProps): JSX.Element {
  const scheme = useColorScheme(colorScheme)
  const theme = useMemo(
    () =>
      buildTheme ? buildTheme(scheme, density) : createTheme({ colorScheme: scheme, density }),
    [buildTheme, scheme, density]
  )

  // Native scrollbars and default input rendering follow the color scheme too
  useEffect(() => {
    document.documentElement.style.colorScheme = scheme
  }, [scheme])

  return (
    <MuiThemeProvider theme={theme}>
      <StringsProvider strings={strings}>
        {baseline && <CssBaseline />}
        {translucent && <GlobalStyles styles={{ body: { background: 'transparent', [windowGlassFilter]: 'none' } }} />}
        {children}
      </StringsProvider>
    </MuiThemeProvider>
  )
}

/**
 * Read the Theme directly.
 *
 * Only for values component props cannot express (passing colors as an array,
 * say). Reassembling spacing or colors from values read here amounts to
 * building a second convention outside the design system, so don't.
 */
export function useTheme(): Theme {
  return useMuiTheme()
}
