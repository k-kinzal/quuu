// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import type { Project } from '../src/main/projects/types.js'
import type { AppSnapshot } from '../src/main/snapshot.js'
import { addActionStatus, defaultAddAction } from '../src/main/tasks/addAction.js'
import type { Task, TaskInput } from '../src/main/tasks/types.js'
import { contract } from '../src/api/contract.js'
import { TaskComposer } from '../src/renderer/src/components/TaskComposer.js'
import { TaskSidebar } from '../src/renderer/src/components/TaskSidebar.js'
import { TaskOverview } from '../src/renderer/src/components/TaskOverview.js'
import { Rail } from '../src/renderer/src/components/Rail.js'
import { NO_FILTERS } from '../src/renderer/src/model/table.js'
import { t } from '../src/renderer/src/model/i18n/index.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

/**
 * Being able to choose **what happens right after queueing** from the queueing surface.
 *
 * It used to be decided by the written content alone, so "the prompt is written but I do not want
 * it to run yet" and "run it now without waiting its turn" never reached the queueing surface.
 * What is checked here is that the choice **matches what pressing actually does**.
 */

afterEach(cleanup)

beforeAll(() => {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => { },
    removeListener: () => { },
    addEventListener: () => { },
    removeEventListener: () => { },
    dispatchEvent: () => false
  })
})

const PROJECT: Project = {
  id: 'p1',
  name: 'Quuu',
  path: '/Users/me/Projects/taskd',
  color: '#5EABF1',
  priority: 2,
  targetKind: 'agent',
  targetId: 'a1',
  maxConcurrent: 2,
  enabled: true,
  deletedAt: null,
  importSince: null, worktreeMode: 'inherit', taskHooks: [],
  editorApp: '',
  reportEnabled: true,
  pullRequestPromptMode: 'inherit', pullRequestFailurePrompt: '', pullRequestPendingPrompt: '', pullRequestConflictPrompt: '', pullRequestFailureEnabled: false, pullRequestPendingEnabled: false, pullRequestConflictEnabled: false,
  commitIdentityMode: 'inherit',
  commitIdentity: { appSlug: '', botUserId: '' },
  builtIn: false, source: 'user',
  sortOrder: 0,
  createdAt: '',
  updatedAt: ''
}

const CREATED: Task = {
  id: 't1',
  projectId: 'p1',
  title: '新しいタスク',
  prompt: '',
  status: 'draft',
  priority: 2,
  seq: 0,
  scheduledAt: null,
  currentRunId: null,
  sessionId: null,
  agentOverrideId: null,
  pendingMessage: '',
  reservedMessage: '',
  reviewNote: '',
  dependsOn: [],
  source: 'user',
  ruleId: null,
  externalKey: null,
  archived: false,
  createdAt: '',
  updatedAt: '',
  doneAt: null
}

const SNAPSHOT: AppSnapshot = {
  projects: [PROJECT],
  tasks: [],
  rules: [],
  agents: [],
  groups: [],
  runs: [],
  scheduler: {
    running: true,
    activeRuns: 0,
    totalSlots: 1,
    queued: 0,
    review: 0,
    failed: 0,
    agents: [],
    holds: [],
    warnings: [],
    lastTickAt: null
  }
}

const create = vi.fn<(input: TaskInput) => Promise<Task>>()
const runNow = vi.fn<(id: string) => Promise<{ ok: boolean; reason?: string }>>()
const enqueue = vi.fn<(id: string) => Promise<Task>>()

beforeEach(() => {
  create.mockReset().mockImplementation((input: Partial<Task>) =>
    Promise.resolve({ ...CREATED, ...input, dependsOn: input.dependsOn ?? [] })
  )
  runNow.mockReset().mockResolvedValue({ ok: true })
  enqueue.mockReset().mockResolvedValue(CREATED)

  useStore.setState({
    snapshot: SNAPSHOT,
    section: { kind: 'all' },
    filters: NO_FILTERS,
    table: { sort: null, widths: {} },
    cursorTaskId: null,
    drafts: {},
    detailOpen: false,
    toasts: [],
    targetProjectId: null,
    addAction: null
  })
  const os = implement(contract)
  const client = createRouterClient({
    tasks: {
      create: os.tasks.create.handler(({ input }) => create(input)),
      runNow: os.tasks.runNow.handler(({ input }) => runNow(input)),
      enqueue: os.tasks.enqueue.handler(({ input }) => enqueue(input))
    }
  })
  Object.defineProperty(window, 'quuu', { configurable: true, writable: true, value: client })
})

describe('QuuuAI as a dedicated task surface', () => {
  const quuu = { ...PROJECT, id: 'quuu', name: 'QuuuAI', builtIn: true }

  beforeEach(() => {
    useStore.setState({
      snapshot: { ...SNAPSHOT, projects: [PROJECT, quuu] },
      section: { kind: 'quuuAI' },
      targetProjectId: PROJECT.id,
      layout: { ...useStore.getState().layout, railCollapsed: false }
    })
    vi.stubGlobal('ResizeObserver', class {
      observe(): void { }
      unobserve(): void { }
      disconnect(): void { }
    })
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => vi.unstubAllGlobals())

  it('places QuuuAI once above All tasks and keeps it on the collapsed rail', () => {
    const { rerender } = render(<ThemeProvider><Rail /></ThemeProvider>)
    let buttons = screen.getAllByRole('button')
    expect(screen.getAllByRole('button', { name: 'QuuuAI' })).toHaveLength(1)
    expect(buttons.indexOf(screen.getByRole('button', { name: 'QuuuAI' })))
      .toBeLessThan(buttons.indexOf(screen.getByRole('button', { name: /All tasks/ })))
    fireEvent.click(screen.getByRole('button', { name: /All tasks/ }))
    fireEvent.click(screen.getByRole('button', { name: 'QuuuAI' }))
    expect(useStore.getState().section).toEqual({ kind: 'quuuAI' })
    useStore.setState({ layout: { ...useStore.getState().layout, railCollapsed: true } })
    rerender(<ThemeProvider><Rail /></ThemeProvider>)
    buttons = screen.getAllByRole('button')
    expect(buttons).toContain(screen.getByRole('button', { name: 'QuuuAI' }))
  })

  it('invites questions and requests when empty and focuses the QuuuAI composer', () => {
    render(<ThemeProvider buildTheme={buildTheme}>
      <TaskOverview />
      <TaskComposer fixedProjectId={quuu.id} />
    </ThemeProvider>)
    expect(screen.getByText(t('quuuAI.emptyTitle'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ask QuuuAI' }))
    expect(document.activeElement).toBe(screen.getByPlaceholderText(t('quuuAI.placeholder')))
  })

  it('creates only in QuuuAI despite a remembered destination in another project', async () => {
    useStore.setState({ drafts: { 'new:quuu': 'Organize my queue' } })
    render(<ThemeProvider buildTheme={buildTheme}><TaskComposer fixedProjectId={quuu.id} /></ThemeProvider>)
    expect(screen.queryByRole('button', { name: PROJECT.name })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ projectId: quuu.id })))
  })

  it('keeps project selection available in ordinary task creation when QuuuAI is the selected destination', () => {
    useStore.setState({ section: { kind: 'all' }, targetProjectId: quuu.id })
    render(<ThemeProvider buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    expect(screen.getByRole('button', { name: 'QuuuAI' }).getAttribute('aria-haspopup')).toBe('listbox')
  })

  it('keeps quick add in QuuuAI while a task is open', async () => {
    useStore.setState({ detailOpen: true })
    render(<ThemeProvider buildTheme={buildTheme}><TaskSidebar /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: /Add Task/ }))
    const input = await screen.findByPlaceholderText('Task title...')
    fireEvent.change(input, { target: { value: 'Explain the queue' } })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ projectId: quuu.id })))
    expect(screen.queryByRole('button', { name: /Add to:/ })).toBeNull()
  })
})

function show(draft: string): void {
  useStore.setState({ drafts: { 'new:all': draft } })
  render(
    <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
      <TaskComposer />
    </ThemeProvider>
  )
}

/** Press `▾` to open it. Returns the rows it lists. */
async function openMenu(): Promise<HTMLElement[]> {
  fireEvent.click(screen.getByRole('button', { name: 'How to add' }))
  await waitFor(() => expect(screen.getAllByRole('menuitemradio').length).toBeGreaterThan(0))
  return screen.getAllByRole('menuitemradio')
}

/** Open it and pick one. */
async function pick(label: string): Promise<void> {
  const rows = await openMenu()
  const row = rows.find((r) => r.textContent?.includes(label))
  if (!row) throw new Error(`cannot pick: ${label}`)
  fireEvent.click(row)
}

describe('the default way of queueing', () => {
  it('queues a task added from the list into the waiting line, body or no body', () => {
    expect(defaultAddAction()).toBe('queued')
  })

  it('creates "run now" as a draft (it does not hand it to the scheduler the instant it is made)', () => {
    expect(addActionStatus('now')).toBe('draft')
    expect(addActionStatus('draft')).toBe('draft')
    expect(addActionStatus('held')).toBe('held')
    expect(addActionStatus('queued')).toBe('queued')
  })

  it('makes the button say what pressing it right now will do', () => {
    show('タイトルだけ')
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
    cleanup()

    show('タイトル\n指示も書いた')
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
  })

  it('creates as waiting with "add" even with only a title', async () => {
    show('タイトルだけ')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0][0]).toMatchObject({
      title: 'タイトルだけ',
      prompt: '',
      status: 'queued'
    })
  })
})

describe('choosing how to queue', () => {
  it('lists the four outcomes and marks the one that would be pressed now', async () => {
    show('タイトル\n指示も書いた')
    const rows = await openMenu()

    expect(rows.map((r) => r.textContent)).toEqual([
      'Add as draft',
      'Add held',
      'Add',
      'Run now'
    ])
    expect(
      rows.filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent)
    ).toEqual(['Add'])
  })

  it('puts the hand on whichever one is in effect when it opens', async () => {
    show('タイトル\n指示も書いた')
    const rows = await openMenu()
    await waitFor(() => expect(document.activeElement).toBe(rows[2]))
  })

  it('closes on Esc and returns the hand to `▾`', async () => {
    show('タイトル\n指示も書いた')
    const rows = await openMenu()
    fireEvent.keyDown(rows[2], { key: 'Escape' })
    await waitFor(() => expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'How to add' }))
  })

  it('can be chosen before anything is written (choose first, write after)', async () => {
    show('')
    const rows = await openMenu()
    expect(rows.map((r) => r.textContent)).toContain('Run now')
  })

  it('queues as held when "add as held" is chosen (it does not run)', async () => {
    show('タイトル\n指示も書いた')
    await pick('Add held')

    await waitFor(() => expect(useStore.getState().addAction).toBe('held'))
    fireEvent.click(screen.getByRole('button', { name: 'Add held' }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0][0]).toMatchObject({ status: 'held', prompt: '指示も書いた' })
    expect(runNow).not.toHaveBeenCalled()
  })

  it('does not change the chosen way of queueing when more prompt is typed in', async () => {
    show('タイトルだけ')
    await pick('Add as draft')
    await waitFor(() => expect(useStore.getState().addAction).toBe('draft'))

    // Adding a second line leaves it on "add as draft" (typing never revokes the choice)
    fireEvent.change(screen.getByPlaceholderText('Task title...'), {
      target: { value: 'タイトルだけ\n指示も書いた' }
    })
    expect(screen.getByRole('button', { name: 'Add as draft' })).toBeTruthy()
  })

  it('creates a draft only when "add as draft" is chosen explicitly', async () => {
    show('タイトル\n指示も書いた')
    await pick('Add as draft')

    fireEvent.click(screen.getByRole('button', { name: 'Add as draft' }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0][0]).toMatchObject({ status: 'draft' })
  })

  it('queues first and then runs it on the spot for "run now"', async () => {
    show('タイトル\n指示も書いた')
    await pick('Run now')
    await waitFor(() => expect(useStore.getState().addAction).toBe('now'))

    fireEvent.click(screen.getByRole('button', { name: 'Run now' }))

    await waitFor(() => expect(runNow).toHaveBeenCalledWith('t1'))
    expect(create.mock.calls[0][0]).toMatchObject({ status: 'draft' })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('puts it in the waiting line and says why when no slot is free', async () => {
    runNow.mockResolvedValue({ ok: false, reason: '実行枠がありません' })
    show('タイトル\n指示も書いた')
    await pick('Run now')
    await waitFor(() => expect(useStore.getState().addAction).toBe('now'))

    fireEvent.click(screen.getByRole('button', { name: 'Run now' }))

    await waitFor(() => expect(enqueue).toHaveBeenCalledWith('t1'))
    const toast = useStore.getState().toasts.at(-1)
    expect(toast?.level).toBe('warn')
    expect(toast?.detail).toBe('実行枠がありません')
  })
})
