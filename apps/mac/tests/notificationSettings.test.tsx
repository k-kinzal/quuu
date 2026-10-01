// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { contract } from '../src/api/contract.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { t } from '../src/renderer/src/model/i18n/index.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { NotificationSettings } from '../src/renderer/src/views/settings/NotificationSettings.js'
import { Toasts } from '../src/renderer/src/components/Toasts.js'

afterEach(cleanup)
beforeEach(() => {
  useStore.setState({ settings: structuredClone(DEFAULT_SETTINGS), toasts: [] })
  window.matchMedia = media => ({ matches: false, media, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
  const client = createRouterClient({ settings: { set: implement(contract.settings.set).handler(({ input }) => ({ ...DEFAULT_SETTINGS, ...useStore.getState().settings, ...input })) } })
  Object.defineProperty(window, 'quuu', { configurable: true, value: client })
})
function show() { render(<ThemeProvider><NotificationSettings /><Toasts /></ThemeProvider>) }

it('saves several scripts per type and preserves other types and channel preferences', async () => {
  show()
  fireEvent.click(screen.getByLabelText(t('notificationSettings.native')))
  await waitFor(() => expect(useStore.getState().settings?.nativeNotifications).toBe(false))
  fireEvent.click(screen.getByLabelText(t('notificationSettings.sstp')))
  await waitFor(() => expect(useStore.getState().settings?.sstpEnabled).toBe(true))
  for (let index = 1; index <= 2; index++) {
    fireEvent.click(screen.getByRole('button', { name: t('notificationSettings.addScript') }))
    fireEvent.change(screen.getByLabelText(t('notificationSettings.script', { number: index })), { target: { value: `\\0Review ${index}: {{taskTitle}}\\e` } })
  }
  fireEvent.mouseDown(screen.getByRole('combobox', { name: t('notificationSettings.kind') }))
  fireEvent.click(await screen.findByRole('option', { name: t('notificationSettings.kinds.failure') }))
  fireEvent.click(screen.getByRole('button', { name: t('notificationSettings.addScript') }))
  fireEvent.change(screen.getByLabelText(t('notificationSettings.script', { number: 1 })), { target: { value: '\\0Failed {{message}}\\e' } })
  fireEvent.click(screen.getByRole('button', { name: t('notificationSettings.save') }))
  await waitFor(() => expect(useStore.getState().settings?.sstpScripts.failure).toEqual(['\\0Failed {{message}}\\e']))
  expect(useStore.getState().settings?.sstpScripts.review).toHaveLength(2)
  expect(useStore.getState().settings?.nativeNotifications).toBe(false)
  expect(useStore.getState().settings?.sstpEnabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: t('notificationSettings.removeScript', { number: 1 }) }))
  fireEvent.click(screen.getByRole('button', { name: t('notificationSettings.save') }))
  await waitFor(() => expect(useStore.getState().settings?.sstpScripts.failure).toHaveLength(0))
  expect(useStore.getState().settings?.sstpScripts.review).toHaveLength(2)
})

it('keeps an invalid settings draft and reports the failed save as an in-app popup', async () => {
  show()
  const input = screen.getByLabelText(t('notificationSettings.port'))
  fireEvent.change(input, { target: { value: '70000' } })
  fireEvent.blur(input)
  fireEvent.click(screen.getByRole('button', { name: t('notificationSettings.save') }))
  expect(await screen.findByRole('status')).toBeInTheDocument()
  expect(useStore.getState().toasts).toHaveLength(1)
  expect(useStore.getState().toasts[0]).toMatchObject({ level: 'error' })
  expect(useStore.getState().toasts[0].notificationKind).toBeUndefined()
  expect(useStore.getState().settings?.sstpPort).toBe(9801)
  expect(input).toHaveValue(70000)
  fireEvent.change(input, { target: { value: '9821' } })
  fireEvent.blur(input)
  fireEvent.click(screen.getByRole('button', { name: t('notificationSettings.save') }))
  await waitFor(() => expect(useStore.getState().settings?.sstpPort).toBe(9821))
})
