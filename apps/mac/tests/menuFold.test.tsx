// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { Menu, useMenu } from '../../../packages/design-system/src/components/surfaces/Menu.js'
import type { MenuItemSpec } from '../../../packages/design-system/src/components/surfaces/Menu.js'

/**
 * The **folded remainder** of a press-to-open menu (`MenuItemSpec.more`).
 *
 * With dozens of candidates, listing every one up front makes the one you want unreachable.
 * But cutting it off with just "N more" leaves the candidates in there **unpickable**.
 * That is exactly what happened to picking a preceding task: in a project with many tasks
 * you could not pick one at all. What is checked here is three things: a press reveals them,
 * what is revealed can be picked, and the surface does not close.
 */
afterEach(cleanup)

beforeAll(() => {
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

const chosen = vi.fn()

function items(): MenuItemSpec[] {
  return [
    { label: '見出し', disabled: true },
    {
      label: '候補 0',
      onSelect: () => {
        chosen('候補 0')
      }
    },
    {
      label: 'ほか 3 件を出す',
      more: [1, 2, 3].map((i) => ({
        label: `候補 ${i}`,
        onSelect: () => {
          chosen(`候補 ${i}`)
        }
      }))
    }
  ]
}

function Harness(): JSX.Element {
  const menu = useMenu()
  return (
    <div>
      <button type="button" onClick={menu.open}>
        開く
      </button>
      <Menu
        open={menu.isOpen}
        anchorEl={menu.anchorEl}
        items={items}
        label="候補"
        onClose={menu.close}
      />
    </div>
  )
}

function open(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: '開く' }))
  return screen.getByRole('menu', { name: '候補' })
}

function show(): void {
  chosen.mockReset()
  render(
    <ThemeProvider>
      <Harness />
    </ThemeProvider>
  )
}

describe('opening the folded remainder', () => {
  it('replaces that row with the remainder on a press (the surface stays open)', () => {
    show()
    const menu = open()
    fireEvent.click(within(menu).getByText('ほか 3 件を出す'))

    expect(screen.queryByRole('menu', { name: '候補' })).toBeTruthy()
    expect(within(menu).queryByText('ほか 3 件を出す')).toBeNull()
    expect(within(menu).getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      '見出し',
      '候補 0',
      '候補 1',
      '候補 2',
      '候補 3'
    ])
  })

  it('lets a revealed candidate be picked, and closes once it is', () => {
    show()
    const menu = open()
    fireEvent.click(within(menu).getByText('ほか 3 件を出す'))
    fireEvent.click(within(menu).getByText('候補 3'))

    expect(chosen).toHaveBeenCalledWith('候補 3')
    expect(screen.queryByRole('menu', { name: '候補' })).toBeNull()
  })

  /* The pressed row disappears, so without moving the hand the arrow keys after it stop working */
  it('moves the hand to the head of the remainder (so keys can keep walking it)', () => {
    show()
    const menu = open()
    fireEvent.click(within(menu).getByText('ほか 3 件を出す'))
    expect(document.activeElement?.textContent).toBe('候補 1')

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toBe('候補 2')
  })

  it('returns to the folded shape when reopened (it does not remember the earlier unfold)', () => {
    show()
    const first = open()
    fireEvent.click(within(first).getByText('ほか 3 件を出す'))
    fireEvent.keyDown(first, { key: 'Escape' })

    const again = open()
    expect(within(again).getByText('ほか 3 件を出す')).toBeTruthy()
    expect(within(again).queryByText('候補 3')).toBeNull()
  })
})
