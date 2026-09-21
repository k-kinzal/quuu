import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scrollSwipeNavigates, swipeCommand } from '../src/main/swipe.js'

/**
 * The trackpad's page swipe comes in two forms, and a Mac uses whichever its owner picked.
 *
 * Quuu first read only the two-finger form (sideways scrolling). On a Mac set to
 * three fingers the swipe arrives as a window gesture with no scrolling at all, so
 * it did nothing — that actually happened. What is guarded here is that the
 * three-finger form reaches Back / Forward too, and that a Mac with two-finger page
 * swipes turned off does not have its sideways scrolling read as one.
 */
describe('the three-finger page swipe', () => {
  it('goes back on a swipe left and forward on a swipe right', () => {
    expect(swipeCommand('left')).toBe('view.back')
    expect(swipeCommand('right')).toBe('view.forward')
  })

  it('leaves up and down alone (they are not page swipes)', () => {
    expect(swipeCommand('up')).toBeNull()
    expect(swipeCommand('down')).toBeNull()
  })

  it('is answered by the window, not only described here', () => {
    const composition = readFileSync(join(import.meta.dirname, '..', 'src/main/index.ts'), 'utf8')
    expect(composition).toMatch(/win\.on\('swipe'/)
    expect(composition).toContain('swipeCommand(direction)')
  })
})

describe('whether two-finger scrolling is a page swipe on this Mac', () => {
  it('follows the setting when it has been turned on or off', () => {
    expect(scrollSwipeNavigates('1')).toBe(true)
    expect(scrollSwipeNavigates('0')).toBe(false)
  })

  it('treats a setting never touched as the macOS default, which is on', () => {
    expect(scrollSwipeNavigates('')).toBe(true)
  })
})
