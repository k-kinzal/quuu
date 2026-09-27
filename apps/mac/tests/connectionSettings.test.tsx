// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { contract } from '../src/api/contract.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { t } from '../src/renderer/src/model/i18n/index.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { SettingsShell } from '../src/renderer/src/views/SettingsShell.js'

afterEach(() => { cleanup(); queryClient.clear() })

beforeEach(() => {
  queryClient.clear()
  useStore.setState({ settings: structuredClone(DEFAULT_SETTINGS), settingsCategory: 'connections' })
  window.matchMedia = query => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false
  })
})

function show(error: string | null = null): void {
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', { configurable: true, value: createRouterClient({
    servers: { status: os.servers.status.handler(() => ({
      http: { enabled: true, url: error ? null : 'http://127.0.0.1:43210', error },
      mcp: { enabled: true, url: 'http://127.0.0.1:43211/mcp', error: null },
      connectionFile: '/tmp/quuu/connections.json'
    })) },
    settings: { set: os.settings.set.handler(({ input }) => ({ ...DEFAULT_SETTINGS, ...useStore.getState().settings, ...input })) }
  }) })
  // The app uses its shared query client directly, with no QueryClientProvider.
  render(<ThemeProvider colorScheme="dark"><SettingsShell /></ThemeProvider>)
}

it('opens connection settings, shows actual endpoints and saves independent switches and ports', async () => {
  show()
  expect(await screen.findByText('http://127.0.0.1:43210')).toBeTruthy()
  expect(screen.getByText('http://127.0.0.1:43211/mcp')).toBeTruthy()
  expect(screen.getByText('/tmp/quuu/connections.json')).toBeTruthy()
  fireEvent.click(screen.getByLabelText(t('connectionSettings.enableHttp')))
  await waitFor(() => expect(useStore.getState().settings?.httpEnabled).toBe(false))
  expect(useStore.getState().settings?.mcpEnabled).toBe(true)
  const input = screen.getAllByLabelText(t('connectionSettings.port'))[0]
  fireEvent.change(input, { target: { value: '43212' } })
  fireEvent.blur(input)
  fireEvent.click(screen.getAllByRole('button', { name: t('connectionSettings.apply') })[0])
  await waitFor(() => expect(useStore.getState().settings?.httpPort).toBe(43212))
  expect(useStore.getState().settings?.mcpPort).toBe(0)
})

it('shows a binding failure without claiming that the listener is still starting', async () => {
  show('Port is already in use')
  expect(await screen.findByText('Port is already in use')).toBeTruthy()
  expect(screen.getByText(t('connectionSettings.unavailable'))).toBeTruthy()
  expect(screen.queryByText(t('connectionSettings.starting'))).toBeNull()
  expect(screen.getByText('http://127.0.0.1:43211/mcp')).toBeTruthy()
})
