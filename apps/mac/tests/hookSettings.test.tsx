// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { contract } from '../src/api/contract.js'
import type { Project } from '../src/api/schemas/projects.js'
import { resolveHooks } from '../src/main/hooks/config.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { HookEditor } from '../src/renderer/src/components/HookEditor.js'
import { t } from '../src/renderer/src/model/i18n/index.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { makeProject, memoryDb } from './helpers.js'
import * as repo from '../src/main/db/repo.js'

beforeEach(() => {
  queryClient.clear()
  useStore.setState({ settings: { ...DEFAULT_SETTINGS, taskHooks: [{ id: 'commit', name: 'Auto commit', targetId: 'ai', prompt: 'literal {{diff}}', enabled: false, events: [] }] } })
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
})
afterEach(() => { cleanup(); queryClient.clear() })

it('overrides only project timing and activation while keeping the inherited AI and literal prompt', async () => {
  const db = memoryDb()
  const id = makeProject(db, { name: 'test', targetId: 'ai' })
  let project: Project = repo.getProject(db, id)!
  db.close()
  const os = implement(contract)
  let rerender: () => void = () => {}
  Object.defineProperty(window, 'quuu', { configurable: true, value: createRouterClient({
    hooks: { resolve: os.hooks.resolve.handler(() => resolveHooks(useStore.getState().settings!.taskHooks, project.taskHooks)) },
    projects: { update: os.projects.update.handler(({ input }) => { project = { ...project, ...input.patch }; rerender(); return project }) }
  }) })
  const ui = render(<ThemeProvider colorScheme="dark"><HookEditor project={project} /></ThemeProvider>)
  rerender = () => ui.rerender(<ThemeProvider colorScheme="dark"><HookEditor project={project} /></ThemeProvider>)
  fireEvent.click(await screen.findByRole('button', { name: /Auto commit/ }))
  expect((screen.getByLabelText<HTMLTextAreaElement>(t('hooks.prompt'))).value).toBe('literal {{diff}}')
  expect((screen.getByLabelText<HTMLTextAreaElement>(t('hooks.prompt'))).disabled).toBe(true)
  fireEvent.click(screen.getByLabelText(t('hooks.override', { field: t('hooks.activation') })))
  await waitFor(() => expect((screen.getByLabelText<HTMLInputElement>(t('hooks.enabled'))).disabled).toBe(false))
  fireEvent.click(screen.getByLabelText<HTMLInputElement>(t('hooks.enabled')))
  await waitFor(() => expect(project.taskHooks[0]?.enabled).toBe(true))
  await waitFor(() => expect((screen.getByLabelText<HTMLInputElement>(t('hooks.override', { field: t('hooks.events') }))).disabled).toBe(false))
  fireEvent.click(screen.getByLabelText<HTMLInputElement>(t('hooks.override', { field: t('hooks.events') })))
  await waitFor(() => expect((screen.getByLabelText<HTMLInputElement>(t('hooks.eventsLabels.stopped'))).disabled).toBe(false))
  fireEvent.click(screen.getByLabelText<HTMLInputElement>(t('hooks.eventsLabels.stopped')))
  await waitFor(() => expect(project.taskHooks).toEqual([{ id: 'commit', enabled: true, events: ['stopped'] }]))
  expect(screen.queryByLabelText(t('hooks.builtinReport'))).toBeNull()
  expect(screen.getByText(t('hooks.builtinHint'))).toBeTruthy()
}, 20_000)
