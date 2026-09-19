// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ContentTabPanel, ContentTabs } from '../../../packages/design-system/src/components/navigation/ContentTabs.js'
import { TerminalView } from '../../../packages/design-system/src/components/data-display/TerminalView.js'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'

// Canvas drawing is checked on a real screen. Here the boundary where xterm actually focuses the input is reproduced.
vi.mock('@xterm/xterm', () => ({ Terminal: class {
  input = document.createElement('textarea')
  parser = { registerOscHandler: () => ({ dispose() {} }) }
  open(element: HTMLElement) { element.append(this.input) }
  loadAddon() {}
  onData() { return { dispose() {} } }
  onResize() { return { dispose() {} } }
  onTitleChange() { return { dispose() {} } }
  focus() { this.input.focus() }
  dispose() { this.input.remove() }
} }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }))
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }))

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  window.matchMedia = (media: string) => ({ matches: false, media, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('does not steal focus from the tabs when another terminal is picked, and walks back and forth with the arrows', () => {
  function Example() {
    const [value, setValue] = useState('one')
    return <ThemeProvider>
      <ContentTabs idBase="terminal" label="端末" value={value} onChange={setValue} options={[{ value: 'one', label: '端末1' }, { value: 'two', label: '端末2' }]} />
      {['one', 'two'].map(key => <ContentTabPanel key={key} idBase="terminal" value={key} activeValue={value}><TerminalView active={value === key} /></ContentTabPanel>)}
    </ThemeProvider>
  }
  render(<Example />)
  // Typing works straight away the first time the surface opens. Focus never moves to a hidden terminal.
  expect(document.activeElement).toBe(screen.getByRole('textbox'))
  const first = screen.getByRole('tab', { name: '端末1' })
  const second = screen.getByRole('tab', { name: '端末2' })
  act(() => first.focus())
  fireEvent.keyDown(first, { key: 'ArrowRight' })
  expect(document.activeElement).toBe(second)
  expect(second.getAttribute('aria-selected')).toBe('true')
  fireEvent.keyDown(second, { key: 'ArrowLeft' })
  expect(document.activeElement).toBe(first)
  expect(first.getAttribute('aria-selected')).toBe('true')
})
