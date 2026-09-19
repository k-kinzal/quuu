import { describe, expect, it } from 'vitest'
import { WINDOW_BUTTONS, WINDOW_BUTTONS_INSET } from '../src/main/windowGeometry.js'
import { HEADER_BAND } from '../../../packages/design-system/src/components/layout/Panel.js'

/**
 * Verifying where the traffic lights (close, minimize, zoom) sit.
 *
 * With the window band gone, the traffic lights **sit directly on the top of the rail**.
 * main decides where they go, and the renderer uses the width kept clear. Even coming from the same value,
 * touching the band height or the folded rail width separately makes them overlap easily.
 * An overlap gives a window you cannot press, so it is caught before anyone spots it by eye.
 */
describe('the window traffic lights', () => {
  it('fits inside the header band (sticking out would cut into the surface below)', () => {
    expect(WINDOW_BUTTONS.y + WINDOW_BUTTONS.height).toBeLessThanOrEqual(HEADER_BAND)
  })

  it('sits vertically centered inside the band', () => {
    const below = HEADER_BAND - (WINDOW_BUTTONS.y + WINDOW_BUTTONS.height)
    expect(Math.abs(WINDOW_BUTTONS.y - below)).toBeLessThanOrEqual(2)
  })

  it('keeps the cleared width past the right edge of the lights (otherwise the controls end up underneath)', () => {
    expect(WINDOW_BUTTONS_INSET).toBeGreaterThan(WINDOW_BUTTONS.x + WINDOW_BUTTONS.width)
  })
})
