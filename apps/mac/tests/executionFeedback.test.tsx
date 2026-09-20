// @vitest-environment jsdom
import { ThemeProvider } from '@design-system/react'
import { createRouterClient, implement } from '@orpc/server'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import type { Run } from '../src/preload/api/execution.js'
import type { SessionMessage, SessionSnapshot } from '../src/preload/api/session.js'
import { contract } from '../src/preload/contract.js'
import { ExecutionActivity } from '../src/renderer/src/components/ExecutionActivity.js'
import { Composer } from '../src/renderer/src/components/Composer.js'
import { stdoutToMessages } from '../src/main/session/sessionWatcher.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'
import { executionFeedback } from '../src/renderer/src/model/executionFeedback.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { makeAgent, makeTask, makeProject, memoryDb, occupy } from './helpers.js'

let db: ReturnType<typeof memoryDb>
let run: Run
const session: SessionSnapshot = { sessionId: 's', logPath: null, exists: false, title: null, messages: [], hasMore: false, totalMessages: 0 }
const message = (role: 'user' | 'assistant', timestamp: string | null, text: string): SessionMessage => ({ id: text, role, timestamp, isSidechain: false, model: null, blocks: [{ kind: 'text', text }] })
beforeEach(() => {
  db = memoryDb()
  const agent = makeAgent(db, { name: '検証' })
  const project = makeProject(db, { name: '検証', targetId: agent })
  const task = makeTask(db, project, '応答を確認')
  run = { ...repo.getRun(db, occupy(db, task, agent))!, kind: 'followup', promptPreview: '続きを確認して', startedAt: '2026-09-07T00:00:00.900Z' }
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })
})
afterEach(() => { cleanup(); queryClient.clear(); db.close(); vi.restoreAllMocks() })

it('does not duplicate the launch command into the conversation before the CLI output, while keeping real error output', () => {
  const header = '# Quuu run r1\n# 2026-09-07T00:00:00Z\n# cwd: /tmp\n# cmd: agent "指示\\n続き"\n\n'
  expect(stdoutToMessages(header)).toEqual([])
  expect(stdoutToMessages(header + '認証が必要です\n')[0].blocks).toEqual([{ kind: 'text', text: '認証が必要です\n' }])
  expect(stdoutToMessages('# 別の CLI の出力\n')[0].blocks).toEqual([{ kind: 'text', text: '# 別の CLI の出力\n' }])
})

it('shows activity to prevent a double send when the send response is slow, and keeps the input for a retry when it is refused', async () => {
  const task = repo.getTask(db, run.taskId)!
  let rejectSend: ((result: { ok: false; reason: string }) => void) | undefined
  const send = vi.fn(() => new Promise<{ ok: false; reason: string }>(resolve => { rejectSend = resolve }))
  const client = createRouterClient({ tasks: { send: implement(contract.tasks.send).handler(send) } })
  Object.defineProperty(window, 'quuu', { configurable: true, value: client })
  useStore.setState({ snapshot: null, drafts: {}, toasts: [] })
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><Composer task={task} project={undefined} /></ThemeProvider>)
  const input = screen.getByPlaceholderText<HTMLTextAreaElement>('Write a follow-up...')
  fireEvent.change(input, { target: { value: '追加の指示' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send Later' }))
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
  expect(screen.getByRole('progressbar')).toBeTruthy()
  expect(getComputedStyle(screen.getByRole('button', { name: 'Send Later' })).opacity).toBe('1')
  fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
  expect(send).toHaveBeenCalledTimes(1)
  act(() => { rejectSend?.({ ok: false, reason: '継続先がありません' }) })
  await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull())
  expect(input.value).toBe('追加の指示')
  expect(useStore.getState().toasts[0].detail).toBe('継続先がありません')
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send Later' }).disabled).toBe(false)
})

it('does not mistake the old conversation of a send-back for what arrived this time, and shows the prompt that was sent even before the log exists', () => {
  const old = [message('user', '2026-09-06T00:00:00Z', run.promptPreview), message('assistant', '2026-09-06T00:00:01Z', '前回の結果')]
  render(<ThemeProvider colorScheme="dark"><ExecutionActivity run={run} messages={old} /></ThemeProvider>)
  expect(screen.getByText('Sent')).toBeTruthy()
  expect(screen.getByText(run.promptPreview)).toBeTruthy()
  expect(screen.getByRole('status').textContent).toBe('Agent running')
  expect(screen.queryByRole('button')).toBeNull()
})

it('shows only the activity label once the prompt reaches the log, without timing details or log actions', () => {
  const messages = [message('user', '2026-09-07T00:00:00Z', run.promptPreview), message('assistant', '2026-09-07T00:00:05Z', '実行しています')]
  const { container } = render(<ThemeProvider colorScheme="dark"><ExecutionActivity run={run} messages={messages} /></ThemeProvider>)
  expect(screen.queryByText('Sent')).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('Agent running')
  expect(container.textContent).toBe('Agent running')
  expect(screen.queryByRole('button')).toBeNull()
})

/**
 * Cursor and Grok write no timestamp with a message, so "what this run wrote" cannot be cut out of
 * the conversation by time. Read that way, the copy Quuu shows while the log catches up never gave
 * way to the CLI's own record and the same message stood on screen twice.
 */
it('stops repeating the message it sent once a CLI that writes no timestamps records it', () => {
  const messages = [message('assistant', null, '前回の結果'), message('user', null, run.promptPreview)]
  const { container } = render(<ThemeProvider colorScheme="dark"><ExecutionActivity run={run} messages={messages} /></ThemeProvider>)
  expect(screen.queryByText('Sent')).toBeNull()
  expect(container.textContent).toBe('Agent running')
})

it('keeps the message it sent on screen while a CLI that writes no timestamps has not recorded it', () => {
  const messages = [message('assistant', null, '前回の結果')]
  render(<ThemeProvider colorScheme="dark"><ExecutionActivity run={run} messages={messages} /></ThemeProvider>)
  expect(screen.getByText('Sent')).toBeTruthy()
  expect(screen.getByText(run.promptPreview)).toBeTruthy()
})

it('keeps the running label through log silence and the arrival of a response', () => {
  const tree = (messages: SessionMessage[]) => <ThemeProvider colorScheme="dark"><ExecutionActivity run={{ ...run, source: 'imported' }} messages={messages} /></ThemeProvider>
  const view = render(tree([]))
  expect(screen.getByRole('status').textContent).toBe('Agent running')
  view.rerender(tree([message('assistant', '2026-09-07T00:10:00Z', '作業を続けています')]))
  expect(screen.getByRole('status').textContent).toBe('Agent running')
})

it('distinguishes process startup from running without adding another status line', () => {
  const tree = (status: Run['status']) => <ThemeProvider colorScheme="dark"><ExecutionActivity run={{ ...run, status, source: 'imported' }} messages={[]} /></ThemeProvider>
  const view = render(tree('starting'))
  expect(view.container.textContent).toBe('Starting the agent')
  view.rerender(tree('running'))
  expect(view.container.textContent).toBe('Agent running')
  expect(screen.getAllByRole('status')).toHaveLength(1)
})

it.each(['succeeded', 'failed', 'canceled', 'limited', 'timeout'] as const)('removes the activity and temporary prompt when the run becomes %s', (status) => {
  const tree = (status: Run['status']) => <ThemeProvider colorScheme="dark"><ExecutionActivity run={{ ...run, status }} messages={[]} /></ThemeProvider>
  const view = render(tree('running'))
  expect(screen.getByRole('status')).toBeTruthy()
  view.rerender(tree(status))
  expect(view.container.textContent).toBe('')
  expect(screen.queryByRole('status')).toBeNull()
})

it('does not present the summary of an externally imported run as a prompt sent from Quuu', () => {
  expect(executionFeedback({ ...run, source: 'imported' }, [])).toMatchObject({ active: true, preview: null })
})

it('does not re-show the local copy of a send while this response exists, even when the prompt has fallen outside the loaded range of a long conversation', () => {
  const messages = [message('assistant', '2026-09-07T00:10:00Z', '作業を続けています')]
  expect(executionFeedback(run, messages)).toMatchObject({ active: true, preview: null, label: 'Agent running' })
})

it.each([false, true])('follows the next run only when the latest was being watched (history selected: %s)', async history => {
  const older = { ...run, id: 'older', status: 'succeeded' as const }
  const previous = { ...run, id: 'previous', status: 'succeeded' as const }
  const load = vi.fn(() => session)
  const client = createRouterClient({
    runs: { byTask: implement(contract.runs.byTask).handler(() => [run, previous, older]) },
    session: { load: implement(contract.session.load).handler(load) }
  })
  Object.defineProperty(window, 'quuu', { configurable: true, value: client })
  useStore.setState({ detailOpen: true, cursorTaskId: run.taskId, runs: [previous, older], selectedRunId: history ? older.id : previous.id, session })
  await useStore.getState().refreshRuns(run.taskId)
  expect(useStore.getState().selectedRunId).toBe(history ? older.id : run.id)
  expect(load).toHaveBeenCalledTimes(history ? 0 : 1)
})
