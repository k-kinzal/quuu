// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppShell, AppShellBody, GlassPanel, ThemeProvider } from '@design-system/react'

beforeEach(() => {
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })
})
afterEach(cleanup)

function shell(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[data-window-shell]')
  if (!element) throw new Error('The shell is missing')
  return element
}

describe('window glass', () => {
  it('blurs what the page lays behind the glass when the window paints its own ground', () => {
    render(
      <ThemeProvider>
        <AppShell glass data-window-shell="">
          <AppShellBody><GlassPanel aria-label="Navigation" /></AppShellBody>
        </AppShell>
      </ThemeProvider>
    )
    expect(getComputedStyle(document.body).getPropertyValue('--ds-window-glass-filter')).toBe('')
    expect(getComputedStyle(shell()).backdropFilter).toContain('blur(40px)')
  })

  it('leaves the ground to the OS in a translucent window, with no in-page blur pass behind the shell', () => {
    render(
      <ThemeProvider translucent>
        <AppShell glass data-window-shell="">
          <AppShellBody><GlassPanel aria-label="Navigation" /></AppShellBody>
        </AppShell>
      </ThemeProvider>
    )
    expect(getComputedStyle(document.body).getPropertyValue('--ds-window-glass-filter')).toBe('none')
    // jsdom does not resolve var(); the shell reads the variable the theme set to none.
    expect(getComputedStyle(shell()).backdropFilter).toMatch(/^var\(--ds-window-glass-filter,/)
  })
})
