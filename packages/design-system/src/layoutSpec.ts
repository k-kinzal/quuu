/** The display conventions for columns, usable without loading React. They carry no meaning about column names or sorting. */
/**
 * Default column widths.
 *
 * `timestamp` holds an outcome word plus a time ("Succeeded - 20:50"), so it is sized
 * for the longest of those words. At 124 it fit the shortest translations and clipped
 * the time off the rest by a few pixels — and a time cut down to "20:..." is the half
 * of that cell worth reading.
 */
export const columnProfiles = {
  marker: { width: 34, min: 34 },
  title: { width: 460, min: 160 },
  label: { width: 148, min: 72 },
  ordinal: { width: 48, min: 44 },
  target: { width: 156, min: 80 },
  state: { width: 150, min: 80 },
  timestamp: { width: 136, min: 80 }
} as const
export const tableMetrics = {
  maximumWidth: 720,
  actionsWidth: 124,
  cell: { marker: 28, count: 64, expression: 120, time: 96 }
} as const

/** Only widths obtained from a saved value or from the DS conventions are passed on. The caller never invents an initial dimension. */
declare const paneWidth: unique symbol
export type PaneWidth = number & { readonly [paneWidth]: true }
export const paneProfiles = {
  navigation: { initial: 208 as PaneWidth, min: 176, max: 300 },
  collection: { initial: 268 as PaneWidth, min: 220, max: 420 },
  inspector: { initial: 300 as PaneWidth, min: 260, max: 480 }
} as const
export type PaneProfile = keyof typeof paneProfiles

/** The stored form stays a plain number. An old width or a corrupted saved value is pulled back to the current conventions. */
export function restorePaneWidth(profile: PaneProfile, saved: unknown): PaneWidth {
  const { initial, min, max } = paneProfiles[profile]
  return typeof saved === 'number' && Number.isFinite(saved)
    ? Math.round(Math.min(max, Math.max(min, saved))) as PaneWidth
    : initial
}

/** If notifications and the bottom band each decided their own height, they would overlap the moment the band changed. */
export const shellMetrics = { headerHeight: 42, footerHeight: 32 } as const

/** How the area is shared out before anything is saved. Which pane is the primary one is the caller's choice. */
export const paneWeights = { standard: 1, primary: 2 } as const
