import { keyframes, type Theme } from '@mui/material/styles'
import type { SurfaceTokens } from './tokens.js'

/**
 * The shared filter for adding custom props to `styled()`.
 *
 * Passing `shouldForwardProp` to MUI's `styled` replaces the default filter
 * wholesale, leaking `sx` / `as` / `ownerState` into the bare DOM — so the
 * names go through this helper and nothing slips past.
 */
const RESERVED = ['sx', 'as', 'theme', 'ownerState']

export function blockProps(...names: string[]): (prop: PropertyKey) => boolean {
  const blocked = new Set<PropertyKey>([...RESERVED, ...names])
  return (prop) => !blocked.has(prop)
}

/**
 * A signal that flashes the ground for an instant to point out a place.
 *
 * Used when a location needs to be conveyed, like "where did the thing I added
 * go". The caller passes the color via `--flash-color` (grounds differ per
 * surface).
 */
export const flash = keyframes({ '0%': { backgroundColor: 'var(--flash-color)' } })

/** Rises from below. For things that appear later, like notifications. */
export const riseIn = keyframes({ from: { opacity: 0, transform: 'translateY(6px)' } })

export const fadeIn = keyframes({ from: { opacity: 0 } })

/* ------------------------------------------------------------ Surface grounds */

/** The hierarchy a surface can pick. See-through surfaces (`glass*`) line up here too. */
export type SurfaceLevel = 'transparent' | keyof Pick<
  SurfaceTokens,
  'canvas' | 'subtle' | 'default' | 'raised' | 'glass' | 'glassSubtle'
>

const TRANSLUCENT: readonly SurfaceLevel[] = ['glass', 'glassSubtle']

/**
 * The surface's ground. **For see-through surfaces, only this adds the blur.**
 *
 * Blur is applied in two places. Behind the window (the desktop) the OS does
 * it; things stacked inside the window are handled here. Writing
 * `backdrop-filter` per surface quickly produces one surface whose density
 * differs from the rest.
 */
export function surfaceStyles(
  theme: Theme,
  level: SurfaceLevel
): { background: string; backdropFilter?: string } {
  if (level === 'transparent') return { background: 'transparent' }
  const background = theme.palette.surface[level]
  if (!TRANSLUCENT.includes(level)) return { background }
  return { background, backdropFilter: 'saturate(180%) blur(20px)' }
}

/**
 * The media query that wraps hover appearance.
 *
 * **Fingers have no hover.** `:hover` lands the moment you touch, and it stays
 * after lifting until the next touch somewhere else — things not being pressed
 * keep looking pressed. All hover rules are wrapped here; press feedback comes
 * from `:active`.
 */
export const canHover = '@media (hover: hover)'
