// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '@design-system/react'
import { buildTheme } from '../src/ui/theme.js'
import { SettingsView } from '../src/views/SettingsView.js'
import { useStore } from '../src/state/store.js'

const originalRefresh = useStore.getState().refresh

afterEach(() => {
  cleanup()
  useStore.setState({ refresh: originalRefresh, refreshing: false, error: '', syncError: '' })
})

beforeAll(() => {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => { },
    removeListener: () => { },
    addEventListener: () => { },
    removeEventListener: () => { },
    dispatchEvent: () => false
  })
})

function show(
  refreshing: boolean,
  refresh: (latest?: boolean) => Promise<void>,
  error = ''
): void {
  useStore.setState({ refreshing, refresh, error: '', syncError: error })
  render(
    <ThemeProvider colorScheme="dark" density="comfortable" buildTheme={buildTheme}>
      <SettingsView footer={<></>} />
    </ThemeProvider>
  )
}

describe('re-syncing from settings', () => {
  it('disables the row until the sync finishes, showing a spinner and the syncing word', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    show(true, refresh)

    const status = screen.getByRole('status', { name: 'Syncing' })
    const button = status.closest('button')
    expect(button).not.toBeNull()
    expect((button as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(button as HTMLButtonElement)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('allows pressing re-sync only while not syncing', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    show(false, refresh)

    const button = screen.getByRole('button', { name: 'Sync Now' })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)
    expect(refresh).toHaveBeenCalledWith(true)
  })

  it('shows the reason when the newest version cannot be fetched', () => {
    show(false, vi.fn().mockResolvedValue(undefined), 'iCloud の最新版を時間内に取得できませんでした')

    const status = screen.getByRole('status')
    expect(status.textContent).toContain("Couldn't sync")
    expect(status.textContent).toContain('最新版を時間内に取得できませんでした')
  })
})
