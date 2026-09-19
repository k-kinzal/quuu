// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ThemeProvider } from '@design-system/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Task } from '../src/preload/api/tasks.js'
import { TaskWorkspace } from '../src/renderer/src/components/TaskWorkspace.js'
import { NO_FILTERS } from '../src/renderer/src/model/table.js'
import { useStore } from '../src/renderer/src/state/store.js'

// Keep session and terminal lifetimes out of tests for the header's task actions.
vi.mock('../src/renderer/src/components/TaskWorkbench.js', () => ({ TaskWorkbench: () => null }))

const initialState = useStore.getState()
const task: Task = {
  id: 'task-1', projectId: 'project-1', title: 'Review the changes', prompt: '',
  status: 'review', priority: 2, seq: 0, scheduledAt: null, currentRunId: null,
  sessionId: null, agentOverrideId: null, pendingMessage: '', reservedMessage: '',
  reviewNote: '', dependsOn: [], source: 'user', ruleId: null,
  externalKey: null, archived: false, createdAt: '', updatedAt: '', doneAt: null
}
const markDone = vi.fn().mockResolvedValue(undefined)
const enqueue = vi.fn().mockResolvedValue(undefined)
const runNow = vi.fn().mockResolvedValue({ ok: true })
const reopen = vi.fn().mockResolvedValue(undefined)
const cancel = vi.fn().mockResolvedValue(undefined)
const openTask = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    dispatchEvent: () => false
  }))
  vi.stubGlobal('quuu', {
    tasks: { markDone, enqueue, runNow, reopen, cancel },
    runs: { byTask: vi.fn().mockResolvedValue([]) }
  })
  useStore.setState({ ...initialState, openTask })
})

afterEach(() => {
  cleanup()
  useStore.setState(initialState)
  vi.unstubAllGlobals()
})

function show(status: Task['status']): HTMLElement {
  const current = { ...task, status }
  useStore.setState({
    snapshot: {
      projects: [], tasks: [current, { ...task, id: 'task-2', seq: 1 }],
      agents: [], groups: [], rules: [], runs: [],
      scheduler: {
        running: false, activeRuns: 0, totalSlots: 0, queued: 0, review: 0, failed: 0,
        agents: [], holds: [], warnings: [], lastTickAt: null
      }
    },
    section: { kind: 'all' }, filters: NO_FILTERS, table: { sort: null, widths: {} },
    cursorTaskId: current.id, detailOpen: true
  })
  const { container } = render(<ThemeProvider><TaskWorkspace task={current} /></ThemeProvider>)
  return container.querySelector('header')!
}

it.each(['review', 'failed'] as const)(
  'lets a person complete a %s task from the header and advances to the next task',
  async (status) => {
    const header = show(status)
    fireEvent.click(within(header).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(markDone).toHaveBeenCalledWith(task.id))
    await waitFor(() => expect(openTask).toHaveBeenCalledWith('task-2'))
  }
)

it.each(['draft', 'held', 'queued', 'running', 'done'] as const)(
  'keeps the task menu available for a %s task without offering completion',
  (status) => {
    const header = show(status)
    expect(within(header).queryByRole('button', { name: 'Done' })).toBeNull()
    fireEvent.click(within(header).getByRole('button', { name: 'More (actions for this task)' }))
    expect(screen.getByRole('menu', { name: 'Actions for this task' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /^Mark Done/ })).toBeNull()
  }
)

it('opens task actions from the header menu and completes the selected task', async () => {
  const header = show('review')
  const more = within(header).getByRole('button', { name: 'More (actions for this task)' })
  fireEvent.click(more)
  expect(more.getAttribute('aria-expanded')).toBe('true')
  const menu = screen.getByRole('menu', { name: 'Actions for this task' })
  fireEvent.click(within(menu).getByRole('menuitem', { name: /^Mark Done/ }))
  await waitFor(() => expect(markDone).toHaveBeenCalledWith(task.id))
  expect(screen.queryByRole('menu')).toBeNull()
})

it.each([
  { status: 'held', label: 'Add to Queue', operation: enqueue },
  { status: 'queued', label: 'Run Now', operation: runNow },
  { status: 'done', label: 'Reopen', operation: reopen }
] as const)('runs the $status task action directly from the header', async ({ status, label, operation }) => {
  const header = show(status)
  fireEvent.click(within(header).getByRole('button', { name: label }))
  await waitFor(() => expect(operation).toHaveBeenCalledWith(task.id))
})

/*
 * A failed task's only way back used to be "Run Now", which jumps the queue. When a whole group
 * goes down with one account's limit, putting the work back should be the same act as queueing
 * anything else - not taking the next slot away from whatever is already waiting.
 */
it('puts a failed task back in the queue from the header menu', async () => {
  const header = show('failed')
  fireEvent.click(within(header).getByRole('button', { name: 'More (actions for this task)' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Add to Queue' }))
  await waitFor(() => expect(enqueue).toHaveBeenCalledWith(task.id))
})

it('can stop a running task from the header menu', async () => {
  const header = show('running')
  fireEvent.click(within(header).getByRole('button', { name: 'More (actions for this task)' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Cancel' }))
  await waitFor(() => expect(cancel).toHaveBeenCalledWith(task.id))
})
