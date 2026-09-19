// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@mui/material/styles'
import { ActivityStatus, createTheme } from '@design-system/react'
import { LoadingDots } from '../../../packages/design-system/src/components/feedback/LoadingDots.js'

interface HeldAnimation { playState: 'running' | 'paused'; currentTime: number | null; pause(): void }

/** jsdom has no CSS animations; hand the subtree one held animation and record every time it is moved. */
function stubAnimation(): { animation: HeldAnimation; moves: number[]; restore(): void } {
  const moves: number[] = []
  let held = 0
  const animation: HeldAnimation = {
    playState: 'running',
    get currentTime() { return held },
    set currentTime(value: number | null) { held = value ?? 0; moves.push(held) },
    pause() { this.playState = 'paused' }
  }
  Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [animation] })
  return { animation, moves, restore: () => { delete (Element.prototype as { getAnimations?: unknown }).getAnimations } }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('motion that cannot leave the main thread', () => {
  it('samples the activity sweep about thirty times a second instead of every frame', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
    const { animation, moves, restore } = stubAnimation()
    try {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
      render(<ThemeProvider theme={createTheme()}><ActivityStatus label="Agent running" /></ThemeProvider>)
      expect(screen.getByRole('status').textContent).toBe('Agent running')
      expect(animation.playState).toBe('paused')
      vi.advanceTimersByTime(1000)
      // Sixty frames went by; the sweep was moved on a thirtieth-of-a-second clock instead.
      const steps = moves.filter((value, index) => index === 0 || value !== moves[index - 1])
      expect(steps.length).toBeGreaterThanOrEqual(29)
      expect(steps.length).toBeLessThanOrEqual(32)
      expect(steps.at(-1)).toBeGreaterThanOrEqual(960)
      for (let index = 1; index < steps.length; index++) expect(steps[index] - steps[index - 1]).toBeGreaterThanOrEqual(30)
    } finally {
      restore()
      vi.useRealTimers()
    }
  })

  it('draws each loading dot on its own surface so its light can breathe on the compositor', () => {
    render(<ThemeProvider theme={createTheme()}><LoadingDots /></ThemeProvider>)
    const surfaces = document.querySelectorAll('svg')
    expect(surfaces).toHaveLength(8)
    for (const surface of surfaces) {
      expect(surface.getAttribute('aria-hidden')).toBe('true')
      expect(surface.querySelectorAll('circle')).toHaveLength(1)
    }
    // Eight lights, one ring: the geometry has not moved off its circle.
    const centres = Array.from(surfaces).map((surface) => {
      const circle = surface.querySelector('circle')!
      return Math.hypot(Number(circle.getAttribute('cx')) - 12, Number(circle.getAttribute('cy')) - 12)
    })
    for (const radius of centres) expect(radius).toBeCloseTo(9.5, 6)
  })
})
