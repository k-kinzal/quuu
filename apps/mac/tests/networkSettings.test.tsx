// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { contract } from '../src/api/contract.js'
import type { NetworkStatus } from '../src/api/schemas/network.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { t } from '../src/renderer/src/model/i18n/index.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { SettingsShell } from '../src/renderer/src/views/SettingsShell.js'

let status: NetworkStatus
const pairs: Array<{ address: string; code: string }> = []

afterEach(() => { cleanup(); queryClient.clear() })
beforeEach(() => {
  queryClient.clear()
  pairs.length = 0
  status = {
    host: { enabled: false, port: 47810, name: 'Studio', addresses: [], error: null, pairing: null, devices: [] },
    satellite: { enabled: true, host: null, state: 'unpaired', error: null, discovered: [{ id: 'h1', name: 'Studio', address: '10.0.0.2:47810' }] }
  }
  useStore.setState({ settings: structuredClone(DEFAULT_SETTINGS), settingsCategory: 'network' })
  window.matchMedia = query => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false
  })
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', { configurable: true, value: createRouterClient({
    network: {
      status: os.network.status.handler(() => status),
      configure: os.network.configure.handler(({ input }) => {
        status = { host: { ...status.host, enabled: input.hostEnabled ?? status.host.enabled, addresses: input.hostEnabled ? ['10.0.0.9:47810'] : [] }, satellite: { ...status.satellite, enabled: input.hostEnabled ? false : status.satellite.enabled } }
        return status
      }),
      openPairing: os.network.openPairing.handler(() => {
        status = { ...status, host: { ...status.host, pairing: { code: '482913', expiresAt: new Date(Date.now() + 300_000).toISOString() } } }
        return status
      }),
      pair: os.network.pair.handler(({ input }) => {
        pairs.push(input)
        status = { ...status, satellite: { ...status.satellite, host: { id: 'h1', name: 'Studio', address: input.address }, state: 'connected' } }
        return status
      })
    }
  }) })
})

function show(): void {
  render(<ThemeProvider colorScheme="dark"><SettingsShell /></ThemeProvider>)
}

it('pairs with a discovered host by its code, and then reports what the window is showing', async () => {
  show()
  fireEvent.click(await screen.findByRole('button', { name: t('networkSettings.choose') }, { timeout: 5_000 }))
  expect(screen.getByLabelText<HTMLInputElement>(t('networkSettings.address')).value).toBe('10.0.0.2:47810')
  fireEvent.change(screen.getByLabelText(t('networkSettings.code')), { target: { value: '123 456' } })
  fireEvent.click(screen.getByRole('button', { name: t('networkSettings.pairWithHost') }))
  await waitFor(() => expect(pairs).toEqual([{ address: '10.0.0.2:47810', code: '123456' }]))
  expect(await screen.findByText(t('networkSettings.connected', { name: 'Studio', address: '10.0.0.2:47810' }))).toBeTruthy()
})

it('turns hosting on and shows the code another computer enters', async () => {
  show()
  const toggle = await screen.findByLabelText(t('networkSettings.enableHost'), {}, { timeout: 5_000 })
  expect(screen.queryByRole('spinbutton', { name: t('networkSettings.port') })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: t('networkSettings.pair') })).not.toBeInTheDocument()
  fireEvent.click(toggle)
  expect(await screen.findByText('10.0.0.9:47810')).toBeTruthy()
  const port = screen.getByRole('spinbutton', { name: t('networkSettings.port') })
  fireEvent.change(port, { target: { value: '47820' } })
  fireEvent.click(screen.getByRole('button', { name: t('networkSettings.pair') }))
  expect(await screen.findByText('482913')).toBeTruthy()
  fireEvent.click(toggle)
  await waitFor(() => expect(port).not.toBeVisible())
  expect(screen.queryByRole('button', { name: t('networkSettings.apply') })).not.toBeInTheDocument()
  fireEvent.click(toggle)
  await waitFor(() => expect(port).toBeVisible())
  expect(port).toHaveValue(47820)
})
