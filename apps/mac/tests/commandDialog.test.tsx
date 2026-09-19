// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { CommandDialog } from '../../../packages/design-system/src/components/surfaces/CommandDialog.js'

/**
 * Stacking order of the launcher (⌘T).
 *
 * MUI renders the backdrop and the content as **siblings**. Only the backdrop is
 * positioned; the content is not, so without a z-order on the backdrop it paints
 * later and the veil covers not just the screen but **the launcher itself**
 * (that actually happened). MUI's default backdrop carries a value that avoids
 * this, but swapping it via slots loses it. Being a visual problem, typechecking
 * cannot catch it. Catch it here.
 */
afterEach(cleanup)

beforeAll(() => {
  // jsdom has no color-scheme query; fall back to the default (dark)
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    }) as MediaQueryList
})

function open(): { backdrop: Element; body: HTMLElement } {
  const { getByTestId } = render(
    <ThemeProvider>
      <CommandDialog open onClose={() => undefined}>
        <div data-testid="body">content</div>
      </CommandDialog>
    </ThemeProvider>
  )
  const backdrop = document.querySelector('.MuiModal-backdrop')
  if (!backdrop) throw new Error('backdrop not found')
  return { backdrop, body: getByTestId('body') }
}

describe('command palette shell', () => {
  it('the backdrop lies behind the content (never veil the palette itself)', () => {
    const { backdrop } = open()
    expect(Number(getComputedStyle(backdrop).zIndex)).toBeLessThan(0)
  })

  it('the backdrop is positioned (which is why it needs an explicit send-to-back)', () => {
    const { backdrop } = open()
    expect(getComputedStyle(backdrop).position).toBe('fixed')
  })

  it('the content follows the backdrop as a sibling (document order alone cannot bring it forward)', () => {
    const { backdrop, body } = open()
    expect(backdrop.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  /*
   * Do not return focus to where it was on close.
   *
   * This shell exists to "jump somewhere", so returning focus to the pre-open spot
   * after the jump makes the chosen destination and the hand's location disagree.
   * It is fatal when the pre-open spot was a text field: at the destination, ↑↓ and ⏎
   * belong to the text field and the list cannot be driven.
   */
  it('closing does not return focus to where the hand was before opening (the caller decides the destination)', () => {
    function Harness(): JSX.Element {
      const [open, setOpen] = useState(false)
      return (
        <ThemeProvider>
          <textarea data-testid="opener" onFocus={() => undefined} />
          <button data-testid="toggle" onClick={() => setOpen(!open)}>
            toggle
          </button>
          <CommandDialog open={open} onClose={() => setOpen(false)}>
            <input data-testid="query" />
          </CommandDialog>
        </ThemeProvider>
      )
    }
    const { getByTestId } = render(<Harness />)
    const opener = getByTestId('opener') as HTMLTextAreaElement
    opener.focus()
    expect(document.activeElement).toBe(opener)

    // On open, the palette itself moves focus to the query field (same as the real thing)
    fireEvent.click(getByTestId('toggle'))
    ;(getByTestId('query') as HTMLInputElement).focus()
    expect(document.activeElement).not.toBe(opener)

    fireEvent.click(getByTestId('toggle'))
    expect(document.activeElement).not.toBe(opener)
  })
})
