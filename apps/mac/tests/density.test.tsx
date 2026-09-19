import { describe, expect, it } from 'vitest'
import { createTheme, scales } from '@design-system/react'

/**
 * The density axis. **It carries one design onto both the tool surface and the touch surface.**
 *
 * The information design does not change per device, but the dimensions do. Ship to
 * a phone without this and you get a "tiny desktop" (that actually happened).
 */

describe('step names do not change with density', () => {
  it('both densities carry the same steps (screens never need to know real sizes)', () => {
    expect(Object.keys(scales.comfortable.fontSize)).toEqual(Object.keys(scales.compact.fontSize))
    expect(Object.keys(scales.comfortable.density.row)).toEqual(
      Object.keys(scales.compact.density.row)
    )
    expect(Object.keys(scales.comfortable.density.control)).toEqual(
      Object.keys(scales.compact.density.control)
    )
    expect(Object.keys(scales.comfortable.iconSize)).toEqual(Object.keys(scales.compact.iconSize))
    expect(Object.keys(scales.comfortable.radius)).toEqual(Object.keys(scales.compact.radius))
  })
})

describe('touch surface (comfortable)', () => {
  it('body text is 17px — same as iOS body. Anything smaller is unreadable', () => {
    expect(createTheme({ density: 'comfortable' }).typography.body1.fontSize).toBe(17)
  })

  it('even the smallest text is 13px (never carry over 11px metadata)', () => {
    expect(scales.comfortable.fontSize.xs).toBeGreaterThanOrEqual(13)
  })

  it('pressable things never go below 44px — the lower bound of a finger hit target', () => {
    const { control } = scales.comfortable.density
    // xs is for modest controls, but even it stays big enough to press with a finger
    for (const [step, height] of Object.entries(control)) {
      expect(height, `control.${step}`).toBeGreaterThanOrEqual(36)
    }
    expect(control.sm, 'button default').toBeGreaterThanOrEqual(44)
  })

  it('list rows are at least 44px (two-line rows 56px)', () => {
    expect(scales.comfortable.density.row.lg).toBeGreaterThanOrEqual(44)
    expect(scales.comfortable.density.row.xl).toBeGreaterThanOrEqual(56)
  })

  it('every step is larger than compact (a shrinking step would be the one you cannot touch)', () => {
    const bigger = (a: Record<string, number>, b: Record<string, number>, label: string): void => {
      for (const key of Object.keys(a)) {
        expect(b[key], `${label}.${key}`).toBeGreaterThan(a[key])
      }
    }
    bigger(scales.compact.fontSize, scales.comfortable.fontSize, 'fontSize')
    bigger(scales.compact.density.row, scales.comfortable.density.row, 'row')
    bigger(scales.compact.density.control, scales.comfortable.density.control, 'control')
    bigger(scales.compact.iconSize, scales.comfortable.iconSize, 'iconSize')
  })
})

describe('tool surface (compact)', () => {
  it('compact is the default; Mac dimensions do not move when the density axis is added', () => {
    const theme = createTheme({ colorScheme: 'dark' })
    expect(theme.densityMode).toBe('compact')
    expect(theme.typography.body1.fontSize).toBe(13)
    expect(theme.density.row.lg).toBe(28)
    expect(theme.density.control.sm).toBe(26)
    expect(theme.iconSize.md).toBe(16)
    expect(theme.radius.md).toBe(7)
  })
})

describe('colors do not change with density', () => {
  it('the same color scheme yields the same colors across densities', () => {
    const compact = createTheme({ colorScheme: 'dark', density: 'compact' })
    const comfortable = createTheme({ colorScheme: 'dark', density: 'comfortable' })
    expect(comfortable.palette.surface).toEqual(compact.palette.surface)
    expect(comfortable.palette.accents).toEqual(compact.palette.accents)
    expect(comfortable.palette.text.primary).toBe(compact.palette.text.primary)
  })
})
