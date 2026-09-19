// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { StringListEditor } from '../src/renderer/src/components/StringListEditor.js'

/**
 * An ordered list of values (an argument template, the Limit patterns).
 *
 * The per-row up / down / delete buttons are gone, replaced by **drag to reorder, add and remove from the container band**.
 * Dragging needs a pointer, so this checks that the keyboard path is still there (rule P-3).
 */

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/**
 * jsdom does not lay a surface out, so the row positions are answered by hand.
 * Where a dragged row lands is derived from **the row pitch**, so only that is provided.
 */
const PITCH = 32
function layOutRows(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const rows = [...document.querySelectorAll('[data-repeat-row]')]
    const index = Math.max(0, rows.indexOf(this.closest('[data-repeat-row]') ?? this))
    const top = index * PITCH
    return {
      x: 0,
      y: top,
      top,
      bottom: top + 28,
      left: 0,
      right: 200,
      width: 200,
      height: 28,
      toJSON: () => ({})
    }
  })
}

beforeAll(() => {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })
})

function Harness({
  initial,
  defaults,
  variables
}: {
  initial: string[]
  defaults?: readonly string[]
  variables?: readonly string[]
}): JSX.Element {
  const [value, setValue] = useState(initial)
  return <StringListEditor noun="引数" value={value} defaults={defaults} variables={variables} onChange={setValue} />
}

const show = (initial: string[], defaults?: readonly string[], variables?: readonly string[]): void => {
  render(
    <ThemeProvider colorScheme="dark">
      <Harness initial={initial} defaults={defaults} variables={variables} />
    </ThemeProvider>
  )
}

const values = (): string[] =>
  screen.getAllByRole('textbox').map((el) => (el as HTMLInputElement).value)

describe('an ordered list of values', () => {
  it('does not line up reorder and delete buttons on a row (the marks gather on the container band)', () => {
    show(['-p', '{{prompt}}'])
    expect(screen.queryByRole('button', { name: 'Move up' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Move down' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add 引数' })).toBeInTheDocument()
  })

  it('adds a row with the + on the band and makes it ready to type into', () => {
    show(['-p'])
    fireEvent.click(screen.getByRole('button', { name: 'Add 引数' }))
    expect(values()).toEqual(['-p', ''])
    expect(document.activeElement).toBe(screen.getAllByRole('textbox')[1])
  })

  it.each([
    { row: 0, expected: ['-p', '', '--', '{{prompt}}'] },
    { row: 1, expected: ['-p', '--', '', '{{prompt}}'] },
    { row: 2, expected: ['-p', '--', '{{prompt}}', ''] }
  ])('inserts after row $row even after focus moves to the + button', ({ row, expected }) => {
    show(['-p', '--', '{{prompt}}'])
    act(() => screen.getAllByRole('textbox')[row].focus())
    const plus = screen.getByRole('button', { name: 'Add 引数' })
    act(() => plus.focus())
    fireEvent.click(plus)

    expect(values()).toEqual(expected)
    expect(document.activeElement).toBe(screen.getAllByRole('textbox')[row + 1])
  })

  it('keeps consecutive additions together after the newly focused row', () => {
    show(['-p', '--', '{{prompt}}'])
    act(() => screen.getAllByRole('textbox')[0].focus())
    const plus = screen.getByRole('button', { name: 'Add 引数' })
    fireEvent.click(plus)
    fireEvent.change(document.activeElement!, { target: { value: '--model' } })
    fireEvent.click(plus)
    fireEvent.change(document.activeElement!, { target: { value: 'opus' } })

    expect(values()).toEqual(['-p', '--model', 'opus', '--', '{{prompt}}'])
  })

  it('inserts a variable after the row selected before opening the menu', () => {
    show(['--resume', '-p', '{{prompt}}'], undefined, ['{{sessionId}}'])
    act(() => screen.getAllByRole('textbox')[0].focus())
    fireEvent.click(screen.getByRole('button', { name: 'Add variable' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '{{sessionId}}' }))

    expect(values()).toEqual(['--resume', '{{sessionId}}', '-p', '{{prompt}}'])
    expect(document.activeElement).toBe(screen.getAllByRole('textbox')[1])
  })

  it('reaches the handle with Tab and reorders with the arrows (movable even without dragging)', () => {
    show(['-p', '{{prompt}}', '--force'])
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder item 1' }), {
      key: 'ArrowDown'
    })
    expect(values()).toEqual(['{{prompt}}', '-p', '--force'])
  })

  it('does not move at the ends (nothing leaves the list)', () => {
    show(['-p', '{{prompt}}'])
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder item 1' }), {
      key: 'ArrowUp'
    })
    expect(values()).toEqual(['-p', '{{prompt}}'])
  })

  it('lets the - on the band remove the row holding the hand, and stays unpressable until the hand is on one', () => {
    show(['-p', '{{prompt}}'])
    const minus = screen.getByRole('button', { name: 'Remove selected 引数' })
    expect(minus).toBeDisabled()

    // In practice a row is selected by pressing it or starting to type (jsdom focus() emits no focusin)
    fireEvent.focusIn(screen.getAllByRole('textbox')[0])
    fireEvent.click(minus)
    expect(values()).toEqual(['{{prompt}}'])
  })

  it('shows the defaults in effect as faint rows when empty (never write "empty means default")', () => {
    show([], ['usage limit', 'rate.?limit'])
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.getByText('usage limit')).toBeInTheDocument()
    expect(screen.queryByText(/no |none|empty/i)).toBeNull()
  })

  it('shows only the container with no prose when it is empty and there are no defaults either', () => {
    show([])
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.queryByText(/no |none|empty/i)).toBeNull()
    expect(screen.getByRole('button', { name: 'Add 引数' })).toBeInTheDocument()
  })

  it('does not rewrite the value while dragging, and changes the order once on release', () => {
    const onChange = vi.fn()
    render(
      <ThemeProvider colorScheme="dark">
        <StringListEditor noun="引数" value={['-p', '{{prompt}}', '--force']} onChange={onChange} />
      </ThemeProvider>
    )
    layOutRows()
    const grip = screen.getByRole('button', { name: 'Reorder item 1' })

    fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientY: 0 })
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: PITCH * 2 })
    // Nothing is swapped mid-drag. A value moving under the hand hides both the landing spot and the origin
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.pointerUp(grip, { pointerId: 1, clientY: PITCH * 2 })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(['{{prompt}}', '--force', '-p'])
  })

  it('does nothing when released at the original position', () => {
    const onChange = vi.fn()
    render(
      <ThemeProvider colorScheme="dark">
        <StringListEditor noun="引数" value={['-p', '{{prompt}}']} onChange={onChange} />
      </ThemeProvider>
    )
    layOutRows()
    const grip = screen.getByRole('button', { name: 'Reorder item 1' })

    fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientY: 0 })
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: 6 })
    fireEvent.pointerUp(grip, { pointerId: 1, clientY: 6 })
    expect(onChange).not.toHaveBeenCalled()
  })
})
