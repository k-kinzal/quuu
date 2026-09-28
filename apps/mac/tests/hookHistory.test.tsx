// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@design-system/react'
import { contract } from '../src/api/contract.js'
import type { AuxiliaryPage, AuxiliaryPageInput } from '../src/api/schemas/auxiliary.js'
import type { HookRun } from '../src/api/schemas/hooks.js'
import type { TaskReport } from '../src/api/schemas/report.js'
import { HookTranscript } from '../src/renderer/src/components/HookHistory.js'
import { t } from '../src/renderer/src/model/i18n/index.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'

const run: HookRun = {
  id: 'hook-1', taskId: 'task-1', taskTitle: 'Improve the conversation', projectId: 'project-1', hookId: 'commit',
  name: 'Auto commit', event: 'stopped', kind: 'command', status: 'succeeded', cwd: '/tmp/project', input: 'git status --short',
  agentId: null, createdAt: '2026-09-28T01:00:00Z', startedAt: '2026-09-28T01:00:00Z', endedAt: '2026-09-28T01:00:10Z',
  exitCode: 0, error: '', logPath: '/tmp/hook-1.log'
}
const report: TaskReport = { taskId: run.taskId, status: 'ready', revision: 'head', path: '/tmp/report.html', logPath: '/tmp/report.log', error: '', startedAt: '2026-09-28T01:01:00Z', endedAt: '2026-09-28T01:02:00Z' }
function page(output = 'Working tree clean', overrides: Partial<AuxiliaryPage> = {}): AuxiliaryPage {
  return { cwd: run.cwd, input: '', structured: false, sessionId: 'auxiliary', logPath: run.logPath,
    exists: true, title: null, messages: output ? [{ id: 'output', role: 'system', isSidechain: false, timestamp: null, model: null, blocks: [{ kind: 'text', text: output }] }] : [],
    totalMessages: output ? 1 : 0, hasMore: false, hasNewer: false, first: 0, last: output ? 1 : 0, generation: 'g1', ...overrides }
}
const readLog = vi.fn<(input: AuxiliaryPageInput) => AuxiliaryPage>(() => page())
const readReport = vi.fn(() => page('Report conversation'))
const cancel = vi.fn()
const retry = vi.fn<(id: string) => HookRun>(() => run)
const reveal = vi.fn()

beforeEach(() => {
  queryClient.clear()
  vi.clearAllMocks()
  readLog.mockImplementation(() => page())
  readReport.mockImplementation(() => page('Report conversation'))
  window.matchMedia = query => ({ matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', { configurable: true, value: createRouterClient({
    hooks: { conversation: os.hooks.conversation.handler(({ input }) => readLog(input)), cancel: os.hooks.cancel.handler(({ input }) => { cancel(input) }), retry: os.hooks.retry.handler(({ input }) => retry(input)) },
    report: { conversation: os.report.conversation.handler(() => readReport()) },
    system: { reveal: os.system.reveal.handler(({ input }) => { reveal(input) }) }
  }) })
})
afterEach(() => { cleanup(); queryClient.clear() })

function transcript(runs = [run], taskReport: TaskReport | null = report, active = true): JSX.Element {
  return <ThemeProvider><HookTranscript history={{ runs, report: taskReport, error: null }} active={active} /></ThemeProvider>
}

it('keeps commands and report actions folded until their own execution is opened', async () => {
  render(transcript())
  expect(screen.getByRole('region', { name: t('hooks.activity') })).toBeTruthy()
  expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(2)
  expect(screen.queryByText(run.input)).toBeNull()
  expect(readLog).not.toHaveBeenCalled()
  const trigger = screen.getByRole('button', { name: /Auto commit/ })
  fireEvent.click(trigger)
  expect(await screen.findByText('Working tree clean')).toBeTruthy()
  expect(document.getElementById(trigger.getAttribute('aria-controls')!)?.textContent).toContain(run.input)
  fireEvent.click(screen.getByRole('button', { name: t('hooks.retry') }))
  await waitFor(() => expect(retry).toHaveBeenCalledWith(run.id))
  expect(readReport).not.toHaveBeenCalled()
  fireEvent.click(trigger)
  await waitFor(() => expect(screen.queryByText(run.input)).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: new RegExp(t('hooks.reportName')) }))
  expect(await screen.findByText(t('hooks.reportSummary.ready'))).toBeTruthy()
  expect(await screen.findByText('Report conversation')).toBeTruthy()
  expect(reveal).not.toHaveBeenCalled()
})

it('orders auxiliary executions forward in the chat, including the report', () => {
  const last = { ...run, id: 'hook-2', name: 'After report', createdAt: '2026-09-28T01:03:00Z' }
  render(transcript([last, run]))
  expect(screen.getAllByRole('button', { expanded: false }).map(button => button.title)).toEqual([run.name, t('hooks.reportName'), last.name])
})

it('refreshes final output while preserving an open execution after it stops', async () => {
  const running = { ...run, status: 'running' as const, endedAt: null }
  readLog.mockReturnValue(page('In progress'))
  const ui = render(transcript([running], null))
  fireEvent.click(screen.getByRole('button', { name: /Auto commit/ }))
  expect(await screen.findByText('In progress')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: t('hooks.cancel') }))
  await waitFor(() => expect(cancel).toHaveBeenCalledWith(run.id))
  readLog.mockReturnValue(page('Final output'))
  ui.rerender(transcript([run], null))
  expect(await screen.findByText('Final output')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Auto commit/, expanded: true })).toBeTruthy()
  expect(screen.queryByRole('button', { name: t('hooks.cancel') })).toBeNull()
})

it('leaves no divider for empty history and does not read logs in a hidden pane', () => {
  const ui = render(transcript([], null))
  expect(screen.queryByRole('region')).toBeNull()
  ui.rerender(transcript([run], null, false))
  fireEvent.click(screen.getByRole('button', { name: /Auto commit/ }))
  expect(readLog).not.toHaveBeenCalled()
})

it('distinguishes a finished empty log from waiting and preserves failure details', async () => {
  readLog.mockReturnValue(page(''))
  render(transcript([{ ...run, status: 'failed', error: 'Command exited with code 1' }], { ...report, status: 'failed', error: 'Generator could not start' }))
  expect(screen.getAllByRole('button', { name: new RegExp(t('hooks.status.failed')) })).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: /Auto commit/ }))
  expect(await screen.findByText(t('hooks.noOutput'))).toBeTruthy()
  expect(screen.queryByText(t('hooks.waitingOutput'))).toBeNull()
  expect(screen.getByText('Command exited with code 1')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: new RegExp(t('hooks.reportName')) }))
  expect(await screen.findByText('Generator could not start')).toBeTruthy()
})


it('pages inside the execution and keeps its messages out of parent chat anchors', async () => {
  readLog.mockImplementation(input => input.before !== undefined
    ? page('Earlier output', { first: 0, last: 80, totalMessages: 160, hasNewer: true })
    : page('Latest output', { first: 80, last: 160, totalMessages: 160, hasMore: true }))
  render(transcript([run], null))
  fireEvent.click(screen.getByRole('button', { name: /Auto commit/ }))
  expect(await screen.findByText('Latest output')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: t('hooks.olderMessages') }))
  expect(await screen.findByText('Earlier output')).toBeTruthy()
  expect(readLog).toHaveBeenLastCalledWith({ id: run.id, before: 80, generation: 'g1' })
  fireEvent.click(screen.getByRole('button', { name: t('hooks.newerMessages') }))
  expect(await screen.findByText('Latest output')).toBeTruthy()
  expect(readLog).toHaveBeenLastCalledWith({ id: run.id, after: 80, generation: 'g1' })
  fireEvent.click(screen.getByRole('button', { name: t('hooks.latestMessages') }))
  await waitFor(() => expect(readLog).toHaveBeenLastCalledWith({ id: run.id }))
  const nested = screen.getByRole('region', { name: t('hooks.conversationLabel', { name: run.name }) })
  expect(within(nested).getByText('Latest output')).toBeTruthy()
  expect(nested.querySelector('[data-chat-item]')).toBeNull()
  expect(reveal).not.toHaveBeenCalled()
})

it('shows an inline read error and retries reading without rerunning the hook', async () => {
  readLog.mockImplementationOnce(() => { throw new Error('Log is temporarily unavailable') })
  render(transcript([run], null))
  fireEvent.click(screen.getByRole('button', { name: /Auto commit/ }))
  expect(await screen.findByText('Log is temporarily unavailable')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: t('hooks.reloadConversation') }))
  expect(await screen.findByText('Working tree clean')).toBeTruthy()
  expect(retry).not.toHaveBeenCalled()
})

it('renders the full tool result in an embedded AI conversation', async () => {
  const result = 'x'.repeat(6500) + ' Final verification passed'
  readLog.mockReturnValue(page('', { structured: true, input: 'Check this change', totalMessages: 1, last: 1,
    messages: [{ id: 'assistant', role: 'assistant', isSidechain: false, timestamp: null, model: null,
      blocks: [{ kind: 'tool', tool: { id: 'tool', name: 'Bash', input: { command: 'npm test' }, target: 'npm test', result, isError: false, images: [] } }] }] }))
  render(transcript([{ ...run, kind: 'agent' }], null))
  fireEvent.click(screen.getByRole('button', { name: /Auto commit/ }))
  fireEvent.click(await screen.findByRole('button', { name: /npm test/ }))
  expect(await screen.findByText(result)).toBeTruthy()
  expect(screen.getByText('Check this change')).toBeTruthy()
})
