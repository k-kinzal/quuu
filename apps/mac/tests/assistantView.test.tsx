// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { act, fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react'
import { ThemeProvider } from '@design-system/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { contract } from '../src/api/contract.js'
import type { AssistantProposal } from '../src/api/schemas/assistant.js'
import type { AppSnapshot } from '../src/api/schemas/snapshot.js'
import { AssistantView } from '../src/renderer/src/views/AssistantView.js'
import { t } from '../src/renderer/src/model/i18n/index.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

vi.mock('../src/renderer/src/components/Chat.js', () => ({ Chat: () => null }))
vi.mock('../src/renderer/src/components/Composer.js', () => ({ Composer: () => null }))

const task = { id: 'thread', projectId: 'quuu', title: 'Remember my preference', prompt: 'Please keep replies concise.', status: 'review' as const,
  priority: 2 as const, seq: 1, scheduledAt: null, currentRunId: null, sessionId: null, agentOverrideId: null, pendingMessage: '', reservedMessage: '', reviewNote: '', dependsOn: [], source: 'user' as const, ruleId: null, externalKey: null, archived: false, createdAt: '2026-10-08T10:00:00Z', updatedAt: '', doneAt: null }
const proposal: AssistantProposal = { reaction: null, taskId: 'suggestion', projectId: 'application', title: 'Fix interrupted downloads', prompt: 'Resume partial downloads.', reason: 'Recent sessions show two interruptions.', confidence: 86, status: 'pending' as const, createdAt: task.createdAt, respondedAt: null, executionTaskId: null }
const snapshot: AppSnapshot = {
  projects: [{ id: 'quuu', name: 'QuuuAI', path: '/tmp', color: '#7C6CF2', priority: 0, targetKind: 'agent', targetId: 'a1', maxConcurrent: 1, enabled: true, deletedAt: null, importSince: null, worktreeMode: 'off', taskHooks: [], editorApp: '', reportEnabled: false, commitIdentityMode: 'off', commitIdentity: { appSlug: '', botUserId: '' }, pullRequestPromptMode: 'off', pullRequestFailurePrompt: '', pullRequestPendingPrompt: '', pullRequestConflictPrompt: '', pullRequestFailureEnabled: false, pullRequestPendingEnabled: false, pullRequestConflictEnabled: false, builtIn: true, source: 'user', sortOrder: 0, createdAt: '', updatedAt: '' }],
  tasks: [task, { ...task, id: 'suggestion', title: proposal.title, prompt: proposal.prompt, status: 'draft' }],
  agents: [], groups: [], runs: [], rules: [],
  scheduler: { running: true, activeRuns: 0, totalSlots: 1, queued: 0, review: 1, failed: 0, agents: [], holds: [], warnings: [], lastTickAt: null },
  assistant: { settings: { enabled: true, intervalHours: 6, confidenceThreshold: 70 }, activity: 'awaiting-response', lastCheckAt: null, nextCheckAt: null, error: null, unread: false,
    threads: [{ taskId: task.id, preview: 'I will keep them concise.', replies: 1, revision: '1', unread: false }], proposals: [proposal] }
}
const sent = vi.fn()
const reacted = vi.fn()
const created = vi.fn<() => Promise<AssistantProposal>>()
const revealed = vi.fn()
const opened = vi.fn()
const read = vi.fn()
beforeEach(() => {
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  sent.mockReset(); reacted.mockReset(); opened.mockReset(); read.mockReset(); created.mockReset(); revealed.mockReset()
  created.mockResolvedValue({ ...proposal, status: 'accepted', executionTaskId: 'execution' })
  useStore.setState({ snapshot, section: { kind: 'quuuAI' }, cursorTaskId: null, detailOpen: false, drafts: {}, openTask: opened, revealTask: revealed })
  const os = implement(contract)
  window.quuu = createRouterClient({ assistant: {
    send: os.assistant.send.handler(({ input }) => { sent(input); return task }),
    react: os.assistant.react.handler(({ input }) => {
      reacted(input)
      const current = useStore.getState().snapshot!.assistant!.proposals[0]
      const next = { ...current, reaction: input.reaction === 'clear' ? null : input.reaction }
      updateProposal(next)
      return next
    }),
    createTask: os.assistant.createTask.handler(async () => {
      const result = await created()
      updateProposal(result)
      return result
    }),
    markRead: os.assistant.markRead.handler(({ input }) => { read(input) }),
  } }) as typeof window.quuu
})
afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function updateProposal(next: AssistantProposal): void {
  useStore.setState(s => ({ snapshot: { ...s.snapshot!, assistant: { ...s.snapshot!.assistant!, proposals: [next] } } }))
}
function show(): void { render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><AssistantView /></ThemeProvider>) }

it('shows a conversation with thread replies and proposal actions instead of a task table', async () => {
  show()
  expect(screen.queryByRole('table')).toBeNull()
  expect(screen.getByText(proposal.title).closest('details')?.open).toBe(false)
  expect(screen.getByRole('button', { name: t('quuuAI.like') }).getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByText(task.prompt)).toBeTruthy()
  expect(screen.getByText('I will keep them concise.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.replies', { count: 1 }) }))
  expect(opened).toHaveBeenCalledWith(task.id)
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.like') }))
  await waitFor(() => expect(reacted).toHaveBeenCalledWith({ taskId: proposal.taskId, reaction: 'approve' }))
  expect(created).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: t('quuuAI.createTask') })).toBeTruthy()
})

it('keeps Japanese IME commits as input and sends a new thread explicitly', async () => {
  show()
  const input = screen.getByRole('textbox', { name: t('quuuAI.newMessage') })
  fireEvent.change(input, { target: { value: '今日の予定を教えて' } })
  fireEvent.keyDown(input, { key: 'Enter', metaKey: true, isComposing: true })
  expect(sent).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.send') }))
  await waitFor(() => expect(sent).toHaveBeenCalledWith('今日の予定を教えて'))
  await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(''))
})

it('marks an open thread read on focus even when its channel entry is outside the viewport', async () => {
  const offscreen = { ...snapshot.assistant!.threads[0], taskId: 'suggestion', unread: true }
  useStore.setState({ snapshot: { ...snapshot, assistant: { ...snapshot.assistant!, threads: [offscreen] } } })
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
  show()
  expect(read).not.toHaveBeenCalled()
  // The thread opens after the channel has rendered; the observer never reports visibility.
  act(() => useStore.setState({ detailOpen: true, cursorTaskId: 'suggestion' }))
  expect(read).not.toHaveBeenCalled()
  focused.mockReturnValue(true)
  fireEvent.focus(window)
  await waitFor(() => expect(read).toHaveBeenCalledWith({ taskId: 'suggestion', revision: '1' }))
  act(() => useStore.setState({ snapshot: { ...snapshot,
    assistant: { ...snapshot.assistant!, threads: [{ ...offscreen, revision: '2' }] } } }))
  await waitFor(() => expect(read).toHaveBeenCalledWith({ taskId: 'suggestion', revision: '2' }))
})

it.each(['pending', 'accepted'] as const)('changes and removes feedback while %s without creating a task', async status => {
  updateProposal({ ...proposal, status, reaction: 'approve', executionTaskId: status === 'accepted' ? 'execution' : null })
  show()
  const like = screen.getByRole<HTMLButtonElement>('button', { name: t('quuuAI.like') })
  expect(like.getAttribute('aria-pressed')).toBe('true')
  expect(like.disabled).toBe(false)
  fireEvent.click(like)
  await waitFor(() => expect(reacted).toHaveBeenLastCalledWith({ taskId: proposal.taskId, reaction: 'clear' }))
  await waitFor(() => expect(like.getAttribute('aria-pressed')).toBe('false'))
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.dislike') }))
  await waitFor(() => expect(reacted).toHaveBeenLastCalledWith({ taskId: proposal.taskId, reaction: 'dismiss' }))
  await waitFor(() => expect(screen.getByRole('button', { name: t('quuuAI.dislike') }).getAttribute('aria-pressed')).toBe('true'))
  expect(screen.getByText(proposal.reason)).toBeTruthy()
  expect(created).not.toHaveBeenCalled()
})

it('shows creation progress, suppresses repeated clicks, and opens the created task after remounting', async () => {
  let finish!: (value: AssistantProposal) => void
  const creation = new Promise<AssistantProposal>(resolve => { finish = resolve })
  created.mockReturnValueOnce(creation)
  show()
  expect(screen.getByText(proposal.title).closest('details')?.open).toBe(false)
  const button = screen.getByRole('button', { name: t('quuuAI.createTask') })
  expect(button.closest('details')).toBeNull()
  fireEvent.click(button)
  const pending = await screen.findByRole<HTMLButtonElement>('button', { name: t('quuuAI.creating') })
  expect(pending.disabled).toBe(true)
  fireEvent.click(pending)
  expect(created).toHaveBeenCalledTimes(1)
  // Navigation can destroy the original observer while the operation is in flight.
  cleanup()
  show()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: t('quuuAI.creating') }).disabled).toBe(true)
  await act(async () => {
    finish({ ...proposal, status: 'accepted', executionTaskId: 'execution' })
    await creation
  })
  expect(await screen.findByText(t('quuuAI.created'))).toBeTruthy()
  expect(screen.queryByRole('button', { name: t('quuuAI.createTask') })).toBeNull()
  cleanup()
  show()
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.viewTask') }))
  expect(revealed).toHaveBeenCalledWith('execution')
  expect(created).toHaveBeenCalledTimes(1)
  expect(reacted).not.toHaveBeenCalled()
})

it('shows a creation failure and lets the dedicated button retry without changing feedback', async () => {
  created.mockRejectedValueOnce(new Error('Destination unavailable'))
  updateProposal({ ...proposal, reaction: 'dismiss' })
  show()
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.createTask') }))
  expect(await screen.findByText(t('quuuAI.createFailed', { reason: 'Destination unavailable' }))).toBeTruthy()
  expect(screen.getByRole('button', { name: t('quuuAI.dislike') }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.retryCreate') }))
  expect(await screen.findByText(t('quuuAI.created'))).toBeTruthy()
  expect(screen.queryByText(t('quuuAI.createFailed', { reason: 'Destination unavailable' }))).toBeNull()
  expect(created).toHaveBeenCalledTimes(2)
  expect(reacted).not.toHaveBeenCalled()
})
