// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ThemeProvider } from '@design-system/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { contract } from '../src/api/contract.js'
import type { Agent } from '../src/api/schemas/agents.js'
import type { Project } from '../src/api/schemas/projects.js'
import type { AppSnapshot } from '../src/api/schemas/snapshot.js'
import { AssistantSettings } from '../src/renderer/src/views/settings/AssistantSettings.js'
import { t } from '../src/renderer/src/model/i18n/index.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

const confirm = vi.fn<() => Promise<boolean>>()
const reset = vi.fn<() => string[]>()
const close = vi.fn()
const update = vi.fn<(input: { id: string; patch: Partial<Project> }) => Promise<Project>>()
let content: string
beforeEach(() => {
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
  content = 'Debug memory'
  confirm.mockReset().mockResolvedValue(false)
  reset.mockReset().mockImplementation(() => { content = ''; return ['thread', 'archived'] })
  close.mockReset()
  update.mockReset().mockImplementation(({ id, patch }) => {
    const snapshot = useStore.getState().snapshot!
    const project = { ...snapshot.projects.find(project => project.id === id)!, ...patch }
    useStore.setState({ snapshot: { ...snapshot, projects: snapshot.projects.map(item => item.id === id ? project : item) } })
    return Promise.resolve(project)
  })
  useStore.setState({ snapshot: null, drafts: { 'assistant-channel': 'Debug message', 'task:thread': 'Debug reply', 'task:archived': 'Old reply', 'task:project': 'Keep this' }, cursorTaskId: 'thread', closeDetail: close })
  const os = implement(contract)
  window.quuu = createRouterClient({
    projects: { update: os.projects.update.handler(({ input }) => update(input)) },
    system: { confirm: os.system.confirm.handler(() => confirm()) },
    assistant: {
      state: os.assistant.state.handler(() => ({ settings: { enabled: false, intervalHours: 6, confidenceThreshold: 70 }, activity: 'off', lastCheckAt: null, nextCheckAt: null, error: null, unread: false, threads: [], proposals: [] })),
      memory: os.assistant.memory.handler(() => ({ content, revision: content, bytes: content.length, maxBytes: 16384 })),
      reset: os.assistant.reset.handler(() => reset())
    }
  }) as typeof window.quuu
})
afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks() })
async function show(): Promise<void> {
  render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><AssistantSettings /></ThemeProvider>)
  await screen.findByDisplayValue('Debug memory')
}

it('leaves memory, drafts and conversations intact when the native confirmation is canceled', async () => {
  await show()
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.reset') }))
  await waitFor(() => expect(confirm).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: t('quuuAI.reset') }).disabled).toBe(false))
  expect(reset).not.toHaveBeenCalled()
  expect(screen.getByDisplayValue('Debug memory')).toBeTruthy()
  expect(useStore.getState().drafts['assistant-channel']).toBe('Debug message')
  expect(close).not.toHaveBeenCalled()
})

it('clears the memory editor and only assistant drafts after a confirmed reset', async () => {
  confirm.mockResolvedValue(true)
  await show()
  fireEvent.change(screen.getByDisplayValue('Debug memory'), { target: { value: 'Unsaved debug memory' } })
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.reset') }))
  await screen.findByText(t('quuuAI.resetDone'))
  expect(reset).toHaveBeenCalledOnce()
  expect(screen.queryByDisplayValue('Unsaved debug memory')).toBeNull()
  expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('')
  expect(useStore.getState().drafts).toEqual({ 'task:project': 'Keep this' })
  expect(close).toHaveBeenCalledOnce()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: t('quuuAI.saveMemory') }).disabled).toBe(true)
})

it('keeps the editor and drafts available when an active conversation blocks reset', async () => {
  confirm.mockResolvedValue(true)
  reset.mockImplementation(() => { throw new Error('Wait for conversations to finish.') })
  await show()
  fireEvent.change(screen.getByDisplayValue('Debug memory'), { target: { value: 'Unsaved memory' } })
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.reset') }))
  await screen.findByText(/Wait for conversations/)
  expect(screen.getByDisplayValue('Unsaved memory')).toBeTruthy()
  expect(useStore.getState().drafts['task:thread']).toBe('Debug reply')
  expect(close).not.toHaveBeenCalled()
})

function withTarget(target: Pick<Project, 'targetKind' | 'targetId'> = { targetKind: 'group', targetId: 'frontier' }): void {
  const agent: Agent = { id: 'codex', name: 'Codex', description: '', command: 'true', argsTemplate: [], resumeArgsTemplate: [], env: {}, concurrency: 1,
    fallbackAgentId: null, limitPatterns: [], cooldownSeconds: 0, timeoutSeconds: 0, logAdapter: 'codex', enabled: true, source: 'user', sortOrder: 0, createdAt: '', updatedAt: '' }
  const snapshot: AppSnapshot = {
    projects: [{ id: 'prj_quuu', name: 'QuuuAI', path: '/tmp/quuu-fixture', color: '#7C6CF2', priority: 0, ...target, maxConcurrent: 1, enabled: true,
      deletedAt: null, importSince: null, worktreeMode: 'off', taskHooks: [], editorApp: '', reportEnabled: false, commitIdentityMode: 'off', commitIdentity: { appSlug: '', botUserId: '' },
      pullRequestPromptMode: 'off', pullRequestFailurePrompt: '', pullRequestPendingPrompt: '', pullRequestConflictPrompt: '', pullRequestFailureEnabled: false,
      pullRequestPendingEnabled: false, pullRequestConflictEnabled: false, builtIn: true, source: 'user', sortOrder: 0, createdAt: '', updatedAt: '' }],
    agents: [agent, { ...agent, id: 'disabled', name: 'Disabled agent', enabled: false }, { ...agent, id: 'imported', name: 'Imported agent', source: 'imported' }],
    groups: [{ id: 'frontier', name: 'Frontier Agents', description: '', strategy: 'priority', memberIds: ['codex'], isDefault: true, sortOrder: 0, createdAt: '', updatedAt: '' }],
    tasks: [], rules: [], runs: [],
    scheduler: { running: false, activeRuns: 0, totalSlots: 1, queued: 0, review: 0, failed: 0, agents: [], holds: [], warnings: [], lastTickAt: null }
  }
  useStore.setState({ snapshot })
}

function selectTarget(label: string): void {
  fireEvent.keyDown(screen.getByRole('combobox', { name: t('projectDetail.target') }), { key: 'Enter' })
  fireEvent.click(screen.getByRole('option', { name: label }))
}

it('shows the saved group with suggestions off and saves only the backing project target across reopening', async () => {
  withTarget()
  await show()
  const select = (): HTMLElement => screen.getByRole('combobox', { name: t('projectDetail.target') })
  expect(select()).toHaveTextContent('Frontier Agents')
  expect(select()).toHaveAccessibleDescription(t('quuuAI.targetHint'))
  expect(screen.getByRole('switch', { name: t('quuuAI.proactive') })).not.toBeChecked()
  expect(update).not.toHaveBeenCalled()
  selectTarget('Codex')
  await waitFor(() => expect(select()).toHaveTextContent('Codex'))
  expect(update).toHaveBeenLastCalledWith({ id: 'prj_quuu', patch: { targetKind: 'agent', targetId: 'codex' } })
  cleanup()
  await show()
  expect(select()).toHaveTextContent('Codex')
  selectTarget('Frontier Agents')
  await waitFor(() => expect(select()).toHaveTextContent('Frontier Agents'))
  expect(update).toHaveBeenLastCalledWith({ id: 'prj_quuu', patch: { targetKind: 'group', targetId: 'frontier' } })
})

it('keeps project selection rules for disabled definitions, imported agents and an unassigned target', async () => {
  withTarget({ targetKind: 'agent', targetId: null })
  await show()
  expect(screen.getByRole('combobox')).toHaveTextContent(t('projectDetail.unassigned'))
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
  expect(screen.queryByRole('option', { name: 'Imported agent' })).not.toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Disabled agent' })).not.toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(screen.getByRole('option', { name: 'Disabled agent' }))
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Disabled agent'))
  selectTarget(t('projectDetail.unassigned'))
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent(t('projectDetail.unassigned')))
  expect(update).toHaveBeenLastCalledWith({ id: 'prj_quuu', patch: { targetKind: 'agent', targetId: null } })
})

it.each(['agent', 'group'] as const)('keeps a missing %s visible without replacing the saved value on opening', async targetKind => {
  withTarget({ targetKind, targetId: 'missing' })
  await show()
  const label = t('projectDetail.targetUnavailable', { id: 'missing' })
  expect(screen.getByRole('combobox')).toHaveTextContent(label)
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
  expect(screen.getByRole('option', { name: label })).toHaveAttribute('aria-disabled', 'true')
  expect(update).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('option', { name: 'Codex' }))
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Codex'))
})

it('disables overlapping saves and retains the saved target after failure so the user can retry', async () => {
  withTarget()
  let reject!: (error: Error) => void
  update.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  await show()
  selectTarget('Codex')
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveAttribute('aria-disabled', 'true'))
  expect(screen.getByRole('combobox')).toHaveTextContent('Frontier Agents')
  act(() => reject(new Error('Could not save target.')))
  expect(await screen.findByText('Could not save target.')).toBeVisible()
  expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByRole('combobox')).toHaveTextContent('Frontier Agents')
  selectTarget('Codex')
  await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('Codex'))
  expect(screen.queryByText('Could not save target.')).not.toBeInTheDocument()
})
