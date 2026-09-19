// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { Resizer, StackResizer } from '../../../packages/design-system/src/components/layout/Resizer.js'
import { restorePaneWidth, paneProfiles } from '@design-system/react/layout-spec'
import { ColumnResizer } from '../../../packages/design-system/src/components/data-display/DataTable.js'

/**
 * A value that can only be changed by grabbing and dragging **does not exist
 * for people without a pointer**.
 *
 * This guarantees pane widths and column widths can be moved with the keyboard.
 * Direction matches the pointer (→ moves the boundary to the right).
 */

afterEach(cleanup)

beforeAll(() => {
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

describe('Pane boundary', () => {
  function setup(props: Partial<Parameters<typeof Resizer>[0]> = {}) {
    const onChange = vi.fn()
    render(
      <ThemeProvider>
        <Resizer value={restorePaneWidth('navigation', 200)} profile="navigation" onChange={onChange} {...props} />
      </ThemeProvider>
    )
    return { handle: screen.getByRole('separator'), onChange }
  }

  it('⇥ reaches it (it exists for people who cannot grab)', () => {
    const { handle } = setup()
    expect(handle.tabIndex).toBe(0)
  })

  it('← → moves the width; with ⇧ held, 1px at a time', () => {
    const { handle, onChange } = setup()
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(208)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(192)
    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(201)
  })

  it('On a right-side pane (inverted), what moves is still the visible line', () => {
    const { handle, onChange } = setup({ invert: true })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(192)
  })

  it('Never leaves the defined range', () => {
    const { handle, onChange } = setup({ value: restorePaneWidth('navigation', 298) })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(300)
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(paneProfiles.navigation.min)
    fireEvent.keyDown(handle, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith(300)
  })
})

describe('Boundary between vertically stacked panes', () => {
  function setup() {
    const onChange = vi.fn()
    const onReset = vi.fn()
    render(
      <ThemeProvider>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div>上</div>
          <StackResizer value={0.5} label="上と下の高さ" onChange={onChange} onReset={onReset} />
          <div>下</div>
        </div>
      </ThemeProvider>
    )
    return { handle: screen.getByRole('separator'), onChange, onReset }
  }

  it('Up/Down arrows change the ratio; Enter restores the default ratio', () => {
    const { handle, onChange, onReset } = setup()
    expect(handle.getAttribute('aria-orientation')).toBe('horizontal')

    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith(0.55)
    fireEvent.keyDown(handle, { key: 'ArrowUp', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(0.49)
    fireEvent.keyDown(handle, { key: 'Enter' })
    expect(onReset).toHaveBeenCalled()
  })

  it("Converts drag distance into a ratio of the two adjacent panes' actual sizes", () => {
    const { handle, onChange } = setup()
    vi.spyOn(handle.previousElementSibling as Element, 'getBoundingClientRect').mockReturnValue({
      height: 200
    } as DOMRect)
    vi.spyOn(handle.nextElementSibling as Element, 'getBoundingClientRect').mockReturnValue({
      height: 200
    } as DOMRect)

    fireEvent.pointerDown(handle, { button: 0, clientY: 100 })
    fireEvent.pointerMove(window, { clientY: 140 })
    expect(onChange).toHaveBeenLastCalledWith(0.6)
    fireEvent.pointerUp(window)
  })
})

describe('Column width handle', () => {
  function setup(onReset?: () => void) {
    const onChange = vi.fn()
    render(
      <ThemeProvider>
        <ColumnResizer value={120} min={40} max={400} onChange={onChange} onReset={onReset} />
      </ThemeProvider>
    )
    return { handle: screen.getByRole('separator'), onChange }
  }

  it('← → moves the column width', () => {
    const { handle, onChange } = setup()
    expect(handle.tabIndex).toBe(0)
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(128)
    fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith(119)
  })

  it('⏎ is the same "reset to default" as a double press', () => {
    const onReset = vi.fn()
    const { handle } = setup(onReset)
    fireEvent.keyDown(handle, { key: 'Enter' })
    expect(onReset).toHaveBeenCalled()
  })
})


describe('Saved pane widths', () => {
  it("Widths within the current range are kept; missing or invalid values fall back to the profile's initial", () => {
    expect(restorePaneWidth('collection', 333)).toBe(333)
    for (const value of [undefined, null, '333', NaN, Infinity]) {
      expect(restorePaneWidth('collection', value)).toBe(paneProfiles.collection.initial)
    }
    expect(restorePaneWidth('navigation', 900)).toBe(paneProfiles.navigation.max)
    expect(restorePaneWidth('inspector', 100)).toBe(paneProfiles.inspector.min)
  })
})
