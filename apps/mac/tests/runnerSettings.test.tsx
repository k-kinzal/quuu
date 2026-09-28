// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { contract } from '../src/api/contract.js'
import type { Project, ProjectInput } from '../src/api/types.js'
import * as repo from '../src/main/db/repo.js'
import { t } from '../src/renderer/src/model/i18n/index.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { ProjectRunnerSettings } from '../src/renderer/src/views/project/ProjectRunnerSettings.js'
import { makeProject, memoryDb } from './helpers.js'

beforeEach(() => {
  queryClient.clear()
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
})
afterEach(() => { cleanup(); queryClient.clear() })

it('saves required labels independently and can clear the selector without losing a Git remote draft', async () => {
  const db = memoryDb()
  const id = makeProject(db, { name: 'Rust', targetId: 'ai' })
  let project: Project = repo.updateProject(db, id, { runnerLabels: ['linux'] })
  db.close()
  const patches: Partial<ProjectInput>[] = []
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', { configurable: true, value: createRouterClient({ projects: {
    update: os.projects.update.handler(({ input }) => { patches.push(input.patch); project = { ...project, ...input.patch }; return project })
  } }) })
  render(<ThemeProvider colorScheme="dark"><ProjectRunnerSettings project={project} /></ThemeProvider>)
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
  await waitFor(() => expect(patches.at(-1)).toEqual({ runnerEnabled: true, runnerLabels: ['rust'], gitRemote: 'https://example.test/draft.git' }))
})
