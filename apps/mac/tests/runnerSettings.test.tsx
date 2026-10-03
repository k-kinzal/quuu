// @vitest-environment jsdom
import { createRouterClient, implement, ORPCError } from '@orpc/server'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    pairing: os.runners.pairing.handler(() => ({ pin: '123456', expiresAt: new Date(Date.now() + 300_000).toISOString(), fingerprint: 'test-fingerprint', urls: [], command: 'docker run quuu-runner' })),
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

it('offers the same sign-in for every agent on a Runner and shows its progress', async () => {
  let status: RunnerStatus = { enabled: true, port: 47833, listening: true, fingerprint: 'fp', error: '', urls: ['https://192.0.2.1:47833'],
    runners: [{ id: 'r1', name: 'Worker', capacity: 1, root: '/tmp/worker', lastSeen: '', revoked: false, online: true, active: 0,
      agents: [{ name: 'codex', command: 'codex', version: '1', auth: 'missing' }, { name: 'claude', command: 'claude', version: '2', auth: 'signedIn' },
        { name: 'cursor-agent', command: 'cursor-agent', version: '3', auth: 'missing' }] },
    { id: 'r2', name: 'Old worker', capacity: 1, root: '/tmp/old', lastSeen: '', revoked: false, online: true, active: 0,
      agents: [{ name: 'codex', command: 'codex', version: '0', auth: 'unknown' }] }] }
  const signIns: Array<{ runnerId: string; agent: string }> = []
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', { configurable: true, value: createRouterClient({ runners: {
    status: os.runners.status.handler(() => status),
    signIn: os.runners.signIn.handler(({ input }) => {
      signIns.push(input)
      status = { ...status, runners: status.runners.map(runner => runner.id === input.runnerId
        ? { ...runner, login: { agent: input.agent, state: 'waiting' as const, error: '' } } : runner) }
      return status
    })
  } }) })
  render(<ThemeProvider><RunnerConnections /></ThemeProvider>)
  for (const name of ['codex', 'cursor-agent']) expect((await screen.findAllByRole('button', { name: t('runnerSettings.signIn', { name }) }))[0]).toBeEnabled()
  expect(screen.getByRole('button', { name: t('runnerSettings.signInAgain', { name: 'claude' }) })).toBeEnabled()
  expect(screen.getAllByRole('button', { name: t('runnerSettings.signIn', { name: 'codex' }) })[1]).toBeDisabled()
  expect(screen.getByText(t('runnerSettings.updateRunner'))).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: t('runnerSettings.signInAgain', { name: 'claude' }) }))
  await waitFor(() => expect(signIns).toEqual([{ runnerId: 'r1', agent: 'claude' }]))
  expect(await screen.findByText(t('runnerSettings.loginWaiting', { name: 'claude' }))).toBeVisible()
  await waitFor(() => expect(screen.getAllByRole('button', { name: t('runnerSettings.signIn', { name: 'codex' }) })[0]).toBeDisabled())
})

it('shows authentication expiry and reauthentication on the affected agent row until the Runner confirms the new login', async () => {
  let status: RunnerStatus = { enabled: true, port: 47833, listening: true, fingerprint: 'fp', error: '', urls: [],
    runners: [{ id: 'rust', name: 'Rust Runner', capacity: 1, root: '/worker', lastSeen: '', revoked: false, online: true, active: 0,
      agents: [{ name: 'claude', command: 'claude', version: '2', auth: 'expired' },
        { name: 'codex', command: 'codex', version: '1', auth: 'signedIn' },
        { name: 'cursor-agent', command: 'cursor-agent', version: '3', auth: 'unverified' }] }] }
  const signIns: Array<{ runnerId: string; agent: string }> = []
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', { configurable: true, value: createRouterClient({ runners: {
    status: os.runners.status.handler(() => status),
    signIn: os.runners.signIn.handler(({ input }) => {
      signIns.push(input)
      status = { ...status, runners: status.runners.map(runner => ({ ...runner, login: { agent: input.agent, state: 'waiting', error: '' } })) }
      return status
    })
  } }) })
  render(<ThemeProvider><RunnerConnections /></ThemeProvider>)
  const claude = within(await screen.findByRole('group', { name: 'claude' }))
  const line = (auth: string) => t('runnerSettings.agentLine', { name: 'claude', version: '2', auth })
  expect(claude.getByText(line(t('runnerSettings.auth.expired')))).toBeVisible()
  expect(claude.getByText(t('runnerSettings.authExpired', { name: 'claude' }))).toBeVisible()
  const retry = claude.getByRole('button', { name: t('runnerSettings.signInAgain', { name: 'claude' }) })
  fireEvent.click(retry)
  await waitFor(() => expect(signIns).toEqual([{ runnerId: 'rust', agent: 'claude' }]))
  expect(await claude.findByText(t('runnerSettings.loginWaiting', { name: 'claude' }))).toBeVisible()
  act(() => {
    status = { ...status, runners: status.runners.map(runner => ({ ...runner, login: { agent: 'claude', state: 'delivering', error: '' } })) }
    queryClient.setQueryData(['runners.status'], status)
  })
  expect(await claude.findByText(t('runnerSettings.loginDelivering'))).toBeVisible()
  expect(claude.getByText(line(t('runnerSettings.auth.expired')))).toBeVisible()
  expect(retry).toBeDisabled()
  act(() => {
    status = { ...status, runners: status.runners.map(runner => ({ ...runner, login: undefined,
      agents: runner.agents.map(agent => agent.name === 'claude' ? { ...agent, auth: 'signedIn' } : agent) })) }
    queryClient.setQueryData(['runners.status'], status)
  })
  expect(await claude.findByText(line(t('runnerSettings.auth.signedIn')))).toBeVisible()
  expect(claude.queryByText(t('runnerSettings.authExpired', { name: 'claude' }))).not.toBeInTheDocument()
  expect(within(screen.getByRole('group', { name: 'codex' })).queryByText(t('runnerSettings.authExpired', { name: 'codex' }))).not.toBeInTheDocument()
  expect(within(screen.getByRole('group', { name: 'cursor-agent' })).getByText(t('runnerSettings.authUnverified'))).toBeVisible()
})
