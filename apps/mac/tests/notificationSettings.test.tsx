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

it('switches notification channels independently', async () => {
  show()
  fireEvent.click(screen.getByLabelText(t('notificationSettings.native')))
  await waitFor(() => expect(useStore.getState().settings?.nativeNotifications).toBe(false))
  fireEvent.click(screen.getByLabelText(t('notificationSettings.sstp')))
  await waitFor(() => expect(useStore.getState().settings?.sstpEnabled).toBe(true))
  expect(useStore.getState().settings?.nativeNotifications).toBe(false)
  expect(useStore.getState().settings?.notifyOnReview).toBe(true)
  expect(useStore.getState().settings?.notifyOnFailure).toBe(true)
})

it('saves several scripts per type and preserves other types and channel preferences', async () => {
  useStore.setState({ settings: { ...structuredClone(DEFAULT_SETTINGS), sstpEnabled: true, nativeNotifications: false } })
  show()
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
})

it('can remove the final script for a type without changing another type', async () => {
  useStore.setState({ settings: { ...structuredClone(DEFAULT_SETTINGS), sstpEnabled: true,
    sstpScripts: { ...structuredClone(DEFAULT_SETTINGS.sstpScripts), review: ['Review script'], failure: ['Failure script'] }
  } })
  show()
  fireEvent.click(screen.getByRole('button', { name: t('notificationSettings.removeScript', { number: 1 }) }))
  fireEvent.click(screen.getByRole('button', { name: t('notificationSettings.save') }))
  await waitFor(() => expect(useStore.getState().settings?.sstpScripts.review).toHaveLength(0))
  expect(useStore.getState().settings?.sstpScripts.failure).toEqual(['Failure script'])
})

it('keeps an invalid settings draft and reports the failed save as an in-app popup', async () => {
  show()
  fireEvent.click(screen.getByRole('switch', { name: t('notificationSettings.sstp') }))
  await screen.findByRole('spinbutton', { name: t('notificationSettings.port') })
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

it('only reveals SSTP configuration while enabled and preserves an unsaved draft across switching', async () => {
  show()
  const toggle = screen.getByRole('switch', { name: t('notificationSettings.sstp') })
  expect(screen.queryByRole('textbox', { name: t('notificationSettings.host') })).not.toBeInTheDocument()
  expect(screen.queryByRole('combobox', { name: t('notificationSettings.kind') })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: t('notificationSettings.save') })).not.toBeInTheDocument()
  fireEvent.click(toggle)
  const host = await screen.findByRole('textbox', { name: t('notificationSettings.host') })
  fireEvent.change(host, { target: { value: 'draft.example' } })
  fireEvent.click(screen.getByRole('button', { name: t('notificationSettings.addScript') }))
  fireEvent.change(screen.getByRole('textbox', { name: t('notificationSettings.script', { number: 1 }) }), { target: { value: 'draft script' } })
  fireEvent.click(toggle)
  await waitFor(() => expect(toggle).not.toBeChecked())
  expect(host).not.toBeVisible()
  expect(screen.queryByRole('button', { name: t('notificationSettings.addScript') })).not.toBeInTheDocument()
  expect(useStore.getState().settings?.sstpHost).toBe('127.0.0.1')
  expect(useStore.getState().settings?.sstpScripts.review).toEqual([])
  fireEvent.click(toggle)
  await waitFor(() => expect(host).toBeVisible())
  expect(host).toHaveValue('draft.example')
  expect(screen.getByRole('textbox', { name: t('notificationSettings.script', { number: 1 }) })).toHaveValue('draft script')
  fireEvent.click(screen.getByRole('button', { name: t('notificationSettings.save') }))
  await waitFor(() => expect(useStore.getState().settings?.sstpHost).toBe('draft.example'))
  expect(useStore.getState().settings?.sstpScripts.review).toEqual(['draft script'])
})
