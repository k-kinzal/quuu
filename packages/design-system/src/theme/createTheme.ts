import {
  alpha,
  createTheme as createMuiTheme,
  emphasize,
  getContrastRatio,
  type Theme,
  type ThemeOptions
} from '@mui/material/styles'
import {
  duration,
  fontFamily,
  fontWeight,
  letterSpacing,
  lineHeight,
  measure,
  palettes,
  scales,
  syntaxTokens,
  type AccentTokens,
  type BorderTokens,
  type ColorScheme,
  type Density,
  type Palette as PaletteTokens,
  type Scale,
  type SurfaceTokens,
  type SyntaxTokens
} from './tokens.js'
import { canHover } from './styled.js'

/* -------------------------------------------------------------------------
 * Extensions to the MUI Theme
 *
 * Whatever MUI already has (palette.primary / spacing / shape / transitions /
 * typography) goes there; only **concepts MUI lacks** are added.
 * Carving out our own namespace and putting everything in it would duplicate
 * the values MUI components read, and break the moment a plain MUI component
 * is mixed in.
 * ----------------------------------------------------------------------- */

declare module '@mui/material/styles' {
  interface Palette {
    /** Surface hierarchy (`canvas` = the content's paper, `raised` = floating surfaces) */
    surface: SurfaceTokens
    border: BorderTokens
    glassText: PaletteTokens['glassText']
    /** Named colors. Raw material for the app to assign to its domain */
    accents: AccentTokens
    /** Syntax colors. The named colors assigned to "telling code apart" */
    syntax: SyntaxTokens
    /**
     * The primary color placed on a surface as **text or glyphs**.
     * `primary.main` is for fills; used directly as text it sinks into the ground
     */
    primaryText: string
    /** Shadow for floating layers. Not for depth between side-by-side surfaces */
    elevation: { raised: string; overlay: string }
  }
  interface PaletteOptions {
    surface?: SurfaceTokens
    border?: BorderTokens
    glassText?: PaletteTokens['glassText']
    accents?: AccentTokens
    syntax?: SyntaxTokens
    primaryText?: string
    elevation?: { raised: string; overlay: string }
  }
  interface TypeText {
    /** Text one step further back than `secondary` (meta, support) */
    tertiary: string
    /** Text placed on a filled surface */
    inverse: string
  }
  interface TypeTextOptions {
    tertiary?: string
    inverse?: string
  }

  interface Theme {
    /** Hit area for glyph-only buttons */
    iconButton: Scale['iconButton']
    /** Edge length of the status mark */
    markSize: number
    /** Radius steps. `shape.borderRadius` equals the default (md) */
    radius: Scale['radius']
    /** Row and control heights */
    density: Scale['density']
    /** Icon sizes (3 steps) */
    iconSize: Scale['iconSize']
    /**
     * Which density this Theme was built with.
     *
     * **Screens must not branch on this.** Write the step name
     * (`density.control.sm`) and the actual size follows. Read this only for
     * things that can only be decided by density (momentum-scroll conventions
     * and the like)
     */
    densityMode: Density
    /** Maximum measure for body text */
    measure: string
  }
  interface ThemeOptions {
    iconButton?: Scale['iconButton']
    markSize?: number
    radius?: Scale['radius']
    density?: Scale['density']
    iconSize?: Scale['iconSize']
    densityMode?: Density
    measure?: string
  }

  interface TypographyVariants {
    /** Monospaced face. For paths, commands, identifiers */
    fontFamilyMono: string
  }
  interface TypographyVariantsOptions {
    fontFamilyMono?: string
  }
}

declare module '@mui/material/Button' {
  interface ButtonPropsVariantOverrides {
    /** Default. Has a ground */
    solid: true
    /** Frame only */
    outline: true
    /** Neither frame nor ground */
    ghost: true
  }
  interface ButtonPropsColorOverrides {
    /** The default press feel, carrying no color */
    neutral: true
  }
  interface ButtonPropsSizeOverrides {
    xs: true
    sm: true
    md: true
  }
}

declare module '@mui/material/IconButton' {
  interface IconButtonPropsSizeOverrides {
    xs: true
    sm: true
    md: true
  }
  interface IconButtonPropsColorOverrides {
    neutral: true
  }
}

declare module '@mui/material/Chip' {
  interface ChipPropsVariantOverrides {
    /** Ground-only read-only pill */
    flat: true
    /** Framed pill. Also used for pressable ones */
    outline: true
  }
}

/* ---------------------------------------------------------------- factory */

export interface CreateThemeOptions extends Omit<ThemeOptions, 'density'> {
  /** Color scheme. Defaults to `dark` */
  colorScheme?: ColorScheme
  /**
   * Dimensional density. Defaults to `compact` (mouse-and-keyboard surfaces).
   * Surfaces touched by finger pass `comfortable`.
   */
  density?: Density
}

/**
 * Build the design system's Theme.
 *
 * What returns is a plain MUI `Theme`, so the app can **layer on top** —
 * `createTheme({ colorScheme }, { palette: { … } })` — to add its own domain
 * colors and vocabulary. Do not preempt the app's vocabulary here.
 */
export function createTheme(options: CreateThemeOptions = {}, ...args: object[]): Theme {
  const { colorScheme = 'dark', density = 'compact', ...rest } = options
  return createMuiTheme(base(colorScheme, palettes[colorScheme], density), rest, ...args)
}

/** The MUI color names that carry colored variants. */
const TONES = ['primary', 'secondary', 'success', 'warning', 'error', 'info'] as const

function toneValues(t: PaletteTokens): Record<(typeof TONES)[number], string> {
  return {
    primary: t.primary,
    secondary: t.accents.violet,
    success: t.accents.green,
    warning: t.accents.amber,
    error: t.accents.red,
    info: t.accents.blue
  }
}

function base(mode: ColorScheme, t: PaletteTokens, densityMode: Density): ThemeOptions {
  const { surface, border, text, accents } = t
  const { fontSize, density, iconSize, iconButton, markSize, radius, spacingUnit } =
    scales[densityMode]

  return {
    radius,
    density,
    iconSize,
    iconButton,
    markSize,
    densityMode,
    measure,
    spacing: spacingUnit,
    shape: { borderRadius: radius.md },
    transitions: {
      duration: { shortest: duration.fast, shorter: duration.fast, short: duration.base }
    },

    palette: {
      mode,
      surface,
      border,
      glassText: t.glassText,
      accents,
      syntax: syntaxTokens(t),
      primaryText: t.primaryText,
      elevation: { raised: t.shadow, overlay: t.shadowStrong },
      primary: {
        main: t.primary,
        light: t.primaryText,
        dark: t.primaryHover,
        contrastText: t.primaryContrast
      },
      secondary: { main: accents.violet },
      error: { main: accents.red },
      warning: { main: accents.amber },
      info: { main: accents.blue },
      success: { main: accents.green },
      background: { default: surface.canvas, paper: surface.raised },
      text: {
        primary: text.primary,
        secondary: text.secondary,
        tertiary: text.tertiary,
        inverse: text.inverse,
        disabled: text.tertiary
      },
      divider: border.subtle,
      action: { hover: surface.hover, selected: surface.selected, disabledOpacity: 0.4 }
    },

    typography: {
      fontFamily: fontFamily.ui,
      fontFamilyMono: fontFamily.mono,
      fontSize: fontSize.md,
      htmlFontSize: 16,
      button: {
        textTransform: 'none',
        fontWeight: fontWeight.medium,
        letterSpacing: letterSpacing.wide
      },
      /*
       * Map the 5 steps of the type scale onto MUI's variants (no new variants).
       * Letter spacing changes per step — smaller spreads, larger tightens.
       * The steps sit close at 11–17px, so equalizing letter spacing too would
       * erase the difference.
       */
      caption: {
        fontSize: fontSize.xs,
        lineHeight: lineHeight.base,
        letterSpacing: letterSpacing.wide
      },
      body2: {
        fontSize: fontSize.sm,
        lineHeight: lineHeight.base,
        letterSpacing: letterSpacing.wide
      },
      body1: {
        fontSize: fontSize.md,
        lineHeight: lineHeight.base,
        letterSpacing: letterSpacing.normal
      },
      subtitle1: {
        fontSize: fontSize.lg,
        lineHeight: lineHeight.tight,
        letterSpacing: letterSpacing.tight
      },
      subtitle2: {
        fontSize: fontSize.lg,
        lineHeight: lineHeight.tight,
        fontWeight: fontWeight.bold,
        letterSpacing: letterSpacing.tight
      },
      h6: {
        fontSize: fontSize.xl,
        lineHeight: lineHeight.tight,
        fontWeight: fontWeight.bold,
        letterSpacing: letterSpacing.tighter
      }
    },

    components: components(mode, t, densityMode)
  }
}

/* ------------------------------------------------------------- components */

function components(
  mode: ColorScheme,
  t: PaletteTokens,
  densityMode: Density
): ThemeOptions['components'] {
  const { fontSize, density, iconButton, radius } = scales[densityMode]
  const { surface, border, text } = t
  const tone = toneValues(t)

  return {
    /* Bare elements and scrollbars. Consolidated here instead of keeping a CSS file */
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': { boxSizing: 'border-box' },
        'html, body, #root': { height: '100%', margin: 0 },
        body: {
          fontFamily: fontFamily.ui,
          fontSize: fontSize.md,
          lineHeight: lineHeight.base,
          color: text.primary,
          background: surface.canvas,
          WebkitFontSmoothing: 'antialiased',
          /*
           * Make digits tabular. Counts, clocks, and durations rewrite every
           * second on this screen; left proportional, the layout jitters
           * sideways whenever a digit count changes. The jitter reads as a
           * false "something changed" signal. Only reading surfaces revert it
           * via `Paragraph`
           */
          fontVariantNumeric: 'tabular-nums'
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': { animationDuration: '0.01ms !important', animationIterationCount: '1 !important', transitionDuration: '0.01ms !important', scrollBehavior: 'auto !important' }
        },
        'button, input, textarea, select': { font: 'inherit', color: 'inherit' },
        /*
         * Even inside a window-drag strip (`draggable`), pressable things stay
         * pressable.
         *
         * If the strip is the one punching holes, every addition to the strip
         * risks a forgotten wrapper. **Having the pressable thing itself say
         * "this is not a grab spot"** misses nothing
         */
        'button, input, textarea, select, a, [role="separator"]': { WebkitAppRegion: 'no-drag' },
        /*
         * Input fields are always selectable.
         *
         * Lists and headers set `user-select: none` on the whole surface, which
         * would drag the inputs placed inside down with them (Chromium inherits
         * it into inputs too). Keep the exception in this one place so the
         * surfaces can plainly write none
         */
        'input, textarea': { userSelect: 'text' },
        // Use a value that doesn't sink into the surface. The fill primary loses its outline on dark surfaces
        ':focus-visible': { outline: `2px solid ${t.primaryText}`, outlineOffset: 1 },
        /*
         * Where the surface itself is a keyboard control (lists, conversation).
         *
         * On a surface whose rows move with the arrow keys, if **the surface
         * holding the hand** can't be read, it looks like "pressing does
         * nothing". Draw the outline inward. Pushed outward it overlaps the
         * neighboring surface and blends with the boundary line
         */
        '[data-keyboard-region]': { outline: 'none' },
        '[data-keyboard-region]:focus-visible': {
          outline: `2px solid ${t.primaryText}`,
          outlineOffset: -2
        },
        '::-webkit-scrollbar': { width: 11, height: 11 },
        '::-webkit-scrollbar-thumb': {
          background: border.strong,
          borderRadius: radius.full,
          border: '3px solid transparent',
          backgroundClip: 'content-box'
        },
        '::-webkit-scrollbar-thumb:hover': {
          background: text.tertiary,
          backgroundClip: 'content-box',
          border: '3px solid transparent'
        },
        '::-webkit-scrollbar-track': { background: 'transparent' }
      }
    },

    // A dense screen needs no ripples. Show only the result of the press
    MuiButtonBase: { defaultProps: { disableRipple: true } },

    MuiButton: {
      defaultProps: { variant: 'solid', color: 'neutral', size: 'sm', disableElevation: true },
      styleOverrides: {
        root: {
          minWidth: 0,
          boxSizing: 'border-box',
          gap: 5,
          flexShrink: 0,
          lineHeight: 1,
          border: '1px solid transparent',
          borderRadius: radius.md,
          fontSize: fontSize.sm,
          fontWeight: fontWeight.medium,
          whiteSpace: 'nowrap',
          transition: `background ${duration.fast}ms ease-out, border-color ${duration.fast}ms ease-out`,
          '& > svg, & .MuiButton-startIcon > svg': { display: 'block', flexShrink: 0 },
          '&.Mui-focusVisible': { outline: `2px solid ${t.primaryText}`, outlineOffset: 2 },
          '&.Mui-disabled': { opacity: 0.4, color: text.secondary, background: surface.subtle, borderColor: border.subtle },
          // While loading, don't inherit the disabled state's fade. Also keeps the label off the centered spinner.
          '&.MuiButton-loading': { opacity: 1, '& .MuiButton-loadingIndicator': { color: text.primary } },
          '&.MuiButton-loading.MuiButton-loadingPositionCenter': { color: 'transparent' }
        },
        startIcon: { margin: 0, '& > *:nth-of-type(1)': { fontSize: 'inherit' } },
        endIcon: { margin: 0 }
      },
      variants: [
        {
          props: { size: 'xs' },
          style: {
            height: density.control.xs,
            padding: '0 8px',
            fontSize: fontSize.xs,
            borderRadius: radius.sm
          }
        },
        { props: { size: 'sm' }, style: { height: density.control.sm, padding: '0 12px' } },
        { props: { size: 'md' }, style: { height: density.control.md, padding: '0 14px' } },

        // Neutral is "a surface with a ground". Colored ones get filled
        {
          props: { variant: 'solid', color: 'neutral' },
          style: {
            borderColor: border.strong,
            background: surface.raised,
            color: text.primary,
            [canHover]: { '&:hover': { background: surface.hover } },
            '&:active': { background: surface.hover }
          }
        },
        {
          props: { variant: 'outline', color: 'neutral' },
          style: {
            borderColor: border.strong,
            color: text.primary,
            [canHover]: { '&:hover': { background: surface.hover } },
            '&:active': { background: surface.hover }
          }
        },
        {
          props: { variant: 'ghost', color: 'neutral' },
          style: {
            color: text.secondary,
            [canHover]: { '&:hover': { background: surface.hover, color: text.primary } },
            '&:active': { background: surface.hover, color: text.primary }
          }
        },

        ...TONES.flatMap((color) => [
          {
            props: { variant: 'solid' as const, color },
            style: {
              borderColor: tone[color],
              background: tone[color],
              color: ink(tone[color]),
              /*
               * Don't brighten hover with `brightness()`.
               * The filter lifts chroma along with it, so the color before and
               * after the press become different things. Move only lightness,
               * one step
               */
              '&:hover': { background: emphasize(tone[color], 0.12) }
            }
          },
          {
            props: { variant: 'outline' as const, color },
            style: {
              borderColor: alpha(tone[color], 0.55),
              color: tone[color],
              '&:hover': { background: alpha(tone[color], 0.12) }
            }
          },
          {
            props: { variant: 'ghost' as const, color },
            style: {
              color: tone[color],
              '&:hover': { background: alpha(tone[color], 0.14) }
            }
          }
        ])
      ]
    },

    MuiIconButton: {
      defaultProps: { size: 'sm', color: 'neutral' },
      styleOverrides: {
        root: {
          padding: 0,
          borderRadius: radius.md,
          color: text.secondary,
          transition: `background ${duration.fast}ms ease-out, color ${duration.fast}ms ease-out`,
          '& > svg': { display: 'block', flexShrink: 0 },
          '&.Mui-focusVisible': { outline: `2px solid ${t.primaryText}`, outlineOffset: -2 },
          [canHover]: { '&:hover': { background: surface.hover, color: text.primary } },
          '&:active': { background: surface.hover, color: text.primary },
          '&.Mui-disabled': { opacity: 0.35 },
          // A busy control is disabled for input, but its progress must stay readable.
          '&.MuiIconButton-loading': { opacity: 1, '& .MuiIconButton-loadingIndicator': { color: text.secondary } }
        }
      },
      variants: [
        {
          props: { size: 'xs' },
          style: {
            width: iconButton.xs,
            height: iconButton.xs,
            flex: `0 0 ${iconButton.xs}px`,
            borderRadius: radius.sm,
            color: text.secondary
          }
        },
        {
          props: { size: 'sm' },
          style: { width: iconButton.sm, height: iconButton.sm, flex: `0 0 ${iconButton.sm}px` }
        },
        {
          props: { size: 'md' },
          style: { width: iconButton.md, height: iconButton.md, flex: `0 0 ${iconButton.md}px` }
        },
        ...TONES.map((color) => ({
          props: { color },
          style: {
            '&:hover': { background: alpha(tone[color], 0.16), color: tone[color] }
          }
        }))
      ]
    },

    MuiInputBase: {
      styleOverrides: {
        root: { fontSize: fontSize.sm, color: text.primary },
        input: { padding: 0, height: '100%', '&::placeholder': { color: text.tertiary, opacity: 1 } }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          height: density.control.md,
          padding: '0 8px',
          // Inputs are the innermost nesting level, so go 1 step below the container (radius.md)
          borderRadius: radius.sm,
          background: surface.raised,
          transition: `box-shadow ${duration.fast}ms ease-out`,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: border.strong },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: text.tertiary },
          '&.Mui-focused': {
            // Don't thicken the rule; put a thin ring outside. Row height stays put
            boxShadow: `0 0 0 3px ${t.primaryMuted}`
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: t.primary,
            borderWidth: 1
          },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: tone.error },
          '&.MuiInputBase-multiline': { height: 'auto', padding: '5px 8px' }
        },
        input: { padding: 0 }
      }
    },
    MuiSelect: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        select: { display: 'flex', alignItems: 'center', minHeight: 0 },
        icon: { right: 6, color: text.tertiary, fontSize: 18 }
      }
    },
    MuiCheckbox: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: {
          padding: 0,
          marginTop: 1,
          color: border.strong,
          '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: t.primary },
          '& .MuiSvgIcon-root': { fontSize: 16 }
        }
      }
    },
    MuiRadio: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: {
          padding: 0,
          marginTop: 1,
          color: border.strong,
          '&.Mui-checked': { color: t.primary },
          '& .MuiSvgIcon-root': { fontSize: 16 }
        }
      }
    },
    MuiSwitch: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: { width: 30, height: 18, padding: 0, marginTop: 1 },
        switchBase: {
          padding: 2,
          '&.Mui-checked': { transform: 'translateX(12px)', color: '#fff' },
          '&.Mui-checked + .MuiSwitch-track': { background: t.primary, opacity: 1 }
        },
        thumb: { width: 14, height: 14, boxShadow: 'none' },
        track: { borderRadius: radius.full, background: border.strong, opacity: 1 }
      }
    },
    MuiFormControlLabel: {
      styleOverrides: {
        // With the default inline-flex, two placed in sequence end up side by side
        root: { display: 'flex', margin: 0, gap: 8, alignItems: 'flex-start' },
        label: { fontSize: fontSize.sm, lineHeight: lineHeight.base }
      }
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none', backgroundColor: surface.raised, color: text.primary }
      }
    },
    /*
     * Floating layers are made with rule + shadow, the pair. Side-by-side
     * surfaces are made with `surface` lightness differences alone.
     * Use both on both kinds and the techniques mix per surface and look cheap
     */
    MuiPopover: {
      styleOverrides: {
        paper: {
          minWidth: 200,
          maxWidth: 340,
          padding: 6,
          border: `1px solid ${border.subtle}`,
          borderRadius: radius.lg,
          boxShadow: t.shadow
        }
      }
    },
    MuiMenu: { defaultProps: { transitionDuration: duration.fast } },
    MuiList: { styleOverrides: { root: { padding: 0 } } },
    MuiMenuItem: {
      defaultProps: { dense: true },
      styleOverrides: {
        root: {
          gap: 8,
          minHeight: density.control.sm,
          height: density.control.sm,
          padding: '0 8px',
          // Match the container (radius.lg = 10) minus the inner padding 6
          borderRadius: radius.xs,
          fontSize: fontSize.sm,
          letterSpacing: letterSpacing.wide,
          color: text.primary,
          '&:hover': { background: surface.hover },
          '&.Mui-selected': { background: 'transparent' },
          '&.Mui-selected:hover': { background: surface.hover }
        }
      }
    },
    MuiDivider: { styleOverrides: { root: { borderColor: border.subtle, margin: '4px 0' } } },

    MuiDialog: {
      styleOverrides: {
        paper: {
          border: `1px solid ${border.subtle}`,
          borderRadius: radius.lg,
          boxShadow: t.shadowStrong,
          backgroundImage: 'none'
        }
      }
    },

    MuiChip: {
      defaultProps: { variant: 'flat', size: 'small' },
      styleOverrides: {
        root: { gap: 5, whiteSpace: 'nowrap' },
        label: { padding: 0, overflow: 'hidden', textOverflow: 'ellipsis' },
        icon: { margin: 0, color: 'inherit' }
      },
      /*
       * No pills (`radius.full`).
       * Rows of round blobs on a rectangular surface make the shape stand out
       * instead of the content. Full circles are reserved for "dots" and "counts"
       */
      variants: [
        {
          props: { variant: 'flat' },
          style: {
            height: 18,
            padding: '0 6px',
            borderRadius: radius.xs,
            // Lay down a thin wash of the text color, not a surface. Doesn't vanish on raised
            background: alpha(text.primary, mode === 'dark' ? 0.09 : 0.06),
            fontSize: fontSize.xs,
            letterSpacing: letterSpacing.wide,
            color: text.secondary
          }
        },
        {
          props: { variant: 'outline' },
          style: {
            maxWidth: 240,
            height: density.control.xs,
            padding: '0 7px',
            border: `1px solid ${border.subtle}`,
            borderRadius: radius.sm,
            background: 'transparent',
            fontSize: fontSize.xs,
            letterSpacing: letterSpacing.wide,
            color: text.secondary
          }
        }
      ]
    },

    MuiTooltip: {
      defaultProps: { enterDelay: 400, disableInteractive: true },
      styleOverrides: {
        tooltip: {
          background: surface.raised,
          border: `1px solid ${border.subtle}`,
          borderRadius: radius.md,
          boxShadow: t.shadow,
          color: text.primary,
          fontSize: fontSize.xs,
          lineHeight: lineHeight.base,
          padding: '4px 8px',
          // Lets multi-line descriptions be passed as-is
          whiteSpace: 'pre-line'
        }
      }
    },

    MuiBackdrop: { styleOverrides: { root: { backgroundColor: surface.overlay } } },

    /*
     * A table is "a surface where rows are picked and operated on", not prose.
     *
     * Left at the default, merely dragging from row to row flips text to blue
     * selection. That never happens in desktop lists, so the whole surface is
     * excluded from selection. Taking values out is the job of the row's
     * right-click (copy)
     */
    MuiTable: {
      styleOverrides: {
        root: { borderCollapse: 'collapse', fontSize: fontSize.sm, userSelect: 'none' }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '0 8px',
          border: 0,
          fontSize: 'inherit',
          color: 'inherit',
          lineHeight: 'inherit'
        },
        head: {
          position: 'sticky',
          top: 0,
          zIndex: 2,
          height: density.row.xs,
          background: surface.canvas,
          borderBottom: `1px solid ${border.subtle}`,
          fontSize: fontSize.xs,
          fontWeight: fontWeight.bold,
          // Set short words apart. The shape itself says "column heading, not a value"
          letterSpacing: letterSpacing.wider,
          color: text.tertiary,
          textAlign: 'left',
          whiteSpace: 'nowrap'
        }
      }
    },

    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 0, borderBottom: `1px solid ${border.subtle}` },
        // The 2px line is a mark, not a fill. Use a value that doesn't sink into the ground
        indicator: { height: 2, background: t.primaryText }
      }
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 0,
          minWidth: 0,
          height: density.control.lg,
          padding: '0 12px',
          fontSize: fontSize.sm,
          textTransform: 'none',
          color: text.secondary,
          '&.Mui-selected': { color: text.primary }
        }
      }
    },

    MuiCircularProgress: { defaultProps: { size: 16, thickness: 5 } },
    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 4, borderRadius: radius.full, backgroundColor: border.subtle },
        bar: { borderRadius: radius.full }
      }
    },
    MuiSkeleton: {
      defaultProps: { animation: 'wave' },
      styleOverrides: { root: { backgroundColor: surface.hover, borderRadius: radius.sm } }
    }
  }
}

/**
 * Text placed on a filled surface.
 *
 * Cutting by a threshold silently picks the unreadable side when neither
 * reaches 4.5. **Always take whichever has the larger contrast** (at least
 * the best available choice was made).
 */
function ink(background: string): string {
  const dark = '#0b1116'
  return getContrastRatio(background, dark) >= getContrastRatio(background, '#ffffff')
    ? dark
    : '#ffffff'
}
