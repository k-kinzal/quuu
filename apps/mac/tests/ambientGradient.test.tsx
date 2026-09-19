// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@mui/material/styles'
import { AmbientGradient, createTheme } from '@design-system/react'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function field(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-ambient-gradient]')
  if (!element) throw new Error('Ambient gradient is missing')
  return element
}

describe('ambient window color', () => {
  it('covers the viewport outside transformed panes without entering input or reading order', () => {
    const click = vi.fn()
    render(
      <ThemeProvider theme={createTheme()}>
        <div style={{ transform: 'translateX(10px)', overflow: 'hidden' }}>
          <button onClick={click}>Continue</button>
          <input aria-label="Draft" defaultValue="Keep this text" />
          <AmbientGradient />
        </div>
      </ThemeProvider>
    )
    const overlay = field()
    expect(overlay.parentElement).toBe(document.body)
    expect(overlay.getAttribute('aria-hidden')).toBe('true')
    expect(overlay.querySelector('button, input, [tabindex]')).toBeNull()
    const style = getComputedStyle(overlay)
    expect(style.position).toBe('fixed')
    expect(style.pointerEvents).toBe('none')
    expect(Number(style.opacity)).toBe(0.035)
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Draft' })
    input.focus()
    fireEvent.change(input, { target: { value: 'A continued draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(click).toHaveBeenCalledOnce()
    expect(input.value).toBe('A continued draft')
    expect(document.activeElement).toBe(input)
  })

  it('pauses while hidden and resumes the same lights without replacing the draft', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    render(
      <ThemeProvider theme={createTheme()}>
        <input aria-label="Draft" defaultValue="Unsent text" />
        <AmbientGradient />
      </ThemeProvider>
    )
    const overlay = field()
    const lights = Array.from(overlay.children)
    expect(overlay.hasAttribute('data-paused')).toBe(true)
    hidden.mockReturnValue(false)
    fireEvent(document, new Event('visibilitychange'))
    expect(overlay.hasAttribute('data-paused')).toBe(false)
    hidden.mockReturnValue(true)
    fireEvent(document, new Event('visibilitychange'))
    expect(overlay.hasAttribute('data-paused')).toBe(true)
    expect(Array.from(overlay.children)).toEqual(lights)
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('Unsent text')
  })

  it('releases the window overlay and visibility subscription on unmount', () => {
    const added = vi.spyOn(document, 'addEventListener')
    const removed = vi.spyOn(document, 'removeEventListener')
    const { unmount } = render(<ThemeProvider theme={createTheme()}><AmbientGradient /></ThemeProvider>)
    const subscription = added.mock.calls.find(([name]) => name === 'visibilitychange')
    expect(subscription).toBeDefined()
    unmount()
    expect(document.querySelector('[data-ambient-gradient]')).toBeNull()
    expect(removed).toHaveBeenCalledWith('visibilitychange', subscription?.[1])
  })
})

describe('ambient window motion', () => {
  interface HeldAnimation { playState: 'running' | 'paused'; currentTime: number | null; pause(): void }

  /** jsdom has no CSS animations; hand the field one animation per light and record every attempt to hold or move it. */
  function stubAnimations(): { animations: HeldAnimation[]; writes: number; restore(): void } {
    const animations: HeldAnimation[] = []
    const state = { writes: 0 }
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value(this: Element): HeldAnimation[] {
        if (animations.length === 0) {
          for (const _light of Array.from(this.children)) {
            let held = 0
            animations.push({
              playState: 'running',
              get currentTime() { return held },
              set currentTime(value: number | null) { held = value ?? 0; state.writes++ },
              pause() { this.playState = 'paused' }
            })
          }
        }
        return animations
      }
    })
    return { animations, get writes() { return state.writes }, restore: () => { delete (Element.prototype as { getAnimations?: unknown }).getAnimations } }
  }

  it('leaves the lights to the stylesheet and the compositor instead of stepping them on a timer', () => {
    // Stepping a faint, window-wide field flips every pixel along its colour bands at once, a shimmer.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance'] })
    const stub = stubAnimations()
    try {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
      const { unmount } = render(<ThemeProvider theme={createTheme()}><AmbientGradient /></ThemeProvider>)
      vi.advanceTimersByTime(3000)
      expect(field().children).toHaveLength(5)
      // Nothing took the animations over: none was held, none had its clock moved.
      expect(stub.animations.every((animation) => animation.playState === 'running')).toBe(true)
      expect(stub.writes).toBe(0)
      unmount()
    } finally {
      stub.restore()
      vi.useRealTimers()
    }
  })
})
