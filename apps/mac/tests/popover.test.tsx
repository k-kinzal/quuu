// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { Menu, useMenu } from '../../../packages/design-system/src/components/surfaces/Menu.js'
import type { MenuItemSpec } from '../../../packages/design-system/src/components/surfaces/Menu.js'

/**
 * **When** a floating surface (a press-to-open menu) closes.
 *
 * It closes when what lies underneath scrolls: the anchor moves away and only the surface is left behind.
 * But **closing on a scroll inside the surface too means content that does not fit can never be seen**.
 * Listening in the capture phase brings both to the same entry point, which makes it hard to spot by eye.
 * A menu with many candidates really did close the moment it scrolled. This catches that.
 */
afterEach(cleanup)

beforeAll(() => {
  // jsdom has no color-scheme query. Fall back to the default (dark)
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => { },
      removeListener: () => { },
      addEventListener: () => { },
      removeEventListener: () => { },
      dispatchEvent: () => false
    }) as MediaQueryList
})

const ITEMS: MenuItemSpec[] = Array.from({ length: 40 }, (_, i) => ({
  label: `候補 ${i}`,
  onSelect: () => undefined
}))

function Harness(): JSX.Element {
  const menu = useMenu()
  return (
    <div data-testid="under">
      <button type="button" onClick={menu.open}>
        開く
      </button>
      <Menu
        open={menu.isOpen}
        anchorEl={menu.anchorEl}
        items={() => ITEMS}
        label="候補"
        onClose={menu.close}
      />
    </div>
  )
}

function open(): HTMLElement {
  render(
    <ThemeProvider>
      <Harness />
    </ThemeProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: '開く' }))
  return screen.getByRole('menu', { name: '候補' })
}

describe('when a press-to-open menu closes', () => {
  it('does not close on a scroll inside the surface (candidates that do not fit stay reachable)', () => {
    const menu = open()
    fireEvent.scroll(menu)
    expect(screen.queryByRole('menu', { name: '候補' })).toBeTruthy()
  })

  it('closes when what lies underneath scrolls (the anchor moves and it is left behind)', () => {
    open()
    fireEvent.scroll(screen.getByTestId('under'))
    expect(screen.queryByRole('menu', { name: '候補' })).toBeNull()
  })
})
