// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Select } from '../../../packages/design-system/src/components/inputs/TextInput.js'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'

beforeAll(() => {
  window.matchMedia = media => ({ matches: false, media, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
})
afterEach(cleanup)

const options = [
  { value: '', label: 'Unassigned' },
  { value: 'group', label: 'Team', group: 'Groups' },
  { value: 'alpha', label: 'Alpha', group: 'Individuals' },
  { value: 'beta', label: 'Beta', group: 'Individuals', disabled: true },
  { value: 'gamma', label: 'Gamma', group: 'Individuals' },
  { value: 'jp', label: '日本語の候補', group: 'Individuals' }
]

function show(disabled = false) {
  const changed = vi.fn()
  function Example() {
    const [value, setValue] = useState('alpha')
    return <ThemeProvider><Select aria-label="Target" name="target" value={value} disabled={disabled} options={options}
      onChange={event => { changed(event.target); setValue(event.target.value) }} /></ThemeProvider>
  }
  render(<Example />)
  return { changed, trigger: screen.getByRole('combobox', { name: 'Target' }) }
}

function searchInput() { return screen.getAllByRole<HTMLInputElement>('combobox', { name: 'Target' }).find(element => element.tagName === 'INPUT')! }

describe('searchable single-value dropdowns', () => {
  it('opens from the keyboard, filters by a case-insensitive substring and commits only a listed value', () => {
    const { trigger, changed } = show()
    act(() => trigger.focus())
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const search = searchInput()
    expect(document.activeElement).toBe(search)
    expect(search.value).toBe('')
    fireEvent.change(search, { target: { value: 'AMM' } })
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Gamma'])
    expect(changed).not.toHaveBeenCalled()
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(changed).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenCalledWith({ name: 'target', value: 'gamma' })
    expect(trigger.textContent).toBe('Gamma')
    expect(document.activeElement).toBe(trigger)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('preserves headings, skips disabled options with arrows and rejects clicking them', () => {
    const { trigger, changed } = show()
    fireEvent.mouseDown(trigger, { button: 0 })
    const list = screen.getByRole('listbox')
    expect(within(list).getByText('Groups')).toBeTruthy()
    expect(within(list).getByText('Individuals')).toBeTruthy()
    const beta = screen.getByRole('option', { name: 'Beta' })
    expect(beta.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(beta)
    expect(changed).not.toHaveBeenCalled()
    fireEvent.keyDown(searchInput(), { key: 'ArrowDown' })
    fireEvent.keyDown(searchInput(), { key: 'Enter' })
    expect(changed).toHaveBeenCalledWith({ name: 'target', value: 'gamma' })
  })

  it('keeps the selection on an empty result or Escape and clears the query when reopened', () => {
    const { trigger, changed } = show()
    fireEvent.mouseDown(trigger, { button: 0 })
    fireEvent.change(searchInput(), { target: { value: 'missing' } })
    expect(screen.getByRole('status').textContent).toBe('No matching options')
    fireEvent.keyDown(searchInput(), { key: 'Enter' })
    expect(changed).not.toHaveBeenCalled()
    fireEvent.keyDown(searchInput(), { key: 'Escape' })
    expect(trigger.textContent).toBe('Alpha')
    expect(document.activeElement).toBe(trigger)
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(searchInput().value).toBe('')
    expect(screen.getAllByRole('option')).toHaveLength(options.length)
    fireEvent.keyDown(searchInput(), { key: 'Tab' })
    expect(document.activeElement).toBe(trigger)
    expect(changed).not.toHaveBeenCalled()
  })

  it('waits for Japanese composition to finish before Enter selects', () => {
    const { trigger, changed } = show()
    fireEvent.mouseDown(trigger, { button: 0 })
    fireEvent.change(searchInput(), { target: { value: '日本' } })
    fireEvent.keyDown(searchInput(), { key: 'Enter', isComposing: true })
    fireEvent.keyDown(searchInput(), { key: 'Enter', keyCode: 229 })
    expect(changed).not.toHaveBeenCalled()
    fireEvent.keyDown(searchInput(), { key: 'Enter' })
    expect(changed).toHaveBeenCalledWith({ name: 'target', value: 'jp' })
  })

  it('can select the empty value and closes when the current value is picked again', () => {
    const { trigger, changed } = show()
    fireEvent.mouseDown(trigger, { button: 0 })
    fireEvent.click(screen.getByRole('option', { name: 'Alpha' }))
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(changed).not.toHaveBeenCalled()
    fireEvent.mouseDown(trigger, { button: 0 })
    fireEvent.change(searchInput(), { target: { value: 'unassigned' } })
    fireEvent.keyDown(searchInput(), { key: 'Enter' })
    expect(changed).toHaveBeenCalledWith({ name: 'target', value: '' })
    expect(trigger.textContent).toBe('Unassigned')
  })

  it('does not open a disabled select', () => {
    const { trigger } = show(true)
    fireEvent.mouseDown(trigger, { button: 0 })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes without changing the value when the trigger is pressed again', () => {
    const { trigger, changed } = show()
    fireEvent.mouseDown(trigger, { button: 0 })
    fireEvent.change(searchInput(), { target: { value: 'gamma' } })
    fireEvent.mouseDown(trigger, { button: 0 })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(changed).not.toHaveBeenCalled()
    fireEvent.mouseDown(trigger, { button: 0 })
    expect(searchInput().value).toBe('')
    expect(screen.getAllByRole('option')).toHaveLength(options.length)
  })
})
