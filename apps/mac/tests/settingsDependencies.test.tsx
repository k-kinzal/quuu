// @vitest-environment jsdom
import { useState } from 'react'
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { contract } from '../src/api/contract.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { PullRequestPromptFields } from '../src/renderer/src/components/PullRequestPromptFields.js'
import { t } from '../src/renderer/src/model/i18n/index.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { GeneralSettings } from '../src/renderer/src/views/settings/GeneralSettings.js'
import { ReportSettings } from '../src/renderer/src/views/settings/ReportSettings.js'

afterEach(cleanup)
beforeEach(() => {
  useStore.setState({ settings: { ...structuredClone(DEFAULT_SETTINGS), importExternalSessions: false }, snapshot: null })
  window.matchMedia = media => ({ matches: false, media, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', { configurable: true, value: createRouterClient({
    settings: {
      set: os.settings.set.handler(({ input }) => ({ ...DEFAULT_SETTINGS, ...useStore.getState().settings, ...input })),
      previewIdentity: os.settings.previewIdentity.handler(() => ({ slug: '', login: '', email: '', complete: false, current: false, url: '', resolved: null }))
    },
    open: { editors: os.open.editors.handler(() => []) }
  }) })
})

it('requires report activation before choosing a writer or editing instructions, and retains saved instructions', async () => {
  render(<ThemeProvider><ReportSettings /></ThemeProvider>)
  expect(screen.queryByRole('combobox', { name: t('reportSettings.target') })).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  const toggle = screen.getByRole('switch', { name: t('reportSettings.enabled') })
  fireEvent.click(toggle)
  const input = await screen.findByRole('textbox', { name: t('reportSettings.projectInstructions') })
  expect(screen.getByText(t('reportSettings.targetNeeded'))).toBeVisible()
  fireEvent.change(input, { target: { value: 'Evaluate the project goals' } })
  await waitFor(() => expect(useStore.getState().settings?.projectReportInstructions).toBe('Evaluate the project goals'))
  fireEvent.click(toggle)
  await waitFor(() => expect(input).not.toBeVisible())
  fireEvent.click(toggle)
  await waitFor(() => expect(input).toBeVisible())
  expect(input).toHaveValue('Evaluate the project goals')
})

it('only offers import options and the manual action while importing is enabled', async () => {
  render(<ThemeProvider><GeneralSettings /></ThemeProvider>)
  expect(screen.queryByRole('button', { name: t('generalSettings.importNow') })).not.toBeInTheDocument()
  expect(screen.queryByRole('switch', { name: t('generalSettings.importCreateProjects') })).not.toBeInTheDocument()
  const toggle = screen.getByRole('switch', { name: t('generalSettings.importExternal') })
  fireEvent.click(toggle)
  expect(await screen.findByRole('button', { name: t('generalSettings.importNow') })).toBeEnabled()
  const days = screen.getByRole('spinbutton', { name: t('generalSettings.historyDays') })
  fireEvent.change(days, { target: { value: '30' } })
  await waitFor(() => expect(useStore.getState().settings?.importHistoryDays).toBe(30))
  fireEvent.click(toggle)
  await waitFor(() => expect(days).not.toBeVisible())
  fireEvent.click(toggle)
  await waitFor(() => expect(days).toBeVisible())
  expect(days).toHaveValue(30)
})

it.each([true, false])('preserves PR prompt text across activation changes (controlled: %s)', controlled => {
  function Example() {
    const [values, setValues] = useState({ ...DEFAULT_SETTINGS, pullRequestFailureEnabled: false, pullRequestPendingEnabled: false, pullRequestConflictEnabled: false })
    return <ThemeProvider><PullRequestPromptFields id="example" values={values} controlled={controlled} onChange={patch => setValues(current => ({ ...current, ...patch }))} /></ThemeProvider>
  }
  render(<Example />)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  const toggle = screen.getByRole('switch', { name: t('pullRequestSettings.failure') })
  fireEvent.click(toggle)
  const input = screen.getByRole('textbox', { name: t('pullRequestSettings.failure') })
  fireEvent.change(input, { target: { value: 'Investigate and fix the failing checks' } })
  fireEvent.click(toggle)
  expect(input).not.toBeVisible()
  fireEvent.click(toggle)
  expect(input).toBeVisible()
  expect(input).toHaveValue('Investigate and fix the failing checks')
  expect(screen.queryByRole('textbox', { name: t('pullRequestSettings.pending') })).not.toBeInTheDocument()
})
