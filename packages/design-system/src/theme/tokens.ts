/**
 * The source of truth for design tokens.
 *
 * Only words whose meaning **does not change across apps** belong here.
 * Adding domain words like "rail", "awaiting review", or "priority" would let
 * the design system dictate the app's vocabulary and constrain the app side.
 * Domain colors and dimensions are added by the app layering `createTheme`.
 *
 * ---
 *
 * ## How colors are decided (read this before adding or changing a value)
 *
 * Colors are **designed in OKLCH (a perceptually uniform color space) and baked
 * into sRGB values**. Adding hex values by eye quickly breaks the 4 rules below.
 *
 * 1. **Fix the neutrals to a single hue.** Every step is aligned at H=264 (cool),
 *    with chroma rising slightly as lightness rises. If the hue drifts from step
 *    to step, the screen looks "vaguely muddy" (the old tokens wobbled
 *    between 256 and 271).
 * 2. **Make the lightness steps perceptually even.** Stepping by hex appearance
 *    crushes the differences in the dark range and the surface hierarchy
 *    becomes unreadable.
 * 3. **Offset the accents in both lightness and chroma.** Putting 6 colors at
 *    the same brightness and the same saturation makes them all shout equally
 *    and the priority disappears (the classic AI-generated palette).
 *    Red (alarm) is the heaviest, gray (default) the lightest.
 * 4. **Any color used as text must reach 4.5:1 against the surface it sits on.**
 *    When this breaks, the result is not "soft and refined" but "unreadable".
 *
 * The check lives in `tests/tokens.test.ts`. Touch a value and it fails.
 */

export type ColorScheme = 'light' | 'dark'

/**
 * Surface hierarchy.
 *
 * **`canvas` is not "the darkest surface" — it is the paper the content sits on.**
 * It is the darkest in dark mode and the brightest in light mode. It takes the
 * maximum contrast against text, and the values themselves state that the
 * reading surface is the protagonist.
 * Ancillary surfaces (rails, top/bottom bars) are pulled toward the middle.
 *
 * If the content surface in light mode were gray with white around it,
 * the protagonist would be the muddiest surface on screen.
 *
 * **Keep the steps narrow.** Telling surfaces apart is the job of the 1px rule,
 * not of value gaps. Too much gap and adjacent surfaces repel each other and
 * read as stripes (2–5 points from the paper; macOS uses this width too and
 * goes no wider).
 */
export interface SurfaceTokens {
  /** Surface the content sits on (conversation, body, work area). Paper for reading */
  canvas: string
  /** Ancillary surfaces (navigation, top/bottom bars). One step back from the paper */
  subtle: string
  /** Lists and inspectors. Between paper and ancillary */
  default: string
  /** Floating surfaces (inputs, popovers, menus). Always frontmost */
  raised: string
  /**
   * Surface that lets the backdrop show through (ancillary). **A film laid over
   * the OS blur**, same color as `subtle`. Not painting the ground fully is
   * exactly what lets what's behind appear to move
   */
  glassSubtle: string
  /** See-through surface (lists). Same color as `default` */
  glass: string
  /** One sheet of glass wrapping several sections. A thin film to show the OS material */
  glassPanel: string
  hover: string
  /** Selection. Ground pulled toward the primary color so it reads as more than plain gray */
  selected: string
  /** Scrim */
  overlay: string
}

export interface BorderTokens {
  /** Boundary between surfaces */
  subtle: string
  /** Things whose shape should assert itself, like an input's frame */
  strong: string
}

export interface TextTokens {
  primary: string
  secondary: string
  tertiary: string
  /** Text placed on a filled surface */
  inverse: string
}

/**
 * Named colors. They mean **the color itself**, not a meaning (success, warning).
 *
 * Apps use these to map onto their own domain (states, kinds, priorities).
 * This is the escape hatch that keeps the design system from naming domains.
 *
 * The 6 colors are staggered in lightness so that side by side they read in
 * **order of weight** (heaviest first: red → violet → blue → green → amber,
 * with slate the lightest). When assigning, give the most frequent state the
 * lightest color.
 */
export interface AccentTokens {
  blue: string
  green: string
  amber: string
  red: string
  violet: string
  slate: string
}

/**
 * Syntax colors.
 *
 * **Invent no new colors.** Compose only from the named colors (`accents`) and
 * the 3 text steps. Code coloring is "an aid to telling things apart", not the
 * protagonist, so the colors in use are capped at 5 and the running text
 * (`plain`) sits at the same weight as the body.
 *
 * | What | Which color | Why |
 * |---|---|---|
 * | Strings | green | The values themselves. The most frequent chunk the eye picks up |
 * | Numbers/booleans | amber | Values, but short. Kept apart from green so they don't blend |
 * | Keywords | violet | Words that build structure. Heavier color than text |
 * | Calls/types | blue | Names. Things the author gave |
 * | Comments | tertiary | Skippable. Demoted by rank, not by color |
 */
export interface SyntaxTokens {
  plain: string
  comment: string
  string: string
  number: string
  keyword: string
  literal: string
  function: string
  type: string
  property: string
  operator: string
  punctuation: string
  tag: string
  attribute: string
  variable: string
  meta: string
  added: string
  removed: string
}

export function syntaxTokens(p: Palette): SyntaxTokens {
  return {
    plain: p.text.primary,
    comment: p.text.tertiary,
    string: p.accents.green,
    number: p.accents.amber,
    keyword: p.accents.violet,
    literal: p.accents.amber,
    function: p.accents.blue,
    type: p.accents.blue,
    // Keys in a config file are "what you are looking for", so render them in the strongest text, not a color
    property: p.text.primary,
    operator: p.text.secondary,
    punctuation: p.text.secondary,
    tag: p.accents.violet,
    attribute: p.accents.blue,
    variable: p.accents.amber,
    meta: p.accents.slate,
    added: p.accents.green,
    removed: p.accents.red
  }
}

export interface Palette {
  surface: SurfaceTokens
  border: BorderTokens
  text: TextTokens
  /** On glass, where the backdrop's lightness shifts, even secondary text keeps a readable weight */
  glassText: Pick<TextTokens, 'secondary' | 'tertiary'>
  accents: AccentTokens
  /** Primary color. Used for **fills** (things that can be pressed, things that are selected) */
  primary: string
  primaryHover: string
  /**
   * The primary color placed on a surface as **text or glyphs**.
   *
   * Using the fill primary directly as text sinks into the ground in dark mode
   * and makes knocked-out text unreadable in light mode. Keep separate values
   * per role.
   */
  primaryText: string
  /** Thin wash of the primary color. For selection grounds and emphasis */
  primaryMuted: string
  /** Text placed on a primary-filled surface */
  primaryContrast: string
  /**
   * Shadow for floating surfaces. Use **only for layers the surface values
   * cannot carry (menus, dialogs)**. Depth between side-by-side surfaces is
   * made with `surface` lightness differences, not shadows (don't mix techniques).
   */
  shadow: string
  /** Frontmost (dialogs, command palette) */
  shadowStrong: string
}

/**
 * Make a "film" from an opaque surface.
 *
 * Keeping the see-through surface color as a separate hex means the next time
 * the surface color is fixed, one of the two is left behind on the old color.
 * **Deriving from the same value** makes the film move together when the color
 * is fixed.
 */
function veil(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/*
 * The dark baseline is **the values macOS actually uses**.
 *
 * Sampled from AppKit on this Mac (NSAppearance = darkAqua):
 *
 *   windowBackgroundColor / textBackgroundColor / controlBackgroundColor  #1e1e1e  L=24.5%
 *   underPageBackgroundColor                                              #282828  L=30.0%
 *   separatorColor                                                        white 10%
 *   labelColor / secondaryLabelColor                                      white 85% / 55%
 *
 * In other words, **no macOS surface is darker than L=24.5%**.
 * Make the content surface blacker than that and it repels the grays of the
 * neighboring surfaces (lists, inspector) and the center sinks like a hole.
 * The old value was L=19.0%, and that is exactly what happened.
 *
 * The surface gaps also follow macOS and stay **small** (2.7 / 4.7 points from
 * the paper). What separates surfaces is the 1px rule, not the value gap;
 * the value only says "which one is in front".
 */
const dark: Palette = {
  surface: {
    canvas: '#1f2023',
    subtle: '#25272b',
    default: '#292c30',
    raised: '#2f3237',
    /*
     * Film opacity. **Do not go too thin.**
     *
     * A bright wallpaper behind makes the text on the see-through surface that
     * much harder to read. In dark mode the OS blur (sidebar) itself pulls
     * toward the dark side, so 0.62 is enough and the text stays afloat even
     * over a white wallpaper
     */
    glassSubtle: veil('#25272b', 0.62),
    glass: veil('#292c30', 0.72),
    glassPanel: veil('#25272b', 0.18),
    hover: '#383c43',
    selected: '#324458',
    overlay: 'rgba(0, 0, 0, 0.55)'
  },
  border: { subtle: '#363940', strong: '#4d515a' },
  text: {
    primary: '#d9dbdd',
    secondary: '#a7abb3',
    tertiary: '#8c919b',
    inverse: '#1f2023'
  },
  glassText: { secondary: '#d2d6dc', tertiary: '#cdd1d8' },
  // Brightest first = most assertive first. Ordered so the most frequent state can take the lightest color
  accents: {
    slate: '#8d94a2',
    green: '#5dac7b',
    violet: '#aa8ddd',
    blue: '#5eabf1',
    red: '#fe6863',
    amber: '#e8a750'
  },
  primary: '#0077d5',
  primaryHover: '#288ded',
  primaryText: '#5ea8f9',
  primaryMuted: 'rgba(0, 119, 213, 0.22)',
  primaryContrast: '#ffffff',
  // On a dark surface, "adding black" alone is invisible as a shadow. Only paired with the 1px border does it become a layer
  shadow: '0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 20px rgba(0, 0, 0, 0.42)',
  shadowStrong: '0 2px 4px rgba(0, 0, 0, 0.44), 0 20px 48px rgba(0, 0, 0, 0.52)'
}

const light: Palette = {
  surface: {
    canvas: '#fcfcfe',
    subtle: '#eef0f3',
    default: '#f6f7f9',
    raised: '#ffffff',
    // In light mode a thin film lets text blend into the wallpaper. Set one step denser than dark
    glassSubtle: veil('#eef0f3', 0.7),
    glass: veil('#f6f7f9', 0.78),
    glassPanel: veil('#eef0f3', 0.24),
    hover: '#e4e7ed',
    selected: '#d0e2f6',
    overlay: 'rgba(17, 20, 25, 0.32)'
  },
  border: { subtle: '#d9dbe0', strong: '#b8bcc4' },
  text: {
    primary: '#1b1e24',
    secondary: '#4d535d',
    tertiary: '#686d78',
    inverse: '#ffffff'
  },
  glassText: { secondary: '#343a44', tertiary: '#424954' },
  /*
   * Darkest first = most assertive first.
   * Light mode has the "4.5:1 as text" floor, so there is no room in lightness.
   * The missing difference is made up with chroma (red is the darkest and most
   * vivid, gray is achromatic)
   */
  accents: {
    red: '#ac011a',
    blue: '#006bb2',
    green: '#1b7c4a',
    amber: '#975d00',
    slate: '#676d79',
    violet: '#7d5eaf'
  },
  primary: '#0065b7',
  primaryHover: '#005296',
  primaryText: '#005ba6',
  primaryMuted: 'rgba(0, 101, 183, 0.12)',
  primaryContrast: '#ffffff',
  // Shadows aim for "blur = 2× distance", so closer layers look tighter
  shadow: '0 1px 2px rgba(20, 25, 35, 0.10), 0 6px 16px rgba(20, 25, 35, 0.12)',
  shadowStrong: '0 2px 4px rgba(20, 25, 35, 0.12), 0 18px 44px rgba(20, 25, 35, 0.18)'
}

export const palettes: Record<ColorScheme, Palette> = { dark, light }

export const fontFamily = {
  ui: "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Noto Sans JP', sans-serif",
  /** Paths, commands, identifiers. Things whose columns should line up */
  mono: "'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace"
} as const

/**
 * Density. **The axis that carries one design onto both the surface you touch
 * and the surface you operate with tools.**
 *
 * The information design (what to show, how to arrange it) does not change per
 * device, but **the dimensions do**. A mouse can point at 1px; a finger cannot.
 * Carry the design to a phone without this axis and you get a "tiny desktop"
 * with 13px type next to 28px rows (that actually happened).
 *
 * | | `compact` | `comfortable` |
 * |---|---|---|
 * | Who touches it | Mouse and keyboard | Fingers |
 * | Body | 13px | 17px (iOS body) |
 * | Height of pressable things | 26px | 44px (iOS floor) |
 * | List row | 28px | 56px |
 *
 * **Step names and meanings are the same in both** (`fontSize.md` is the body
 * either way). Screens write only the step name and never need to know the
 * actual size.
 */
export type Density = 'compact' | 'comfortable'

/**
 * Type scale. There are only 5 steps because more steps cause re-picking at
 * every site. Line height is part of the density expression too.
 *
 * **The steps are close together, so hierarchy is made with weight and color,
 * not size** (`fontWeight` / `text.*`). The difference between 11px and 13px
 * will not read as a heading to anyone.
 */
export const fontSize = { xs: 11, sm: 12, md: 13, lg: 14, xl: 17 } as const

export const lineHeight = {
  tight: 1.35,
  base: 1.6,
  /** Reading surfaces */
  read: 1.75,
  /** Writing surfaces */
  write: 1.85
} as const

/**
 * Letter spacing.
 *
 * Small type gets spread, large type gets tightened. Left at the default 0,
 * an 11px label clumps together and a 17px heading looks slack.
 */
export const letterSpacing = {
  /** 11–12px labels and meta */
  wide: '0.01em',
  /** Short words set apart, like section headings */
  wider: '0.04em',
  normal: '0',
  /** 14px and up */
  tight: '-0.01em',
  /** Headings 17px and up */
  tighter: '-0.018em'
} as const

/**
 * Weight. **Never below 400** (small type becomes unreadable).
 * To soften something, drop the color, not the weight.
 */
export const fontWeight = { regular: 400, medium: 500, bold: 600 } as const

/**
 * Density. Fixes row and control heights into steps.
 * Exists so "how many px is this surface" is never decided per screen.
 */
export const density = {
  /** Row heights. xs=heading / sm=support row / md=meta / lg=table row / xl=list row */
  row: { xs: 20, sm: 22, md: 24, lg: 28, xl: 30 },
  /** Button and input heights */
  control: { xs: 22, sm: 26, md: 28, lg: 32 }
} as const

/**
 * Corner radius. **When nesting, the outer radius is the larger one**
 * (inner = outer − gap). Using the same radius everywhere makes nested corners
 * misalign and look cheap.
 *
 * `full` is **only for dots and count pills**. Applying `full` across a row of
 * rectangular things like context chips makes the shape stand out instead of
 * the content.
 */
export const radius = { xs: 3, sm: 5, md: 7, lg: 10, full: 999 } as const

export const duration = { fast: 120, base: 200 } as const

/** Direct manipulation must settle before the next action; no delay or spring overshoot. */
export const layoutMotion = { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' } as const

/** Arrivals share one deadline; cubic ease-out matches the scroll's progress. */
export const conversationMotion = { duration: 180, easing: 'cubic-bezier(0.333333, 1, 0.666667, 1)' } as const

/** Decorative light, never text or status colors. OKLCH (0.78, 0.15) at
 * 255 / 305 / 195 / 350 / 95 degrees, converted and clipped to sRGB.
 * Opacity applies to the combined field so overlapping colors cannot intensify it.
 */
export const ambientGradient = {
  opacity: 0.035,
  colors: ['#72baff', '#ce9dff', '#00d4d5', '#fe8dc5', '#d6b529'],
  periods: [120, 144, 168, 156, 180]
} as const

/** Only 3 icon steps. Stroke width is unified too (so line weight doesn't split across environments) */
export const iconSize = { sm: 14, md: 16, lg: 18 } as const

/**
 * Hit area for glyph-only buttons.
 *
 * Kept separate from the glyph size (`iconSize`). **The pressable area may be
 * wider than the drawn glyph** (on touch surfaces it must be, or it can't be
 * pressed).
 */
export const iconButton = { xs: 20, sm: 24, md: 28 } as const

/**
 * Edge length of the status mark (`StatusIndicator`).
 *
 * Kept separate from icons. **Marks are read by shape**, so they sit smaller
 * than line-drawn icons, aligned to the height of the text.
 */
export const markSize = 10
export const iconDefaults = { strokeWidth: 1.75, absoluteStrokeWidth: false } as const

/** CJK glyph faces and line art don't align by geometric center alone. Keep the correction for top-edge titles and directional glyphs in one place. */
export const optical = { headingOffset: 1 } as const

/** Maximum measure for body text. Surfaces where prose is the protagonist stop here */
export const measure = '72ch'

/** 4px is 1 unit. `theme.spacing(n)` is exactly n steps */
export const spacingUnit = 4

/* ------------------------------------------------------------------ Density */

/** Step names do not change with density. Only the values do. */
export interface Scale {
  fontSize: Record<keyof typeof fontSize, number>
  density: {
    row: Record<keyof (typeof density)['row'], number>
    control: Record<keyof (typeof density)['control'], number>
  }
  iconSize: Record<keyof typeof iconSize, number>
  /** Hit area for glyph-only buttons */
  iconButton: Record<keyof typeof iconButton, number>
  /** Edge length of the status mark */
  markSize: number
  radius: Record<keyof typeof radius, number>
  /** How many px one step is */
  spacingUnit: number
}

/**
 * Actual sizes per density. **Step names are the same in both; only values differ.**
 *
 * The `comfortable` values are taken from iOS conventions.
 *
 * - Body 17px (`fontSize.md`) — iOS Body
 * - Pressable things never go below 44px (`density.control.sm` and up).
 *   Apple's hit-area floor; anything smaller is "pressable but can't be pressed"
 * - List rows 56px (`density.row.xl`) — even a 2-line row can be picked apart by finger
 *
 * The step ratios are not uniform: **the smaller the step, the harder it is
 * lifted**. Scaling 11px proportionally only reaches 14px, which stays
 * unreadable on a phone.
 */
export const scales: Record<Density, Scale> = {
  compact: {
    fontSize,
    density,
    iconSize,
    iconButton,
    markSize,
    radius,
    spacingUnit
  },
  comfortable: {
    fontSize: { xs: 13, sm: 15, md: 17, lg: 20, xl: 28 },
    density: {
      row: { xs: 28, sm: 32, md: 36, lg: 44, xl: 56 },
      control: { xs: 36, sm: 44, md: 48, lg: 52 }
    },
    iconSize: { sm: 18, md: 22, lg: 26 },
    // Glyph-only buttons don't go below 44px either (never create a bar "+" that can't be pressed)
    iconButton: { xs: 40, sm: 44, md: 48 },
    markSize: 14,
    // Larger surfaces round one step further (small radii look sharp-cornered when scaled up)
    radius: { xs: 4, sm: 8, md: 10, lg: 14, full: 999 },
    spacingUnit: 4
  }
}
