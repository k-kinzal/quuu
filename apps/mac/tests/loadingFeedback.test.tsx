// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Button, IconButton, Spinner, StatusIndicator, ThemeProvider, jaStrings
} from '@design-system/react'

beforeEach(() => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false, media, addEventListener: () => undefined, removeEventListener: () => undefined
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('dotted loading feedback', () => {
  it('announces a named status once and keeps its dots out of the reading order', () => {
    render(<ThemeProvider strings={jaStrings}>
      <Spinner />
      <Spinner label="履歴を読み込み中" />
      <StatusIndicator shape="spinner" tone="info" label="実行中" />
    </ThemeProvider>)
    expect(screen.getByRole('status', { name: '読み込み中' })).toBeTruthy()
    expect(screen.getByRole('status', { name: '履歴を読み込み中' })).toBeTruthy()
    const mark = screen.getByRole('img', { name: '実行中' })
    expect(mark.title).toBe('実行中')
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.queryByRole('progressbar')).toBeNull()
    for (const owner of [...screen.getAllByRole('status'), mark]) {
      expect(owner.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
      expect(owner.querySelector('svg')?.getAttribute('focusable')).toBe('false')
    }
  })

  it('keeps loading buttons named and disabled, then restores them when loading ends', () => {
    const controls = (loading: boolean): JSX.Element => <ThemeProvider strings={jaStrings}>
      <Button loading={loading}>保存</Button>
      <IconButton loading={loading} title="更新" icon="↻" plainTitle />
    </ThemeProvider>
    const { rerender } = render(controls(true))
    for (const name of ['保存', '更新']) {
      const button = screen.getByRole('button', { name })
      expect(button.hasAttribute('disabled')).toBe(true)
      const progress = within(button).getByRole('progressbar', { name })
      expect(progress.hasAttribute('aria-valuenow')).toBe(false)
    }
    rerender(controls(false))
    expect(screen.queryByRole('progressbar')).toBeNull()
    for (const name of ['保存', '更新']) {
      expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(false)
    }
  })

  it('preserves button refs, link semantics, and a caller-provided loading indicator', () => {
    const buttonRef = createRef<HTMLButtonElement>()
    const linkRef = createRef<HTMLAnchorElement>()
    render(<ThemeProvider>
      <Button ref={buttonRef}>Save</Button>
      <Button href="https://example.com" ref={linkRef}>Open</Button>
      <Button loading loadingIndicator={<span role="progressbar" aria-label="Uploading" />}>Upload</Button>
    </ThemeProvider>)
    expect(buttonRef.current).toBe(screen.getByRole('button', { name: 'Save' }))
    expect(linkRef.current).toBe(screen.getByRole('link', { name: 'Open' }))
    expect(linkRef.current?.getAttribute('href')).toBe('https://example.com')
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(screen.getByRole('progressbar', { name: 'Uploading' })).toBeTruthy()
  })
})
