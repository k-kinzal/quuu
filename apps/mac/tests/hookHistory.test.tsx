// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ThemeProvider } from '@design-system/react'
import { contract } from '../src/api/contract.js'
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
const readLog = vi.fn(() => ({ run, output: 'Working tree clean', messages: [] }))
const cancel = vi.fn()
const retry = vi.fn<(id: string) => HookRun>(() => run)
const reveal = vi.fn()

beforeEach(() => {
  queryClient.clear()
  vi.clearAllMocks()
  readLog.mockImplementation(() => ({ run, output: 'Working tree clean', messages: [] }))
  window.matchMedia = query => ({ matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', { configurable: true, value: createRouterClient({
    hooks: { log: os.hooks.log.handler(() => readLog()), cancel: os.hooks.cancel.handler(({ input }) => { cancel(input) }), retry: os.hooks.retry.handler(({ input }) => retry(input)) },
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
  expect(screen.queryByRole('button', { name: t('hooks.openLog') })).toBeNull()
  expect(readLog).not.toHaveBeenCalled()
  const trigger = screen.getByRole('button', { name: /Auto commit/ })
  fireEvent.click(trigger)
  expect(await screen.findByText('Working tree clean')).toBeTruthy()
  expect(document.getElementById(trigger.getAttribute('aria-controls')!)?.textContent).toContain(run.input)
  fireEvent.click(screen.getByRole('button', { name: t('hooks.retry') }))
  await waitFor(() => expect(retry).toHaveBeenCalledWith(run.id))
  fireEvent.click(screen.getByRole('button', { name: t('hooks.openLog') }))
  await waitFor(() => expect(reveal).toHaveBeenCalledWith(run.logPath))
  fireEvent.click(trigger)
  await waitFor(() => expect(screen.queryByText(run.input)).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: new RegExp(t('hooks.reportName')) }))
  expect(await screen.findByText(t('hooks.reportSummary.ready'))).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: t('hooks.openLog') }))
  await waitFor(() => expect(reveal).toHaveBeenCalledWith(report.logPath))
})

it('orders auxiliary executions forward in the chat, including the report', () => {
  const last = { ...run, id: 'hook-2', name: 'After report', createdAt: '2026-09-28T01:03:00Z' }
  render(transcript([last, run]))
  expect(screen.getAllByRole('button', { expanded: false }).map(button => button.title)).toEqual([run.name, t('hooks.reportName'), last.name])
})

it('refreshes final output while preserving an open execution after it stops', async () => {
  const running = { ...run, status: 'running' as const, endedAt: null }
  readLog.mockReturnValue({ run, output: 'In progress', messages: [] })
  const ui = render(transcript([running], null))
  fireEvent.click(screen.getByRole('button', { name: /Auto commit/ }))
  expect(await screen.findByText('In progress')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: t('hooks.cancel') }))
  await waitFor(() => expect(cancel).toHaveBeenCalledWith(run.id))
  readLog.mockReturnValue({ run, output: 'Final output', messages: [] })
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
  readLog.mockReturnValue({ run, output: '', messages: [] })
  render(transcript([{ ...run, status: 'failed', error: 'Command exited with code 1' }], { ...report, status: 'failed', error: 'Generator could not start' }))
  expect(screen.getAllByRole('button', { name: new RegExp(t('hooks.status.failed')) })).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: /Auto commit/ }))
  expect(await screen.findByText(t('hooks.noOutput'))).toBeTruthy()
  expect(screen.queryByText(t('hooks.waitingOutput'))).toBeNull()
  expect(screen.getByText('Command exited with code 1')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: new RegExp(t('hooks.reportName')) }))
  expect(await screen.findByText('Generator could not start')).toBeTruthy()
})
