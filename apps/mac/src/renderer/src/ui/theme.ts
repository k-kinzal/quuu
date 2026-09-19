import { createTheme, type ColorScheme, type Density } from '@design-system/react'
import type { Theme } from '@mui/material/styles'
import type { Priority, TaskStatus } from '../../../preload/api/tasks.js'

/** The colors the View uses to show status. The values originate as Design System tokens. */
declare module '@mui/material/styles' {
  interface Palette {
    quuu: {
      status: Record<TaskStatus, string>
      /** The index is the priority itself */
      priority: readonly [string, string, string, string]
    }
  }
  interface PaletteOptions {
    quuu?: Palette['quuu']
  }
}

/**
 * Build a Theme from a color scheme and a density.
 * Passed to `ThemeProvider`'s `buildTheme` to layer on top of the design system.
 *
 * Color assignment doesn't vary with density. Drawing dimensions are left to the Design System.
 */
export function buildTheme(colorScheme: ColorScheme, density: Density = 'compact'): Theme {
  // Build a bare Theme once, to pull the named colors out of it
  const base = createTheme({ colorScheme })
  const { accents, text } = base.palette

  return createTheme(
    { colorScheme, density },
    {
      palette: {
        quuu: {
          status: {
            draft: text.tertiary,
            held: accents.violet,
            queued: accents.slate,
            running: accents.blue,
            review: accents.amber,
            failed: accents.red,
            done: accents.green
          },
          priority: [accents.red, accents.amber, text.tertiary, text.tertiary]
        }
      }
    }
  )
}

/** Priority colors. P2 / P3 are the defaults, so they get no color (never draw the default). */
export function priorityColor(theme: Theme, level: Priority): string | undefined {
  return level <= 1 ? theme.palette.quuu.priority[level] : undefined
}
