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
const closed = vi.fn<(input: { taskId: string }) => Promise<AssistantProposal>>()
const revealed = vi.fn()
const opened = vi.fn()
const read = vi.fn()
const saveFiles = vi.fn<(files: { name: string; data: string }[]) => Promise<string[]>>()
beforeEach(() => {
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  sent.mockReset(); reacted.mockReset(); opened.mockReset(); read.mockReset(); created.mockReset(); revealed.mockReset()
  created.mockResolvedValue({ ...proposal, status: 'accepted', executionTaskId: 'execution' })
  closed.mockReset().mockImplementation(() => Promise.resolve({ ...useStore.getState().snapshot!.assistant!.proposals[0], status: 'dismissed' }))
  saveFiles.mockReset().mockResolvedValue(['/tmp/staged/image.png'])
  window.quuuFiles = { getPathForFile: () => '' }
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
    close: os.assistant.close.handler(async ({ input }) => {
      const result = await closed(input)
      updateProposal(result)
      return result
    }),
    markRead: os.assistant.markRead.handler(({ input }) => { read(input) }),
  }, system: { savePromptFiles: os.system.savePromptFiles.handler(({ input }) => saveFiles(input)) } }) as typeof window.quuu
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
  expect(closed).not.toHaveBeenCalled()
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

it.each(['drop', 'paste'] as const)('waits for QuuuAI file %s to finish before sending and attaches it only once', async transfer => {
  let finish!: (paths: string[]) => void
  saveFiles.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  show()
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: t('quuuAI.newMessage') })
  fireEvent.change(input, { target: { value: 'Inspect this image' } })
  input.setSelectionRange(input.value.length, input.value.length)
  const files = [new File(['image bytes'], 'image.png', { type: 'image/png' })]
  const attach = (): boolean => transfer === 'drop'
    ? fireEvent.drop(input, { dataTransfer: { files, types: ['Files'] } })
    : fireEvent.paste(input, { clipboardData: { files } })
  expect(attach()).toBe(false)
  fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
  expect(sent).not.toHaveBeenCalled()
  await waitFor(() => expect(saveFiles).toHaveBeenCalledTimes(1))
  expect(input.readOnly).toBe(true)
  expect(screen.getByRole<HTMLButtonElement>('button', { name: t('quuuAI.send') }).disabled).toBe(true)
  attach()
  expect(saveFiles).toHaveBeenCalledTimes(1)
  act(() => { finish(['/tmp/staged/image.png']) })
  await waitFor(() => expect(input.value).toBe('Inspect this image /tmp/staged/image.png '))
  await waitFor(() => expect(input.readOnly).toBe(false))
  fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
  await waitFor(() => expect(sent).toHaveBeenCalledWith('Inspect this image /tmp/staged/image.png'))
  expect(sent).toHaveBeenCalledTimes(1)
})

it('keeps the QuuuAI draft on attachment failure and leaves text-only transfers to the browser', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  saveFiles.mockRejectedValueOnce(new Error('Cannot read attachment'))
  show()
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: t('quuuAI.newMessage') })
  fireEvent.change(input, { target: { value: 'Keep the request' } })
  expect(fireEvent.paste(input, { clipboardData: { files: [] } })).toBe(true)
  expect(fireEvent.dragOver(input, { dataTransfer: { types: ['text/plain'] } })).toBe(true)
  expect(fireEvent.drop(input, { dataTransfer: { files: [] } })).toBe(true)
  fireEvent.drop(input, { dataTransfer: { files: [new File(['x'], 'unknown.extension')] } })
  expect(await screen.findByText(t('promptFiles.failed'))).toBeTruthy()
  expect(input.value).toBe('Keep the request')
  expect(input.readOnly).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.send') }))
  await waitFor(() => expect(sent).toHaveBeenCalledWith('Keep the request'))
})

it.each(['pending', 'accepted', 'dismissed'] as const)('changes and removes feedback while %s without creating or closing a task', async status => {
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
  expect(closed).not.toHaveBeenCalled()
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
  expect(screen.getByRole<HTMLButtonElement>('button', { name: t('quuuAI.closeProposal') }).disabled).toBe(true)
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
  expect(screen.queryByRole('button', { name: t('quuuAI.closeProposal') })).toBeNull()
  cleanup()
  show()
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.viewTask') }))
  expect(revealed).toHaveBeenCalledWith('execution')
  expect(created).toHaveBeenCalledTimes(1)
  expect(reacted).not.toHaveBeenCalled()
})

it('closes only from the dedicated action, blocks creation while saving and shows the closed receipt after remounting', async () => {
  let finish!: (value: AssistantProposal) => void
  const closing = new Promise<AssistantProposal>(resolve => { finish = resolve })
  closed.mockReturnValueOnce(closing)
  updateProposal({ ...proposal, reaction: 'approve' })
  show()
  const button = screen.getByRole('button', { name: t('quuuAI.closeProposal') })
  expect(button.closest('details')).toBeNull()
  fireEvent.click(button)
  const pending = await screen.findByRole<HTMLButtonElement>('button', { name: t('quuuAI.closing') })
  expect(pending.disabled).toBe(true)
  const create = screen.getByRole<HTMLButtonElement>('button', { name: t('quuuAI.createTask') })
  expect(create.disabled).toBe(true)
  fireEvent.click(create)
  fireEvent.click(pending)
  expect(closed).toHaveBeenCalledTimes(1)
  expect(closed).toHaveBeenCalledWith({ taskId: proposal.taskId })
  cleanup()
  show()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: t('quuuAI.closing') }).disabled).toBe(true)
  expect(screen.getByRole<HTMLButtonElement>('button', { name: t('quuuAI.createTask') }).disabled).toBe(true)
  await act(async () => {
    finish({ ...proposal, status: 'dismissed', reaction: 'approve' })
    await closing
  })
  expect(await screen.findByText(t('quuuAI.closed'))).toBeTruthy()
  cleanup()
  show()
  expect(screen.getByText(t('quuuAI.closed'))).toBeTruthy()
  expect(screen.queryByText(t('quuuAI.created'))).toBeNull()
  expect(screen.queryByRole('button', { name: t('quuuAI.createTask') })).toBeNull()
  expect(screen.queryByRole('button', { name: t('quuuAI.closeProposal') })).toBeNull()
  expect(screen.queryByRole('button', { name: t('quuuAI.viewTask') })).toBeNull()
  expect(screen.getByRole('button', { name: t('quuuAI.like') }).getAttribute('aria-pressed')).toBe('true')
  expect(created).not.toHaveBeenCalled()
  expect(reacted).not.toHaveBeenCalled()
})

it('keeps the proposal pending on close failure and lets the dedicated action retry', async () => {
  closed.mockRejectedValueOnce(new Error('Disk full'))
  updateProposal({ ...proposal, reaction: 'dismiss' })
  show()
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.closeProposal') }))
  expect(await screen.findByText(t('quuuAI.closeFailed', { reason: 'Disk full' }))).toBeTruthy()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: t('quuuAI.createTask') }).disabled).toBe(false)
  expect(screen.queryByText(t('quuuAI.closed'))).toBeNull()
  expect(screen.getByRole('button', { name: t('quuuAI.dislike') }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: t('quuuAI.retryClose') }))
  expect(await screen.findByText(t('quuuAI.closed'))).toBeTruthy()
  expect(screen.queryByText(t('quuuAI.closeFailed', { reason: 'Disk full' }))).toBeNull()
  expect(closed).toHaveBeenCalledTimes(2)
  expect(created).not.toHaveBeenCalled()
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
