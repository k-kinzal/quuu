// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ContentTabPanel, ContentTabs } from '../../../packages/design-system/src/components/navigation/ContentTabs.js'
import { SegmentedControl } from '../../../packages/design-system/src/components/inputs/Toggle.js'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'

afterEach(cleanup)
beforeAll(() => {
  window.matchMedia = (media: string) => ({ matches: false, media, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
})

function TabsExample() {
  const [value, setValue] = useState('first')
  return <ThemeProvider colorScheme="dark">
    <ContentTabs idBase="example" label="文書" value={value} onChange={setValue} options={[
      { value: 'first', label: '最初' }, { value: 'disabled', label: '準備中', disabled: true }, { value: 'last', label: '最後' }
    ]} />
    <ContentTabPanel idBase="example" value="first" activeValue={value}><input aria-label="下書き" /></ContentTabPanel>
    <ContentTabPanel idBase="example" value="last" activeValue={value}>別の内容</ContentTabPanel>
  </ThemeProvider>
}

describe('the shared component for switching content', () => {
  it('does not re-select the content when closing from inside a tab, and returns the hand to the next tab after a Delete close', () => {
    function Example() {
      const [options, setOptions] = useState(['first', 'second', 'last'])
      const [value, setValue] = useState<string | null>('second')
      return <ThemeProvider><ContentTabs idBase="closable" label="文書" appearance="document" value={value}
        options={options.map(value => ({ value, label: value }))} onChange={setValue}
        onClose={target => {
          const next = options.filter(option => option !== target)
          setOptions(next)
          if (target === value) setValue(next[Math.min(options.indexOf(target), next.length - 1)] ?? null)
        }} /></ThemeProvider>
    }
    render(<Example />)
    const first = screen.getByRole('tab', { name: 'first' })
    const closeFirst = screen.getByRole('button', { name: 'Close first' })
    expect(first.parentElement?.contains(closeFirst)).toBe(true)
    expect(closeFirst.parentElement?.closest('button')).toBeNull()
    fireEvent.click(closeFirst)
    const second = screen.getByRole('tab', { name: 'second' })
    expect(second.getAttribute('aria-selected')).toBe('true')
    act(() => second.focus())
    fireEvent.keyDown(second, { key: 'Delete' })
    const last = screen.getByRole('tab', { name: 'last' })
    expect(last.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(last, { key: 'Delete' })
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  it('skips a disabled tab with the arrows and keeps the selection matched to the content', () => {
    render(<TabsExample />)
    const first = screen.getByRole('tab', { name: '最初' })
    const last = screen.getByRole('tab', { name: '最後' })
    act(() => first.focus())
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(last)
    expect(last.getAttribute('aria-selected')).toBe('true')
    const panel = screen.getByRole('tabpanel')
    expect(last.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('aria-labelledby')).toBe(last.id)
    fireEvent.keyDown(last, { key: 'Home' })
    expect(document.activeElement).toBe(first)
    expect(first.getAttribute('tabindex')).toBe('0')
    expect(last.getAttribute('tabindex')).toBe('-1')
    fireEvent.keyDown(first, { key: 'End' })
    expect(document.activeElement).toBe(last)
  })

  it('keeps an input being edited across a round trip between tabs, and takes the hidden surface out of the reading order', () => {
    render(<TabsExample />)
    fireEvent.change(screen.getByRole('textbox', { name: '下書き' }), { target: { value: '書きかけ' } })
    fireEvent.click(screen.getByRole('tab', { name: '最後' }))
    expect(screen.queryByRole('textbox', { name: '下書き' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: '最初' }))
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '下書き' }).value).toBe('書きかけ')
  })

  it('exposes the current value as a radio for a short-value choice and returns the newly picked one', () => {
    function Example() {
      const [value, setValue] = useState<1 | 2>(1)
      return <ThemeProvider><SegmentedControl<1 | 2> label="密度" value={value} onChange={setValue} options={[{ value: 1, label: '簡潔' }, { value: 2, label: '詳細' }]} /></ThemeProvider>
    }
    render(<Example />)
    expect(screen.getByRole('radiogroup', { name: '密度' })).toBeTruthy()
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '簡潔' }).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: '詳細' }))
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '詳細' }).checked).toBe(true)
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '簡潔' }).checked).toBe(false)
  })
})
