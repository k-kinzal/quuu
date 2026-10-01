// @vitest-environment jsdom
import { createRouterClient, implement, ORPCError } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { contract } from '../src/api/contract.js'
import type { Project, ProjectInput } from '../src/api/types.js'
import type { RunnerStatus } from '../src/api/schemas/runners.js'
import * as repo from '../src/main/db/repo.js'
import { t } from '../src/renderer/src/model/i18n/index.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { ProjectRunnerSettings } from '../src/renderer/src/views/project/ProjectRunnerSettings.js'
import { RunnerConnections } from '../src/renderer/src/views/settings/RunnerConnections.js'
import { makeProject, memoryDb } from './helpers.js'

beforeEach(() => {
  queryClient.clear()
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
})

it('reveals listener setup only while enabled without applying a draft port when switching', async () => {
  let status: RunnerStatus = { enabled: false, port: 47833, listening: false, fingerprint: '', error: '', urls: [], runners: [
    { id: 'r1', name: 'Worker', agents: [], capacity: 1, root: '/tmp/worker', lastSeen: '', revoked: false, online: false, active: 0 }
  ] }
  const changes: Array<{ enabled: boolean; port: number }> = []
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', { configurable: true, value: createRouterClient({ runners: {
    status: os.runners.status.handler(() => status),
    pairing: os.runners.pairing.handler(() => ({ pin: '123456', expiresAt: new Date(Date.now() + 300_000).toISOString(), fingerprint: 'test-fingerprint', urls: [] })),
    configure: os.runners.configure.handler(({ input }) => {
      changes.push(input)
      status = { ...status, ...input, listening: input.enabled }
      return status
    })
  } }) })
  render(<ThemeProvider><RunnerConnections /></ThemeProvider>)
  const toggle = screen.getByRole('switch', { name: t('runnerSettings.enable') })
  await waitFor(() => expect(toggle).toBeEnabled())
  expect(screen.queryByRole('spinbutton', { name: t('runnerSettings.port') })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: t('runnerSettings.revoke') })).toBeEnabled()
  fireEvent.click(toggle)
  const port = await screen.findByRole('spinbutton', { name: t('runnerSettings.port') })
  fireEvent.click(screen.getByRole('button', { name: t('runnerSettings.pair') }))
  expect(await screen.findByText(t('runnerSettings.pin', { pin: '123456' }))).toBeVisible()
  fireEvent.change(port, { target: { value: '47840' } })
  await waitFor(() => expect(toggle).toBeEnabled())
  fireEvent.click(toggle)
  await waitFor(() => expect(port).not.toBeVisible())
  expect(changes.at(-1)).toEqual({ enabled: false, port: 47833 })
  expect(screen.queryByRole('button', { name: t('runnerSettings.pair') })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: t('runnerSettings.revoke') })).toBeEnabled()
  fireEvent.click(toggle)
  await waitFor(() => expect(port).toBeVisible())
  expect(screen.queryByText(t('runnerSettings.pin', { pin: '123456' }))).not.toBeInTheDocument()
  expect(port).toHaveValue(47840)
  fireEvent.click(screen.getByRole('button', { name: t('runnerSettings.apply') }))
  await waitFor(() => expect(changes.at(-1)).toEqual({ enabled: true, port: 47840 }))
})
afterEach(() => { cleanup(); queryClient.clear() })

it('saves required labels independently and can clear the selector without losing a Git remote draft', async () => {
  const db = memoryDb()
  const id = makeProject(db, { name: 'Rust', targetId: 'ai' })
  let project: Project = repo.updateProject(db, id, { runnerLabels: ['linux'], runnerEnabled: true, gitRemote: 'https://example.test/saved.git' })
  db.close()
  const patches: Partial<ProjectInput>[] = []
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', { configurable: true, value: createRouterClient({ projects: {
    update: os.projects.update.handler(({ input }) => { patches.push(input.patch); project = { ...project, ...input.patch }; return project })
  } }) })
  const view = () => <ThemeProvider colorScheme="dark"><ProjectRunnerSettings project={project} /></ThemeProvider>
  const { rerender } = render(view())
  const labels = screen.getByLabelText<HTMLInputElement>(t('runnerSettings.requiredLabels'))
  const remote = screen.getByLabelText<HTMLInputElement>(t('runnerSettings.repository'))
  fireEvent.change(remote, { target: { value: 'https://example.test/draft.git' } })
  fireEvent.change(labels, { target: { value: 'rust, linux, rust, ' } })
  fireEvent.click(screen.getByRole('button', { name: t('runnerSettings.saveLabels') }))
  await waitFor(() => expect(patches).toEqual([{ runnerLabels: ['rust', 'linux'] }]))
  expect(remote.value).toBe('https://example.test/draft.git')
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: t('runnerSettings.saveLabels') }).disabled).toBe(false))
  fireEvent.change(labels, { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: t('runnerSettings.saveLabels') }))
  await waitFor(() => expect(project.runnerLabels).toEqual([]))
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: t('runnerSettings.saveLabels') }).disabled).toBe(false))
  fireEvent.change(labels, { target: { value: 'rust' } })
  fireEvent.click(screen.getByLabelText(t('runnerSettings.allowProject')))
  await waitFor(() => expect(patches.at(-1)).toEqual({ runnerEnabled: false }))
  rerender(view())
  expect(labels).not.toBeVisible()
  expect(screen.queryByRole('button', { name: t('runnerSettings.saveRemote') })).not.toBeInTheDocument()
  expect(project.runnerLabels).toEqual([])
  expect(project.gitRemote).not.toBe('https://example.test/draft.git')
  fireEvent.click(screen.getByLabelText(t('runnerSettings.allowProject')))
  await waitFor(() => expect(patches.at(-1)).toEqual({ runnerEnabled: true }))
  rerender(view())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(labels).toBeVisible()
  expect(labels).toHaveValue('rust')
  expect(remote).toHaveValue('https://example.test/draft.git')
})

it('lets a disabled project configure its required remote before activation and recover from a rejected setup', async () => {
  const db = memoryDb()
  const id = makeProject(db, { name: 'No remote', targetId: 'ai' })
  let project = repo.getProject(db, id)!
  db.close()
  const patches: Partial<ProjectInput>[] = []
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', { configurable: true, value: createRouterClient({ projects: {
    update: os.projects.update.handler(({ input }) => {
      patches.push(input.patch)
      if (input.patch.runnerEnabled && !input.patch.gitRemote) throw new ORPCError('BAD_REQUEST', { message: 'Choose a Git remote' })
      project = { ...project, ...input.patch }
      return project
    })
  } }) })
  const view = () => <ThemeProvider><ProjectRunnerSettings project={project} /></ThemeProvider>
  const { rerender } = render(view())
  const toggle = screen.getByRole('switch', { name: t('runnerSettings.allowProject') })
  fireEvent.click(toggle)
  expect(patches).toEqual([])
  let setup = screen.getByRole('dialog', { name: t('runnerSettings.setupTitle') })
  fireEvent.click(within(setup).getByRole('button', { name: t('runnerSettings.cancelSetup') }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(toggle).not.toBeChecked()
  expect(patches).toEqual([])
  fireEvent.click(toggle)
  setup = screen.getByRole('dialog')
  fireEvent.click(within(setup).getByRole('button', { name: t('runnerSettings.saveAndEnable') }))
  expect(await within(setup).findByText('Choose a Git remote')).toBeVisible()
  expect(project.runnerEnabled).toBe(false)
  fireEvent.change(within(setup).getByRole('textbox', { name: t('runnerSettings.repository') }), { target: { value: 'https://example.test/project.git' } })
  fireEvent.click(within(setup).getByRole('button', { name: t('runnerSettings.saveAndEnable') }))
  await waitFor(() => expect(project.runnerEnabled).toBe(true))
  rerender(view())
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(toggle).toBeChecked()
  expect(screen.getByRole('textbox', { name: t('runnerSettings.repository') })).toHaveValue('https://example.test/project.git')
})
