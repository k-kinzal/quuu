import { describe, expect, it } from 'vitest'
import { palettes } from '../../../packages/design-system/src/theme/tokens.js'
import type { Palette } from '../../../packages/design-system/src/theme/tokens.js'

/**
 * Verifying the palette by arithmetic.
 *
 * The colors are not a pile of "hexes that look nice"; they are values derived from rules.
 * If the rules live only in prose, they break silently the moment someone adds one more color.
 * What is checked here is only the kind of breakage **the eye cannot catch**.
 *
 * - whether the neutral hue drifts from step to step
 * - whether surfaces differ in lightness enough to tell apart side by side
 * - whether a color used as text is readable on the surface it sits on
 * - whether the six accents all land at the same strength
 */

/* ----------------------------------------------------------- color space */

function toLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16))) as [number, number, number]
}

/** OKLCH L (perceptual lightness, 0-1), C (chroma) and H (hue, degrees) */
function oklch(hex: string): { l: number; c: number; h: number } {
  const [r, g, b] = parse(hex)
  const lms = [
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  ].map((v) => Math.cbrt(v))
  const l = 0.2104542553 * lms[0] + 0.793617785 * lms[1] - 0.0040720468 * lms[2]
  const a = 1.9779984951 * lms[0] - 2.428592205 * lms[1] + 0.4505937099 * lms[2]
  const bb = 0.0259040371 * lms[0] + 0.7827717662 * lms[1] - 0.808675766 * lms[2]
  return {
    l,
    c: Math.hypot(a, bb),
    h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360
  }
}

/** WCAG contrast ratio */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const [r, g, bl] = parse(hex)
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Floor for readable text. Checked at 4.4 to allow rounding at the second decimal */
const READABLE = 4.4
/** Floor for a visible mark (dot, rule) */
const VISIBLE = 3

const SCHEMES: [string, Palette][] = [
  ['dark', palettes.dark],
  ['light', palettes.light]
]

/* -------------------------------------------------------------- the math */

/** Surfaces seen side by side. Floating `raised` sits in a layer outside these, so it is checked separately */
const INFLOW = ['canvas', 'subtle', 'default'] as const
const TEXTS = ['primary', 'secondary', 'tertiary'] as const
/* The interface has no index signature, so `Object.values` degrades to `any[]`; list the keys instead */
const ACCENTS = ['red', 'amber', 'green', 'blue', 'violet', 'slate'] as const

// describe.each hands its arguments over as any, so put the types back here
describe.each(SCHEMES)('%s', (_name: string, p: Palette) => {
  // `selected` is pulled toward the primary color, so it is left out of the neutral check
  const neutrals = [
    ...INFLOW.map((k) => p.surface[k]),
    p.surface.raised,
    p.surface.hover,
    p.border.subtle,
    p.border.strong,
    ...TEXTS.map((k) => p.text[k])
  ]

  it('keeps every neutral on a single hue (drifting per step looks muddy)', () => {
    /*
     * Only the steps that carry chroma are checked.
     * Once rounded to 8 bits, the hue of anything below C 0.01 wanders by about 10 degrees either way.
     * At that little chroma a hue difference is invisible, so it is not checked
     */
    const hues = neutrals.filter((v) => oklch(v).c > 0.009).map((v) => oklch(v).h)
    const spread = Math.max(...hues) - Math.min(...hues)
    expect(spread).toBeLessThan(12)
  })

  it('keeps a tint in the neutrals (pure gray does not sit with the other colors)', () => {
    const tinted = neutrals.filter((v) => oklch(v).c > 0.002)
    expect(tinted.length / neutrals.length).toBeGreaterThan(0.7)
  })

  it('never grounds a surface on pure black or pure white (the contrast tires the eye)', () => {
    expect(p.surface.canvas).not.toBe('#000000')
    expect(p.text.primary).not.toBe('#ffffff')
    expect(p.text.primary).not.toBe('#000000')
  })

  it('puts the paper (canvas) at one end of the surface range', () => {
    // canvas is not "the darkest surface" but "the paper the content sits on". Darkest in dark, lightest in light.
    // Put it in the middle and the leading role lands on the muddiest surface
    const ls = INFLOW.map((k) => oklch(p.surface[k]).l)
    expect(ls[0] === Math.min(...ls) || ls[0] === Math.max(...ls)).toBe(true)
  })

  it('keeps the lightness gap between surfaces wide enough to tell neighbors apart', () => {
    const sorted = INFLOW.map((k) => oklch(p.surface[k]).l).sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) {
      const step = sorted[i] - sorted[i - 1]
      // Too small a gap forces reliance on rules, and the surface hierarchy stops working
      expect(step).toBeGreaterThan(0.015)
      // Hobday: keep container-vs-ground lightness within 12 points in dark / 7 in light
      expect(step).toBeLessThan(0.12)
    }
  })

  it('keeps the gap between surfaces small enough that neighbors do not fight', () => {
    /*
     * The drop between surfaces is kept **small**.
     *
     * Telling surfaces apart is the 1px rule's job, not the value gap's.
     * Overdo the gap and neighboring surfaces read as stripes, with the middle sinking like a hole.
     * That actually happened: the conversation surface went abnormally black and fought the grays on both sides.
     */
    const ls = INFLOW.map((k) => oklch(p.surface[k]).l)
    expect(Math.max(...ls) - Math.min(...ls)).toBeLessThan(0.06)
  })

  it('makes a floating surface read as lifted off the one below it', () => {
    // On paper (canvas) the rule and the shadow build the layer, so only the gap against the panel (default) is checked
    const gap = Math.abs(oklch(p.surface.raised).l - oklch(p.surface.default).l)
    expect(gap).toBeGreaterThan(0.015)
  })

  it('builds a translucent surface out of the same color as its opaque counterpart', () => {
    /*
     * A film is not "a different color" but "a thinner version of the same color".
     * Break this and only the translucent surfaces carry a different hue (a difference transparency hides well)
     */
    const rgb = (value: string): string => value.replace(/rgba\(([^)]+),[^,]+\)/, '$1').trim()
    const hex = (value: string): string => {
      const h = value.replace('#', '')
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')
    }
    expect(rgb(p.surface.glassSubtle)).toBe(hex(p.surface.subtle))
    expect(rgb(p.surface.glass)).toBe(hex(p.surface.default))
  })

  it('keeps a translucent surface from going too thin (text stops reading over a bright backdrop)', () => {
    const alpha = (value: string): number => Number(value.split(',').pop()?.replace(')', ''))
    for (const key of ['glass', 'glassSubtle'] as const) {
      // Fully opaque defeats the point of translucency; too thin and text will not stand off the wallpaper
      expect(alpha(p.surface[key]), key).toBeGreaterThanOrEqual(0.6)
      expect(alpha(p.surface[key]), key).toBeLessThan(0.9)
    }
    // The ancillary surface is the thinner one (the further back, the more it lets through)
    expect(alpha(p.surface.glassSubtle)).toBeLessThan(alpha(p.surface.glass))
  })

  it('keeps the selection ground off neutral (plain gray is indistinguishable from hover)', () => {
    expect(oklch(p.surface.selected).c).toBeGreaterThan(oklch(p.surface.hover).c * 1.5)
  })

  it('keeps text readable on the surface it sits on', () => {
    for (const surface of INFLOW) {
      for (const tone of TEXTS) {
        expect(
          contrast(p.text[tone], p.surface[surface]),
          `text.${tone} on surface.${surface}`
        ).toBeGreaterThanOrEqual(READABLE)
      }
    }
    /*
     * `tertiary` on a floating surface (inputs, popovers) is used for placeholders
     * and disabled states, so only here it is checked at the mark floor.
     * macOS puts tertiaryLabelColor at 25% white too (far below AA).
     * Text that carries meaning is set in `primary` / `secondary`
     */
    for (const tone of ['primary', 'secondary'] as const) {
      expect(
        contrast(p.text[tone], p.surface.raised),
        `text.${tone} on surface.raised`
      ).toBeGreaterThanOrEqual(READABLE)
    }
    expect(contrast(p.text.tertiary, p.surface.raised)).toBeGreaterThanOrEqual(VISIBLE)
  })

  it('keeps secondary text readable when a glass backdrop drifts to mid lightness', () => {
    // Native materials pick up the backdrop. Checking against the fixed canvas alone lets secondary text sink.
    const backdrop = _name === 'dark' ? '#565c64' : '#c0c5cc'
    for (const tone of ['secondary', 'tertiary'] as const) {
      expect(contrast(p.glassText[tone], backdrop)).toBeGreaterThanOrEqual(READABLE)
    }
  })

  it('keeps an accent readable on every surface where it may be set as text', () => {
    // An accent may be used as text only on the content surfaces (canvas / default) and the ancillary band (subtle)
    for (const surface of INFLOW) {
      for (const name of ACCENTS) {
        expect(
          contrast(p.accents[name], p.surface[surface]),
          `accents.${name} on surface.${surface}`
        ).toBeGreaterThanOrEqual(READABLE)
      }
    }
  })

  it('keeps an accent visible as a mark on floating surfaces too', () => {
    for (const name of ACCENTS) {
      expect(
        contrast(p.accents[name], p.surface.raised),
        `accents.${name}`
      ).toBeGreaterThanOrEqual(VISIBLE)
    }
  })

  it('spreads the six accents across strengths (equal strength erases priority)', () => {
    const values = ACCENTS.map((k) => oklch(p.accents[k]))
    const ls = values.map((v) => v.l).sort((a, b) => a - b)
    /*
     * The lightness spread from end to end.
     * In light the "4.5:1 as text" floor caps the top end, so the spread cannot be wide.
     * The chroma check below picks up what is missing
     */
    expect(ls[ls.length - 1] - ls[0]).toBeGreaterThan(0.07)

    const cs = values.map((v) => v.c).sort((a, b) => a - b)
    // Same for chroma. Every color at one vividness gives a screen that looks like a paint set
    expect(cs[cs.length - 1] - cs[0]).toBeGreaterThan(0.1)
  })

  it('splits the primary color into separate values for fill and for text', () => {
    // Text on the fill reads
    expect(contrast(p.primaryContrast, p.primary)).toBeGreaterThanOrEqual(READABLE)
    // The primary color set as text on a surface reads
    for (const surface of ['canvas', 'subtle', 'default', 'raised'] as const) {
      expect(
        contrast(p.primaryText, p.surface[surface]),
        `primaryText on surface.${surface}`
      ).toBeGreaterThanOrEqual(READABLE)
    }
  })

  it('keeps a border visible against the surfaces it separates', () => {
    // A floating surface (raised) builds its edge together with the shadow, so it is not checked here
    for (const surface of INFLOW) {
      expect(
        contrast(p.border.subtle, p.surface[surface]),
        `border.subtle on surface.${surface}`
      ).toBeGreaterThan(1.05)
    }
  })
})

describe('matching macOS surfaces', () => {
  /*
   * Values taken from AppKit on this Mac (NSAppearance = darkAqua).
   *
   *   windowBackgroundColor / textBackgroundColor / controlBackgroundColor  #1e1e1e
   *
   * In other words **no macOS surface is darker than OKLCH L=24.5%**.
   * This is a desktop app, so a surface blacker than that floats away from
   * the native parts sharing the screen (menus, popovers).
   */
  const MACOS_DARK_WINDOW = 0.245

  it('keeps dark surfaces no blacker than the macOS window ground', () => {
    for (const key of [...INFLOW, 'raised'] as const) {
      expect(
        oklch(palettes.dark.surface[key]).l,
        `surface.${key} is darker than macOS #1e1e1e`
      ).toBeGreaterThanOrEqual(MACOS_DARK_WINDOW - 0.005)
    }
  })

  it('never sets dark-mode text to raw white', () => {
    // macOS labelColor is 85% white. Pure white bleeds on a dark surface
    expect(palettes.dark.text.primary.toLowerCase()).not.toBe('#ffffff')
    expect(oklch(palettes.dark.text.primary).l).toBeLessThan(0.93)
  })
})

describe('light and dark', () => {
  it('flips the paper (canvas) between the two', () => {
    // Darkest in dark, lightest in light. Either way the contrast against text is at its maximum
    const d = palettes.dark
    const l = palettes.light
    expect(oklch(d.surface.canvas).l).toBeLessThan(oklch(d.surface.subtle).l)
    expect(oklch(l.surface.canvas).l).toBeGreaterThan(oklch(l.surface.subtle).l)
  })

  it('points a color of the same name at the same hue in both palettes', () => {
    for (const key of ACCENTS) {
      const d = oklch(palettes.dark.accents[key]).h
      const l = oklch(palettes.light.accents[key]).h
      // Distance around the hue wheel (0-180 degrees)
      const apart = 180 - Math.abs(Math.abs(d - l) - 180)
      expect(apart, `accents.${key}`).toBeLessThan(20)
    }
  })
})
