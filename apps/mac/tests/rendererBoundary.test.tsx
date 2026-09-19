// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@design-system/react'
import { RendererBoundary } from '../src/renderer/src/components/RendererBoundary.js'

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    clear: () => values.clear()
  })
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function BrokenView(): JSX.Element {
  throw new Error('render failed')
}

it('never leaves an empty window on an uncaught render exception, keeping a recovery action and the diagnostics', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)

  render(
    <ThemeProvider colorScheme="dark">
      <RendererBoundary>
        <BrokenView />
      </RendererBoundary>
    </ThemeProvider>
  )

  expect(screen.getByText('The screen could not be displayed')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
  expect(localStorage.getItem('taskd.renderer-error.v1')).toContain('render failed')
})
