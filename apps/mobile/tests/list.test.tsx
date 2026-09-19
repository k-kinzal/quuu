// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '@design-system/react'
import { buildTheme } from '../src/ui/theme.js'
import { ListView } from '../src/views/ListView.js'
import { useStore } from '../src/state/store.js'
import { EMPTY_SNAPSHOT } from '../src/sync/protocol.js'
import { projectView } from '../src/sync/projection.js'

const originalRefresh = useStore.getState().refresh

afterEach(() => {
  cleanup()
  useStore.setState({ refresh: originalRefresh, exportUnavailable: '', phase: 'starting' })
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

/** The folder read fine, but no export is on screen. `exportUnavailable` says whether iCloud holds one. */
function showEmpty(exportUnavailable: string, refresh: (latest?: boolean) => Promise<void>): void {
  useStore.setState({
    phase: 'ready',
    error: '',
    syncError: '',
    rejected: [],
    view: projectView(EMPTY_SNAPSHOT, []),
    exportUnavailable,
    refresh
  })
  render(
    <ThemeProvider colorScheme="dark" density="comfortable" buildTheme={buildTheme}>
      <ListView footer={<></>} />
    </ThemeProvider>
  )
}

/**
 * Nothing from the Mac on screen. **The screen says which side is holding it up.**
 * Blaming the Mac while the file sat in iCloud sent a person to the wrong machine.
 */
describe('the list before any export has been read', () => {
  it('says iCloud holds the export and why it is not here, and offers to sync now', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    showEmpty('Not downloaded from iCloud to this iPhone yet', refresh)

    expect(screen.getByText("Fetching the Mac's export from iCloud")).toBeTruthy()
    expect(screen.getByText('Not downloaded from iCloud to this iPhone yet')).toBeTruthy()
    expect(screen.queryByText('Waiting for the Mac to export')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }))
    expect(refresh, 'the button fetches the newest version, not just a local re-read').toHaveBeenCalledWith(true)
  })

  it('waits for the Mac only when no export exists at all, still leaving a button to press', () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    showEmpty('', refresh)

    expect(screen.getByText('Waiting for the Mac to export')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sync Now' }))
    expect(refresh).toHaveBeenCalledWith(true)
  })
})
