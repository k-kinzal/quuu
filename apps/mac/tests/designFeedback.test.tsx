// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import {
  CompactComposer,
  NotificationBadge,
  SurfaceTextLine,
  Text,
  ThemeProvider,
  createTheme,
  TranscriptImageFrame,
  DataList, DescriptionList, HistoryChain, ToastStack, AppShellFooter, Toolbar
} from '@design-system/react'
import { Button, SelectionSheet } from '@design-system/react'

beforeEach(() => {
  window.matchMedia = (query) => ({
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
  vi.useRealTimers()
})

describe('display rules fed back from the consuming side', () => {
  it('hides the actions behind a picking surface and reports the result once however fast it is pressed', async () => {
    vi.useFakeTimers()
    const selected = vi.fn()
    const close = vi.fn()
    render(
      <ThemeProvider colorScheme="dark">
        <Button>背後の操作</Button>
        <SelectionSheet
          options={[{ value: 'a', label: '選択肢' }]}
          isSelected={() => false}
          onSelect={selected}
          onClose={close}
          selectedIcon="✓"
          closeLabel="閉じる"
        />
      </ThemeProvider>
    )
    expect(screen.getByRole('dialog', { name: 'Select' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '背後の操作' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '選択肢' }))
    fireEvent.click(screen.getByRole('button', { name: '選択肢' }))
    expect(selected).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTime(500))
    expect(selected).toHaveBeenCalledOnce()
    expect(selected).toHaveBeenCalledWith('a')
    expect(close).toHaveBeenCalledOnce()
  })
  it('makes text and a borderless input follow the same body size for the density', () => {
    for (const density of ['compact', 'comfortable'] as const) {
      const theme = createTheme({ density })
      const { unmount } = render(
        <ThemeProvider density={density} colorScheme="dark">
          <Text size="md">本文</Text>
          <SurfaceTextLine value="入力" onChange={() => undefined} />
        </ThemeProvider>
      )
      expect(getComputedStyle(screen.getByText('本文')).fontSize).toBe(
        `${theme.typography.body1.fontSize}px`
      )
      expect(getComputedStyle(screen.getByRole('textbox')).fontSize).toBe(
        `${theme.typography.body1.fontSize}px`
      )
      unmount()
    }
  })
  it('keeps the send field from sending on whitespace alone, or on the Enter that commits an IME input', () => {
    const send = vi.fn()
    function Form(): JSX.Element {
      const [value, setValue] = useState('  ')
      return (
        <CompactComposer
          value={value}
          onChange={setValue}
          onSend={send}
          placeholder="続きを書く"
          sendIcon="↑"
          sendLabel="送る"
        />
      )
    }
    render(
      <ThemeProvider colorScheme="dark">
        <Form />
      </ThemeProvider>
    )
    const input = screen.getByRole('textbox')
    const button = screen.getByRole('button', { name: '送る' })
    expect(button.hasAttribute('disabled')).toBe(true)
    fireEvent.change(input, { target: { value: '追記' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(send).not.toHaveBeenCalled()
    expect(button.hasAttribute('disabled')).toBe(false)
    fireEvent.click(button)
    expect(send).toHaveBeenCalledOnce()
  })
  it('leaves truncating the notification count and hiding zero to the component', () => {
    const { rerender } = render(
      <ThemeProvider colorScheme="dark">
        <NotificationBadge count={100} />
      </ThemeProvider>
    )
    expect(screen.getByText('99+')).toBeTruthy()
    rerender(
      <ThemeProvider colorScheme="dark">
        <NotificationBadge count={0} />
      </ThemeProvider>
    )
    expect(screen.queryByText('99+')).toBeNull()
  })
  it('passes an image ratio rather than its real size, and fits it to the surface width when expanded', () => {
    const { rerender } = render(
      <ThemeProvider colorScheme="dark">
        <TranscriptImageFrame ratio={2} aria-label="画像" />
      </ThemeProvider>
    )
    expect(getComputedStyle(screen.getByRole('button')).aspectRatio).toBe('2 / 1')
    rerender(
      <ThemeProvider colorScheme="dark">
        <TranscriptImageFrame ratio={2} expanded aria-label="画像" />
      </ThemeProvider>
    )
    expect(getComputedStyle(screen.getByRole('button')).width).toBe('100%')
    expect(screen.getByRole('button').hasAttribute('ratio')).toBe(false)
  })
})


describe('the source of truth for dimensions and the API by purpose', () => {
  it('makes the history detail and the related row share one indentation source', () => {
    render(<ThemeProvider><HistoryChain>関連する履歴</HistoryChain><DataList placement="history" aria-label="詳細"><dt>場所</dt><dd>example</dd></DataList></ThemeProvider>)
    expect(getComputedStyle(screen.getByLabelText('詳細')).paddingLeft).toBe(getComputedStyle(screen.getByText('関連する履歴')).paddingLeft)
    expect(screen.getByLabelText('詳細').hasAttribute('placement')).toBe(false)
  })
  it('chooses a short attribute-name column by purpose, and the padding by the toolbar purpose', () => {
    render(<ThemeProvider><DescriptionList labels="short" aria-label="属性"><dt>名前</dt><dd>Example</dd></DescriptionList><Toolbar placement="panel" aria-label="絞り込み" /></ThemeProvider>)
    const attributes = screen.getByLabelText('属性')
    expect(getComputedStyle(attributes).gridTemplateColumns).toBe('64px 1fr')
    expect(attributes.hasAttribute('labels')).toBe(false)
    expect(getComputedStyle(screen.getByLabelText('絞り込み')).padding).toBe('6px 16px')
  })
  it('makes the toast position follow the height of the bottom band', () => {
    const {container} = render(<ThemeProvider><AppShellFooter>下端</AppShellFooter><ToastStack placement="aboveFooter" toasts={[{id:'notice',tone:'info',message:'変更しました'}]} onSelect={() => undefined}/></ThemeProvider>)
    const footer = screen.getByText('下端')
    const stack = screen.getByRole('status').parentElement!
    expect(getComputedStyle(stack).bottom).toBe(`${parseFloat(getComputedStyle(footer).height) + 8}px`)
    expect(container.querySelector('[placement]')).toBeNull()
  })
})
