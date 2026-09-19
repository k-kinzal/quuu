/**
 * Where the window's traffic lights (close, minimize, zoom) sit.
 *
 * With no title bar, the traffic lights sit **directly on the top of the rail**.
 * Main decides their position (`trafficLightPosition`); the renderer decides
 * the space to leave. Held separately, moving only one would overlap controls
 * and make them unclickable. **Both read from here.**
 */
export const WINDOW_BUTTONS = {
  /** Distance from the window's left edge */
  x: 14,
  /** Distance from the window's top edge */
  y: 14,
  /** Measured from AppKit. Three 14px circles at 23px spacing */
  width: 60,
  height: 14
} as const

/**
 * The width to leave clear at the window's top-left to avoid the traffic lights.
 *
 * With the rail collapsed, only the traffic lights overhang into the neighboring
 * header's space. The header leaves `WINDOW_BUTTONS_OVERHANG` clear; the icon
 * column itself stays narrow.
 */
export const WINDOW_BUTTONS_INSET = WINDOW_BUTTONS.x + WINDOW_BUTTONS.width + 10

/** The collapsed rail is sized for one column of icons. Don't fatten the whole column for the traffic lights. */
// The close circle's center is shared with the center of the icon column below it.
export const COLLAPSED_RAIL_WIDTH = 2 * WINDOW_BUTTONS.x + WINDOW_BUTTONS.height

/** How far the traffic lights overhang the collapsed rail to the right. */
export const WINDOW_BUTTONS_OVERHANG = WINDOW_BUTTONS_INSET - COLLAPSED_RAIL_WIDTH
