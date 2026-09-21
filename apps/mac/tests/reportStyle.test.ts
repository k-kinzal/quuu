import { describe, expect, it } from 'vitest'
import { palettes } from '@design-system/react'
import { reportPrompt } from '../src/main/report/prompt.js'
import { REPORT_COLORS, reportCss } from '../src/main/report/style.js'

/**
 * A report is dressed by Quuu, so it has to be dressed in Quuu's colors.
 *
 * Main is process logic and must not import a UI package, so the report stylesheet spells the
 * values out instead of reading the tokens. That leaves two places holding the same colors —
 * and a color changed in one of them is invisible until someone opens a report and finds it
 * faintly wrong. This is where that becomes a failing test instead.
 */
describe('the report stylesheet wears the app’s colors', () => {
  const expected = {
    canvas: [palettes.dark.surface.canvas, palettes.light.surface.canvas],
    inset: [palettes.dark.surface.subtle, palettes.light.surface.subtle],
    text: [palettes.dark.text.primary, palettes.light.text.primary],
    secondary: [palettes.dark.text.secondary, palettes.light.text.secondary],
    tertiary: [palettes.dark.text.tertiary, palettes.light.text.tertiary],
    border: [palettes.dark.border.subtle, palettes.light.border.subtle],
    card: [palettes.dark.surface.default, palettes.light.surface.default],
    borderStrong: [palettes.dark.border.strong, palettes.light.border.strong],
    link: [palettes.dark.primaryText, palettes.light.primary],
    slate: [palettes.dark.accents.slate, palettes.light.accents.slate],
    green: [palettes.dark.accents.green, palettes.light.accents.green],
    violet: [palettes.dark.accents.violet, palettes.light.accents.violet],
    blue: [palettes.dark.accents.blue, palettes.light.accents.blue],
    red: [palettes.dark.accents.red, palettes.light.accents.red],
    amber: [palettes.dark.accents.amber, palettes.light.accents.amber]
  } as const

  for (const [name, [dark, light]] of Object.entries(expected)) {
    it(`takes ${name} from the design system's tokens`, () => {
      expect(REPORT_COLORS[name as keyof typeof REPORT_COLORS]).toEqual({ dark, light })
    })
  }

  it('names every color it declares, so a stale one cannot sit unchecked', () => {
    expect(Object.keys(REPORT_COLORS).sort()).toEqual(Object.keys(expected).sort())
  })

  it('writes both appearances into one file, since a report outlives the theme it was read in', () => {
    const css = reportCss()
    expect(css).toContain('color-scheme: light dark')
    for (const value of Object.values(REPORT_COLORS)) {
      expect(css).toContain(`light-dark(${value.light}, ${value.dark})`)
    }
  })

  it('offers the drawing colors by name, so a diagram never has to invent one', () => {
    const css = reportCss()
    // The prompt points at these names. A page that reaches past them is a page nobody designed
    for (const name of ['blue', 'green', 'amber', 'red', 'violet', 'slate']) {
      expect(css).toContain(`--${name}:`)
    }
  })

  it('draws every component the instructions name, and names every one it draws', () => {
    /*
     * The sheet and the instructions are one thing. A class the sheet styles but the
     * instructions never mention is a component nobody uses; a class the instructions name but
     * the sheet does not style is a page that arrives undressed.
     */
    const drawn = new Set(
      [...reportCss().matchAll(/\.([a-z][a-z0-9-]*)/g)].map((match) => match[1])
    )
    const prompt = reportPrompt({
      cwd: '/tmp', title: 'Task', prompt: 'Task', revision: null,
      changes: [], commits: [], pullRequests: [], runs: [],
      page: '/tmp/r.html', instructions: ''
    })
    const named = new Set(
      [...prompt.matchAll(/^- \.([a-z][a-z0-9- /]*) —/gm)]
        .flatMap((match) => match[1].split('/').map((part) => part.trim()))
    )
    for (const name of named) expect(drawn).toContain(name)
    for (const name of drawn) expect([...named]).toContain(name)
  })
})
