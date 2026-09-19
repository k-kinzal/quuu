// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import type { MenuTemplateItem } from '../src/main/ipc/types.js'
import type { Project } from '../src/main/projects/types.js'
import type { AppSnapshot } from '../src/main/snapshot.js'
import type { Task, TaskInput, TaskPatch } from '../src/main/tasks/types.js'
import { contract } from '../src/preload/contract.js'
import { Inspector } from '../src/renderer/src/components/Inspector.js'
import { TaskComposer } from '../src/renderer/src/components/TaskComposer.js'
import { taskMenuItems } from '../src/renderer/src/components/TaskMenu.js'
import { TaskQuickAdd } from '../src/renderer/src/components/TaskQuickAdd.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

/**
 * Being able to **decide the link (the preceding task) before queueing**.
 *
 * Until now a dependency could only be drawn by "create -> open -> set it in the inspector".
 * But the order is usually decided before you write ("once this is done, this comes next").
 * What is checked here is that a choice started from the context menu or the detail pane
 * **lands on the one task that gets queued**, and does not carry over to the next task afterwards.
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
  importSince: null,
  editorApp: '',
  reportEnabled: true,
  commitIdentityMode: 'inherit',
  commitIdentity: { appSlug: '', botUserId: '' },
  source: 'user',
  sortOrder: 0,
  createdAt: '',
  updatedAt: ''
}

const OTHER_PROJECT: Project = { ...PROJECT, id: 'p2', name: 'ほか', path: '/tmp/other' }

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    projectId: 'p1',
    title: '先に走らせるほう',
    prompt: '',
    status: 'queued',
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
    doneAt: null,
    ...over
  }
}

function snapshot(tasks: Task[]): AppSnapshot {
  return {
    projects: [PROJECT, OTHER_PROJECT],
    tasks,
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
}

const create = vi.fn<(input: TaskInput) => Promise<Task>>()
const update = vi.fn<(input: { id: string; patch: TaskPatch }) => Promise<Task>>()
const runNow = vi.fn<(id: string) => Promise<{ ok: boolean; reason?: string }>>()
const enqueue = vi.fn<(id: string) => Promise<Task>>()
/** A stand-in for the OS menu. It remembers the rows it was opened with; the test decides which row is picked. */
let opened: MenuTemplateItem[] = []
let choose: (items: MenuTemplateItem[]) => string | null = () => null

beforeEach(() => {
  create.mockReset().mockImplementation((input: Partial<Task>) =>
    Promise.resolve(task({ id: 'new', ...input, dependsOn: input.dependsOn ?? [] }))
  )
  update.mockReset().mockImplementation(({ id, patch }) => Promise.resolve(task({ id, ...patch })))
  runNow.mockReset().mockResolvedValue({ ok: true })
  enqueue.mockReset().mockResolvedValue(task())
  opened = []
  choose = () => null

  useStore.setState({
    snapshot: snapshot([task(), task({ id: 't2', title: 'あとに走らせるほう' })]),
    drafts: {},
    detailOpen: false,
    section: { kind: 'all' },
    toasts: [],
    runs: [],
    selectedRunId: null,
    targetProjectId: null,
    addAction: null,
    newTaskLink: null
  })
  const os = implement(contract)
  const client = createRouterClient({
    tasks: {
      create: os.tasks.create.handler(({ input }) => create(input)),
      update: os.tasks.update.handler(({ input }) => update(input)),
      runNow: os.tasks.runNow.handler(({ input }) => runNow(input)),
      enqueue: os.tasks.enqueue.handler(({ input }) => enqueue(input))
    },
    system: {
      reveal: os.system.reveal.handler(() => undefined),
      popupMenu: os.system.popupMenu.handler(({ input }) => {
        opened = input.items
        return choose(input.items)
      })
    }
  })
  Object.defineProperty(window, 'quuu', { configurable: true, writable: true, value: client })
})

function show(node: JSX.Element): void {
  render(
    <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
      {node}
    </ThemeProvider>
  )
}

describe('starting a linked queue from the context menu', () => {
  it('offers entries for linking in either direction on a single task menu', () => {
    const items = taskMenuItems('t1', { origin: 'list', ordered: ['t1', 't2'] })
    expect(items.map((i) => i.label)).toEqual(
      expect.arrayContaining(['Add Task that follows...', 'Add Task that comes first...'])
    )
  })

  it('takes the link and the queue destination (the other side project) when picked', () => {
    useStore.setState({
      snapshot: snapshot([task({ id: 't1', projectId: 'p2' })]),
      targetProjectId: 'p1'
    })
    const items = taskMenuItems('t1', { origin: 'list', ordered: ['t1'] })
    items.find((i) => i.label === 'Add Task that follows...')?.onSelect?.()

    expect(useStore.getState().newTaskLink).toEqual({
      taskId: 't1',
      direction: 'after',
      mode: 'done'
    })
    // Queue into the project the other side lives in (never drop it somewhere nobody chose)
    expect(useStore.getState().targetProjectId).toBe('p2')
  })
})

describe('the queueing surface queues the link along with it', () => {
  it('gives a following task its preceding task in the same single create', async () => {
    useStore.setState({
      newTaskLink: { taskId: 't1', direction: 'after', mode: 'done' },
      drafts: { 'new:all': 'つづき' }
    })
    show(<TaskComposer />)

    // What it links to is shown before you press (the "after" marker stays intact even with a long name)
    expect(screen.getByText('先に走らせるほう')).toBeTruthy()
    expect(screen.getByText('after')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0][0]).toMatchObject({
      title: 'つづき',
      dependsOn: [{ taskId: 't1', mode: 'done' }]
    })
    // The other side is not rewritten (the new one is what waits)
    expect(update).not.toHaveBeenCalled()
  })

  it('adds a task that has to finish first to the other side preceding list, without erasing what was set there', async () => {
    useStore.setState({
      snapshot: snapshot([task({ id: 't1', dependsOn: [{ taskId: 't9', mode: 'finished' }] })]),
      newTaskLink: { taskId: 't1', direction: 'before', mode: 'done' },
      drafts: { 'new:all': '先にやること' }
    })
    show(<TaskComposer />)

    expect(screen.getByText('before')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(update).toHaveBeenCalled())
    // The new one waits on nobody
    expect(create.mock.calls[0][0].dependsOn).toBeUndefined()
    expect(update.mock.calls[0]).toEqual([
      {
        id: 't1', patch: {
          dependsOn: [
            { taskId: 't9', mode: 'finished' },
            { taskId: 'new', mode: 'done' }
          ]
        }
      }
    ])
  })

  it('lets go of the link once queued (the next task queued is never silently made to wait)', async () => {
    useStore.setState({
      newTaskLink: { taskId: 't1', direction: 'after', mode: 'done' },
      drafts: { 'new:all': 'つづき' }
    })
    show(<TaskComposer />)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(useStore.getState().newTaskLink).toBeNull())
  })

  it('drops the link entirely when the task it points at is gone', async () => {
    useStore.setState({
      newTaskLink: { taskId: '消えたタスク', direction: 'after', mode: 'done' },
      drafts: { 'new:all': 'つづき' }
    })
    show(<TaskComposer />)

    expect(screen.queryByText('after')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0][0].dependsOn).toBeUndefined()
  })

  it('queues from the one-line input in the open detail pane too, waiting with the same link', async () => {
    useStore.setState({
      newTaskLink: { taskId: 't1', direction: 'after', mode: 'done' },
      detailOpen: true
    })
    show(
      <TaskQuickAdd project={PROJECT} projects={[PROJECT]} fixed onClose={() => undefined} />
    )

    const input = screen.getByPlaceholderText('Task that follows...')
    fireEvent.change(input, { target: { value: 'つづき' } })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })

    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0][0]).toMatchObject({
      title: 'つづき',
      status: 'queued',
      dependsOn: [{ taskId: 't1', mode: 'done' }]
    })
  })

  it('drops the held choice when it is dismissed without queueing', () => {
    useStore.setState({ newTaskLink: { taskId: 't1', direction: 'after', mode: 'done' } })
    show(
      <TaskQuickAdd project={PROJECT} projects={[PROJECT]} fixed onClose={() => undefined} />
    )
    fireEvent.keyDown(screen.getByPlaceholderText('Task that follows...'), { key: 'Escape' })
    expect(useStore.getState().newTaskLink).toBeNull()
  })
})

describe('preceding tasks in the detail pane (the inspector)', () => {
  /*
   * This is a **menu opened by pressing** (a surface inside the window). It does not go through
   * the context-menu vessel (the OS menu), so the rows land in the DOM. What a press leads to is checked in the DOM too.
   */
  it('can create a new task and place it first even with no candidates', async () => {
    useStore.setState({ snapshot: snapshot([task({ id: 't1' })]), detailOpen: true })
    show(<Inspector task={task({ id: 't1' })} project={PROJECT} width={300} />)

    fireEvent.click(screen.getByRole('button', { name: /Specify/ }))

    // The path of picking an existing task is still there (creating did not replace it)
    const menu = await screen.findByRole('menu', { name: 'Add a dependency' })
    expect(within(menu).getAllByRole('menuitem')[0].textContent).toBe(
      'Finish before this task'
    )

    fireEvent.click(within(menu).getByText('New Task…'))

    await waitFor(() =>
      expect(useStore.getState().newTaskLink).toEqual({
        taskId: 't1',
        direction: 'before',
        mode: 'done'
      })
    )
  })

  /*
   * Back when the candidates were one flat list of names, the name alone could not tell you which to pick.
   * Task names are written to be read inside their project (the same phrasing lives in
   * another project too). What is checked here is that **which project it belongs to** is shown,
   * and that the same project comes first.
   */
  it('groups candidates by project and puts the same project first', async () => {
    useStore.setState({
      snapshot: snapshot([
        task({ id: 't1' }),
        task({ id: 't2', projectId: 'p2', title: 'ほかの PJ のタスク' }),
        task({ id: 't3', title: '同じ PJ のタスク' })
      ]),
      detailOpen: true
    })
    show(<Inspector task={task({ id: 't1' })} project={PROJECT} width={300} />)

    fireEvent.click(screen.getByRole('button', { name: /Specify/ }))
    const menu = await screen.findByRole('menu', { name: 'Add a dependency' })
    expect(within(menu).getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      'Finish before this task',
      'New Task…',
      'Quuu',
      '同じ PJ のタスク',
      'ほか',
      'ほかの PJ のタスク'
    ])

    // Grouping does not stop a pick from drawing the link (a heading is not a pressable row)
    fireEvent.click(within(menu).getByText('ほかの PJ のタスク'))
    await waitFor(() =>
      expect(update.mock.calls[0]).toEqual([{ id: 't1', patch: { dependsOn: [{ taskId: 't2', mode: 'done' }] } }])
    )
  })

  /*
   * Not every candidate is listed up front (the scan would never end). But **what is folded can be opened**.
   * Back when it just stated a count and stopped there, a project with many tasks left no way
   * to choose one of the remaining candidates, so no preceding task could be attached.
   */
  it('folds the candidates it cannot show and reveals them in place on a press', async () => {
    useStore.setState({
      snapshot: snapshot([
        task({ id: 't1' }),
        ...Array.from({ length: 20 }, (_, i) =>
          task({ id: `q${i}`, seq: i + 1, title: `やること ${i}` })
        )
      ]),
      detailOpen: true
    })
    show(<Inspector task={task({ id: 't1' })} project={PROJECT} width={300} />)

    fireEvent.click(screen.getByRole('button', { name: /Specify/ }))
    const menu = await screen.findByRole('menu', { name: 'Add a dependency' })
    expect(within(menu).queryByText('やること 19')).toBeNull()

    fireEvent.click(within(menu).getByText('Show 8 more'))

    // The surface stays open and the rest appears in place (the folded row is replaced by the rest)
    expect(screen.getByRole('menu', { name: 'Add a dependency' })).toBeTruthy()
    expect(within(menu).queryByText('Show 8 more')).toBeNull()
    expect(within(menu).getByText('やること 19')).toBeTruthy()

    // What appears can be picked (it does not stop at merely showing)
    fireEvent.click(within(menu).getByText('やること 19'))
    await waitFor(() =>
      expect(update.mock.calls[0]).toEqual([{ id: 't1', patch: { dependsOn: [{ taskId: 'q19', mode: 'done' }] } }])
    )
  })

  /*
   * The context menu is an OS menu, and cannot be rebuilt while it stays open.
   * Handing it a folded list would make "show N more" a row where pressing does nothing, so
   * here the rest is listed from the start (the OS takes care of the count).
   */
  it('lists the rest unfolded in the context menu (the OS menu)', async () => {
    useStore.setState({
      snapshot: snapshot([
        task({ id: 't1' }),
        ...Array.from({ length: 20 }, (_, i) =>
          task({ id: `q${i}`, seq: i + 1, title: `やること ${i}` })
        )
      ]),
      detailOpen: true
    })
    show(<Inspector task={task({ id: 't1' })} project={PROJECT} width={300} />)

    fireEvent.contextMenu(screen.getByRole('button', { name: /Specify/ }))
    await waitFor(() => expect(opened.length).toBeGreaterThan(0))

    const labels = opened.map((i) => i.label)
    expect(labels).toContain('やること 19')
    expect(labels.some((l) => l.includes('more'))).toBe(false)
  })

  it('keeps the press-to-open menu out of the context-menu vessel (the OS menu)', () => {
    useStore.setState({ snapshot: snapshot([task({ id: 't1' })]), detailOpen: true })
    show(<Inspector task={task({ id: 't1' })} project={PROJECT} width={300} />)

    opened = []
    fireEvent.click(screen.getByRole('button', { name: /Specify/ }))
    expect(opened).toEqual([])
  })
})
