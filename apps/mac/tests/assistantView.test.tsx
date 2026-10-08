// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { act, fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react'
import { ThemeProvider } from '@design-system/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { contract } from '../src/api/contract.js'
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
const proposal = { taskId: 'suggestion', projectId: 'application', title: 'Fix interrupted downloads', prompt: 'Resume partial downloads.', reason: 'Recent sessions show two interruptions.', confidence: 86, status: 'pending' as const, createdAt: task.createdAt, respondedAt: null, executionTaskId: null }
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
const opened = vi.fn()
const read = vi.fn()
beforeEach(() => {
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  sent.mockReset(); reacted.mockReset(); opened.mockReset(); read.mockReset()
  useStore.setState({ snapshot, section: { kind: 'quuuAI' }, cursorTaskId: null, detailOpen: false, drafts: {}, openTask: opened })
  const os = implement(contract)
  window.quuu = createRouterClient({ assistant: {
    send: os.assistant.send.handler(({ input }) => { sent(input); return task }),
    react: os.assistant.react.handler(({ input }) => { reacted(input); return proposal }),
    markRead: os.assistant.markRead.handler(({ input }) => { read(input) }),
  } }) as typeof window.quuu
})
afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function show(): void { render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><AssistantView /></ThemeProvider>) }

it('shows a conversation with thread replies and proposal actions instead of a task table', async () => {
  show()
  expect(screen.queryByRole('table')).toBeNull()
  expect(screen.getByText(proposal.title).closest('details')?.open).toBe(false)
  expect(screen.getByRole('button', { name: t('quuuAI.approve') }).getAttribute('aria-pressed')).toBe('false')
  expect(screen.getByText(task.prompt)).toBeTruthy()
  expect(screen.getByText('I will keep them concise.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.replies', { count: 1 }) }))
  expect(opened).toHaveBeenCalledWith(task.id)
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.approve') }))
  await waitFor(() => expect(reacted).toHaveBeenCalledWith({ taskId: proposal.taskId, reaction: 'approve' }))
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

it.each(['accepted', 'dismissed'] as const)('keeps the %s reaction selected without offering the same action again', status => {
  useStore.setState({ snapshot: { ...snapshot, assistant: { ...snapshot.assistant!, proposals: [{ ...proposal, status }] } } })
  show()
  const chosen = screen.getByRole<HTMLButtonElement>('button', { name: t(status === 'accepted' ? 'quuuAI.approve' : 'quuuAI.dismiss') })
  expect(chosen.getAttribute('aria-pressed')).toBe('true')
  expect(chosen.disabled).toBe(true)
  fireEvent.click(chosen)
  expect(reacted).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: t(status === 'accepted' ? 'quuuAI.dismiss' : 'quuuAI.approve') })).toBeNull()
})
