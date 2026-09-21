// @vitest-environment jsdom
import { ThemeProvider } from '@design-system/react'
import { RPCLink } from '@orpc/client/message-port'
import { RPCHandler } from '@orpc/server/message-port'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { makeAgent } from './helpers.js'
import { Composer } from '../src/renderer/src/components/Composer.js'
import { MessageChannel } from 'node:worker_threads'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import { createAppRouter } from '../src/main/ipc/index.js'
import type { QuuuEvents } from '../src/preload/api.js'
import { App } from '../src/renderer/src/App.js'
import { TaskComposer } from '../src/renderer/src/components/TaskComposer.js'
import { TaskSidebar } from '../src/renderer/src/components/TaskSidebar.js'
import { TaskOverview } from '../src/renderer/src/components/TaskOverview.js'
import { TaskRuleEditor } from '../src/renderer/src/views/project/TaskRules.js'
import { INITIAL_TRAIL } from '../src/renderer/src/state/navigation.js'
import { LeftMenu } from '../src/renderer/src/components/LeftMenu.js'
import { TaskFilterBar } from '../src/renderer/src/components/TaskFilterBar.js'
import { NO_FILTERS } from '../src/renderer/src/model/table.js'
import { WINDOW_BUTTONS } from '../src/main/windowGeometry.js'
import { paneProfiles } from '@design-system/react/layout-spec'
import { createQuuuClient } from '../src/renderer/src/state/client.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

vi.mock('electron', () => ({
  BrowserWindow: {}, ipcMain: {}, clipboard: {}, dialog: {}, shell: {}, Menu: {}, WebContentsView: class { }
}))
vi.mock('../src/main/windows.js', () => ({ applicationWindows: () => [], ownsWindow: () => true, windowUrl: () => 'file:///quuu/index.html' }))
class Window extends EventEmitter {
  webContents = Object.assign(new EventEmitter(), {
    owner: this,
    mainFrame: { url: 'file:///quuu/index.html' },
    send: vi.fn()
  })
  isDestroyed(): boolean { return false }
}
let fixtureDirectory: string
let owner: Window
let channel: MessageChannel
let wire: RPCLink<Record<never, never>>
let app: QuuuApp
let projectId: string
let readingTaskId: string
beforeEach(() => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), 'quuu-input-ipc-'))
  vi.stubEnv('QUUU_USER_DATA', fixtureDirectory)
  window.quuuFiles = { getPathForFile: file => `/tmp/input fixture/${file.name}` }
  vi.stubGlobal('ResizeObserver', class { observe(): void { } unobserve(): void { } disconnect(): void { } })
  channel = new MessageChannel()
  owner = new Window()
  app = new QuuuApp(':memory:')
  app.scheduler.pause()
  projectId = app.projects.createProject({ name: '追加の検証', path: '/tmp' }).id
  readingTaskId = app.tasks.createTask({ projectId, title: '読んでいるタスク', status: 'draft' }).id
  // Only the Electron-specific window is stubbed; the real contract, router and MessagePort adapter are used.
  new RPCHandler(createAppRouter(app)).upgrade(channel.port1, { context: { owner: owner as unknown as BrowserWindow } })
  window.quuu = createQuuuClient(channel.port2, (error, path, notify) => useStore.getState().reportFailure(error, path, notify))
  wire = new RPCLink({ port: channel.port2 })
  const events: QuuuEvents = {
    snapshot: () => () => { }, sessionAppended: () => () => { }, schedulerStatus: () => () => { },
    toast: () => () => { }, command: () => () => { }, terminal: () => () => { }
  }
  window.quuuEvents = events
  channel.port1.start()
  channel.port2.start()
  window.matchMedia = query => ({ matches: false, media: query, onchange: null, addListener: () => { }, removeListener: () => { }, addEventListener: () => { }, removeEventListener: () => { }, dispatchEvent: () => false })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  useStore.setState({
    snapshot: app.snapshot(), settings: app.settings.getSettings(), section: { kind: 'all' },
    drafts: {}, newTaskAgentIds: {}, targetProjectId: projectId, newTaskLink: null, addAction: null,
    detailOpen: false, cursorTaskId: null, selectedRunId: null, session: null, runs: [], toasts: [], filters: NO_FILTERS,
    projectSettingsOpen: false, editingRuleId: null, trail: INITIAL_TRAIL
  })
  useStore.setState({ layout: { ...useStore.getState().layout, rail: paneProfiles.navigation.initial, list: paneProfiles.collection.initial, railCollapsed: false, listMode: 'compact' } })
  app.on('changed', () => useStore.getState().applySnapshot(app.snapshot()))
})

describe('the single left menu and the footer of the main surface', () => {
  it('keeps one panel and its width controls through folding and restoring the nav and the list independently', () => {
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><LeftMenu showTasks /></ThemeProvider>)
    const menu = screen.getByRole('complementary', { name: 'Left menu' })
    expect(within(menu).getByRole('navigation', { name: 'Navigation' })).toBeTruthy()
    expect(within(menu).getByRole('listbox')).toBeTruthy()
    const divider = screen.getByRole('separator', { name: /Menu width/ })
    expect(parseFloat(getComputedStyle(divider.parentElement!).marginTop)).toBeGreaterThan(WINDOW_BUTTONS.y + WINDOW_BUTTONS.height)
    fireEvent.keyDown(divider, { key: 'ArrowRight' })
    expect(useStore.getState().layout.rail).toBe(paneProfiles.navigation.initial + 8)

    fireEvent.click(screen.getByRole('button', { name: 'Hide Menu (⌘⌥1)' }))
    expect(within(menu).getByRole('listbox')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Minimize List (⌘⌥2)' }))
    expect(within(menu).queryByRole('listbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Restore List (⌘⌥2)' }))
    expect(within(menu).getByRole('listbox')).toBeTruthy()
    expect(useStore.getState().layout.railCollapsed).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Show Menu (⌘⌥1)' }))
    expect(useStore.getState().layout.rail).toBe(paneProfiles.navigation.initial + 8)
    expect(screen.getAllByRole('complementary')).toHaveLength(1)
  })

  it('keeps the footer inside the main surface when moving from the list to settings, never crossing under the left menu', () => {
    // Retrying startup belongs to another test. This one covers only the navigation after loading.
    useStore.setState({ ready: true, settingsCategory: 'appearance' })
    render(<App />)
    const main = screen.getByRole('main')
    const footer = main.querySelector('footer')
    expect(footer).not.toBeNull()
    expect(screen.getByRole('complementary', { name: 'Left menu' }).contains(footer)).toBe(false)
    act(() => useStore.getState().setSection({ kind: 'settings' }))
    expect(screen.getByRole('main').querySelector('footer')).toBe(footer)
    expect(screen.getAllByRole('complementary')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Restore List (⌘⌥2)' })).toBeNull()
  })
})
afterEach(() => {
  cleanup()
  owner.emit('closed')
  app.shutdown()
  app.db.close()
  channel.port1.close()
  channel.port2.close()
  queryClient.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  rmSync(fixtureDirectory, { recursive: true, force: true })
})

function findAdded() { return app.tasks.listTasks().find(task => task.title === '一覧から追加する') }

function assignGroup() {
  const first = makeAgent(app.db, { name: 'AI One' })
  const second = makeAgent(app.db, { name: 'AI Two' })
  const unrelated = makeAgent(app.db, { name: 'Unrelated AI' })
  const group = app.agents.createGroup({ name: 'Project AI', strategy: 'priority', memberIds: [first, second], description: '', sortOrder: 0 })
  app.projects.updateProject(projectId, { targetKind: 'group', targetId: group.id })
  return { first, second, unrelated, group }
}

describe('choosing the AI before creating a task', () => {
  it('filters group members from the keyboard without losing the draft and saves the selected agent', async () => {
    const { second } = assignGroup()
    render(<ThemeProvider buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    const draft = screen.getByPlaceholderText<HTMLTextAreaElement>('Task title...')
    fireEvent.change(draft, { target: { value: '一覧から追加する' } })
    fireEvent.click(screen.getByRole('button', { name: 'Project AI' }))
    const search = screen.getByRole('combobox', { name: 'AI' })
    expect(document.activeElement).toBe(search)
    fireEvent.change(search, { target: { value: 'two' } })
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['AI Two'])
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(draft.value).toBe('一覧から追加する')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(findAdded()?.agentOverrideId).toBe(second))
  })
  it('persists the individual choice or the whole group with creation', async () => {
    const { second } = assignGroup()
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Project AI' }))
    fireEvent.click(screen.getByText('AI Two'))
    fireEvent.change(screen.getByPlaceholderText('Task title...'), { target: { value: '一覧から追加する' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(findAdded()?.agentOverrideId).toBe(second))
    fireEvent.click(screen.getByRole('button', { name: 'AI Two' }))
    fireEvent.click(screen.getByText('Project AI (entire group)'))
    fireEvent.change(screen.getByPlaceholderText('Task title...'), { target: { value: 'Use group' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(app.tasks.listTasks().find(task => task.title === 'Use group')?.agentOverrideId).toBeNull())
  })

  it('does not carry an individual choice to another project, but keeps it when its group member is removed', () => {
    const { first, second, group } = assignGroup()
    useStore.getState().setNewTaskAgent(projectId, second)
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    expect(screen.getByRole('button', { name: 'AI Two' })).toBeTruthy()
    // Leaving the group does not undo a decision a human made: off the target is where a forced pick lives anyway
    act(() => { app.agents.updateGroup(group.id, { memberIds: [first] }) })
    expect(screen.getByTitle('AI: AI Two')).toBeTruthy()
    const other = app.projects.createProject({ name: 'Other project', path: '/tmp/other', targetKind: 'agent', targetId: first })
    act(() => useStore.getState().setTargetProject(other.id))
    expect(screen.queryByRole('button', { name: 'AI Two' })).toBeNull()
  })

  it('offers the AIs the project never named, so one can be forced while the project\'s own sits out a Limit', async () => {
    const { unrelated } = assignGroup()
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Project AI' }))
    // The group's own members come first; everything else defined follows as the deliberate pick
    expect(screen.getAllByRole('option').map(option => option.textContent))
      .toEqual(['Project AI (entire group)', 'AI One', 'AI Two', 'Unrelated AI'])
    fireEvent.click(screen.getByText('Unrelated AI'))
    fireEvent.change(screen.getByPlaceholderText('Task title...'), { target: { value: '一覧から追加する' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(findAdded()?.agentOverrideId).toBe(unrelated))
  })

  it('offers the same escape to a project that names a single AI, without listing that one twice', async () => {
    const { first, unrelated } = assignGroup()
    const other = app.projects.createProject({ name: 'Other project', path: '/tmp/other', targetKind: 'agent', targetId: first })
    act(() => useStore.getState().setTargetProject(other.id))
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'AI One' }))
    expect(screen.getAllByRole('option').map(option => option.textContent))
      .toEqual(['AI One (project setting)', 'AI Two', 'Unrelated AI'])
    fireEvent.click(screen.getByText('Unrelated AI'))
    fireEvent.change(screen.getByPlaceholderText('Task title...'), { target: { value: 'Forced onto another AI' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(app.tasks.listTasks().find(task => task.title === 'Forced onto another AI')?.agentOverrideId).toBe(unrelated))
  })

  it('offers the same choice in quick add and keeps the decided AI visible without a picker in the detail composer', async () => {
    const { second } = assignGroup()
    useStore.setState({ detailOpen: true, cursorTaskId: readingTaskId })
    const view = render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskSidebar /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Add Task (⌘N)' }))
    fireEvent.click(screen.getByRole('button', { name: 'AI: Project AI' }), { detail: 0 })
    fireEvent.click(screen.getByText('AI Two'))
    fireEvent.change(screen.getByPlaceholderText('Task title...'), { target: { value: '一覧から追加する' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Task title...'), { key: 'Enter', metaKey: true })
    await waitFor(() => expect(findAdded()?.agentOverrideId).toBe(second))
    view.unmount()
    const task = app.tasks.listTasks().find(task => task.id === readingTaskId)!
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><Composer task={task} project={app.snapshot().projects[0]} /></ThemeProvider>)
    expect(screen.queryByTitle('Agent for this task')).toBeNull()
    expect(screen.getByTitle('AI: Project AI').textContent).toBe('Project AI')
    expect(screen.queryByRole('button', { name: 'Project AI' })).toBeNull()
  })
})

describe('searching task-list filters', () => {
  it('filters projects and agents while preserving stacked checks, deselection and the all option', () => {
    const beta = app.projects.createProject({ name: 'Beta', path: '/tmp/beta' })
    app.tasks.createTask({ projectId: beta.id, title: 'Beta task', status: 'draft' })
    const snapshot = app.snapshot()
    useStore.setState({ filters: NO_FILTERS })
    render(<ThemeProvider><TaskFilterBar candidates={snapshot.tasks} matched={2} total={2} crossProject canIncludeDone
      context={{ projects: new Map(snapshot.projects.map(project => [project.id, project])), runs: new Map(),
        agentLabel: task => task.projectId === beta.id ? 'Codex' : 'Claude',
        agentKey: task => task.projectId === beta.id ? 'codex' : 'claude' }} /></ThemeProvider>)
    const pick = (label: string, query: string): void => {
      fireEvent.click(screen.getByTitle(`Filter by ${label}`))
      const search = screen.getByRole('combobox', { name: label })
      expect(document.activeElement).toBe(search)
      fireEvent.change(search, { target: { value: query } })
      expect(screen.getAllByRole('option')).toHaveLength(1)
      fireEvent.keyDown(search, { key: 'Enter' })
    }
    pick('Project', 'beta')
    expect(useStore.getState().filters.projectIds).toEqual([beta.id])
    pick('Project', '追加')
    expect(useStore.getState().filters.projectIds).toEqual([beta.id, projectId])
    fireEvent.click(screen.getByTitle('Filter by Project'))
    expect(screen.getAllByRole('option', { selected: true })).toHaveLength(2)
    for (const key of ['ArrowLeft', 'ArrowRight', 'Backspace', 'Delete']) fireEvent.keyDown(screen.getByRole('combobox'), { key })
    expect(useStore.getState().filters.projectIds).toEqual([beta.id, projectId])
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'beta' } })
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    expect(useStore.getState().filters.projectIds).toEqual([projectId])
    pick('Project', 'all')
    expect(useStore.getState().filters.projectIds).toEqual([])
    pick('Agent', 'odex')
    expect(useStore.getState().filters.targets).toEqual(['codex'])
    pick('Status', 'include done')
    expect(useStore.getState().filters.includeDone).toBe(true)
  })
})

describe('choosing a preceding task while writing a new task', () => {
  it('searches active tasks across projects and saves the waiting condition with creation, clearing it for the next task', async () => {
    const other = app.projects.createProject({ name: 'Other project', path: '/tmp/other' })
    const preceding = app.tasks.createTask({ projectId: other.id, title: 'Prepare API', status: 'queued' })
    const archived = app.tasks.createTask({ projectId, title: 'Archived preparation', status: 'draft' })
    app.tasks.archiveTask(archived.id, true)
    const done = app.tasks.createTask({ projectId, title: 'Finished preparation', status: 'draft' })
    app.tasks.markDone(done.id)
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer fixedProjectId={projectId} /></ThemeProvider>)
    const input = screen.getByPlaceholderText<HTMLTextAreaElement>('Task title...')
    fireEvent.change(input, { target: { value: '一覧から追加する' } })
    fireEvent.click(screen.getByRole('button', { name: 'Dependency' }))
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0].textContent).toContain('読んでいるタスク')
    expect(options[1].textContent).toContain('Other project')
    const search = screen.getByRole('combobox', { name: 'Choose preceding task' })
    fireEvent.change(search, { target: { value: 'Other project' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(search, { key: 'Enter', keyCode: 229 })
    expect(screen.getByRole('combobox')).toBeTruthy()
    fireEvent.keyDown(search, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: /Prepare API.*after/ }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'When finished' }))
    expect(input.value).toBe('一覧から追加する')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(findAdded()).toMatchObject({
      projectId, status: 'queued', dependsOn: [{ taskId: preceding.id, mode: 'finished' }]
    }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dependency' })).toBeTruthy())
    fireEvent.change(input, { target: { value: 'Independent task' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(app.tasks.listTasks().find(task => task.title === 'Independent task')?.dependsOn).toEqual([]))
  })

  it('can cancel an empty search, choose another preceding task and remove the condition before saving', async () => {
    app.tasks.createTask({ projectId, title: 'Another prerequisite', status: 'queued' })
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Dependency' }))
    const search = screen.getByRole('combobox', { name: 'Choose preceding task' })
    fireEvent.change(search, { target: { value: 'no match' } })
    expect(screen.getByText('No preceding tasks found')).toBeTruthy()
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dependency' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dependency' }))
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Choose preceding task' })).getByRole('option', { name: /読んでいるタスク/ }))
    fireEvent.click(screen.getByRole('button', { name: /読んでいるタスク.*after/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Choose preceding task' }))
    fireEvent.click(screen.getByRole('option', { name: /Another prerequisite/ }))
    expect(screen.queryByRole('button', { name: /読んでいるタスク.*after/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Another prerequisite.*after/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove Link' }))
    fireEvent.change(screen.getByPlaceholderText('Task title...'), { target: { value: '一覧から追加する' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(findAdded()?.dependsOn).toEqual([]))
  })

  it('keeps empty quick add open during pointer and keyboard selection, saving its prerequisite without leaving the detail', async () => {
    useStore.setState({ detailOpen: true, cursorTaskId: readingTaskId })
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskSidebar /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Add Task (⌘N)' }))
    const input = screen.getByPlaceholderText<HTMLInputElement>('Task title...')
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Choose preceding task' }))
    expect(screen.getByPlaceholderText('Task title...')).toBe(input)
    const search = screen.getByRole('combobox', { name: 'Choose preceding task' })
    fireEvent.keyDown(search, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Choose preceding task' }), { detail: 0 })
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Choose preceding task' })).getByRole('option', { name: /読んでいるタスク/ }))
    fireEvent.change(screen.getByPlaceholderText('Task that follows...'), { target: { value: '一覧から追加する' } })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    await waitFor(() => expect(findAdded()).toMatchObject({
      status: 'queued', dependsOn: [{ taskId: readingTaskId, mode: 'done' }]
    }))
    expect(useStore.getState().cursorTaskId).toBe(readingTaskId)
    expect(useStore.getState().detailOpen).toBe(true)
  })
})

describe('one prompt interface from creation to follow-up', () => {
  it('keeps the title, project and chosen AI when opening the task, while priority and the next instruction still reach persistence', async () => {
    const { second } = assignGroup()
    const view = render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Project AI' }))
    fireEvent.click(screen.getByText('AI Two'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Write instructions' }), { target: { value: '一覧から追加する\nOriginal instructions' } })
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Title' }).readOnly).toBe(false)
    fireEvent.click(screen.getByRole('radio', { name: 'P1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(findAdded()).toMatchObject({ priority: 1, agentOverrideId: second }))
    view.unmount()

    const addedId = findAdded()!.id
    function Detail(): JSX.Element {
      const snapshot = useStore(state => state.snapshot)!
      return <Composer task={snapshot.tasks.find(task => task.id === addedId)!} project={snapshot.projects.find(project => project.id === projectId)} />
    }
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><Detail /></ThemeProvider>)
    const title = screen.getByRole<HTMLInputElement>('textbox', { name: 'Title' })
    expect(title.value).toBe('一覧から追加する')
    expect(title.readOnly).toBe(true)
    expect(screen.getByText('追加の検証')).toBeTruthy()
    expect(screen.getByTitle('AI: AI Two').textContent).toBe('AI Two')
    expect(screen.queryByRole('button', { name: '追加の検証' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'AI Two' })).toBeNull()
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'P1' }).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'P0' }))
    await waitFor(() => expect(findAdded()?.priority).toBe(0))

    const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Write instructions' })
    fireEvent.change(input, { target: { value: 'Additional instructions' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true, keyCode: 229 })
    expect(findAdded()?.prompt).toBe('Original instructions')
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    await waitFor(() => expect(findAdded()?.prompt).toBe('Original instructions\n\nAdditional instructions'))
    await waitFor(() => expect(input.value).toBe(''))
    expect(findAdded()).toMatchObject({ title: title.value, projectId, agentOverrideId: second })
  })

  it('shows a fixed AI value when the one the project names is the only one defined', () => {
    const { first, second, unrelated, group } = assignGroup()
    app.agents.updateGroup(group.id, { memberIds: [first] })
    // With nothing else defined there is nothing to force it onto, so the value is a statement, not a picker
    app.agents.deleteAgent(second)
    app.agents.deleteAgent(unrelated)
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer fixedProjectId={projectId} /></ThemeProvider>)
    expect(screen.getByTitle('AI: Project AI').textContent).toBe('Project AI')
    expect(screen.queryByRole('button', { name: 'Project AI' })).toBeNull()
    expect(screen.queryByRole('button', { name: '追加の検証' })).toBeNull()
  })
})

describe('file transfer in a prompt -> contract-based IPC -> disk and task persistence', () => {
  it('inserts multiple original drop paths at the selection, retaining surrounding text and the separate title', async () => {
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    fireEvent.change(screen.getByPlaceholderText('Task title...'), { target: { value: '一覧から追加する\nBefore replace after' } })
    const input = screen.getByPlaceholderText<HTMLTextAreaElement>('Instructions for the agent...')
    input.setSelectionRange(7, 14)
    fireEvent.drop(input, { dataTransfer: { files: [new File(['A'], '図面.png'), new File(['B'], 'report.pdf')] } })
    const prompt = 'Before "/tmp/input fixture/図面.png" "/tmp/input fixture/report.pdf" after'
    await waitFor(() => expect(input.value).toBe(prompt))
    expect(input.selectionStart).toBe(prompt.indexOf(' after'))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(findAdded()?.prompt).toBe(prompt))
  })

  it('saves clipboard image and PDF bytes in staging and inserts their paths before a task can be sent', async () => {
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    fireEvent.change(screen.getByPlaceholderText('Task title...'), { target: { value: '一覧から追加する\nInspect ' } })
    const input = screen.getByPlaceholderText<HTMLTextAreaElement>('Instructions for the agent...')
    input.setSelectionRange(input.value.length, input.value.length)
    fireEvent.paste(input, { clipboardData: { files: [new File([new Uint8Array([0, 255, 42])], 'image.png', { type: 'image/png' }), new File(['%PDF'], 'sample.pdf', { type: 'application/pdf' })] } })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true })
    expect(findAdded()).toBeUndefined()
    await waitFor(() => expect(input.value).toContain('prompt-files/paste-'))
    const paths = input.value.slice('Inspect '.length).trim().split(' ')
    expect(readFileSync(paths[0])).toEqual(Buffer.from([0, 255, 42]))
    expect(readFileSync(paths[1], 'utf8')).toBe('%PDF')
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add' }).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(findAdded()?.prompt).toContain(paths[0]))
  })

  it('leaves ordinary text paste to the browser and preserves input after a file save fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    const input = screen.getByPlaceholderText<HTMLTextAreaElement>('Task title...')
    fireEvent.change(input, { target: { value: 'Keep this draft' } })
    expect(fireEvent.paste(input, { clipboardData: { files: [], getData: () => 'ordinary text' } })).toBe(true)
    fireEvent.paste(input, { clipboardData: { files: [new File(['image'], 'x'.repeat(300))] } })
    await screen.findByText('Could not attach files')
    expect(input.value).toBe('Keep this draft')
    expect(input.readOnly).toBe(false)
    expect(app.tasks.listTasks()).toHaveLength(1)
  })
})

describe('typing in the list -> contract-based IPC -> save -> the list updates', () => {
  it('offers destinations in name order and saves to the chosen project, keeping the draft even when filtered by path', async () => {
    const beta = app.projects.createProject({ name: 'Beta', path: '/tmp/second-repository' })
    app.projects.createProject({ name: 'alpha', path: '/tmp/first-repository' })
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    const draft = screen.getByPlaceholderText<HTMLTextAreaElement>('Task title...')
    fireEvent.change(draft, { target: { value: '一覧から追加する' } })
    fireEvent.click(screen.getByRole('button', { name: '追加の検証' }))
    const search = screen.getByRole('combobox', { name: 'Add to project' })
    expect(document.activeElement).toBe(search)
    const options = screen.getAllByRole('option')
    expect(options[0].textContent).toContain('alpha')
    expect(options[1].textContent).toContain('Beta')
    fireEvent.change(search, { target: { value: 'second-repository' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    // An IME commit does not select; the next Enter does.
    fireEvent.keyDown(search, { key: 'Enter', keyCode: 229 })
    expect(screen.getByRole('combobox')).toBeTruthy()
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(draft.value).toBe('一覧から追加する')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(findAdded()?.projectId).toBe(beta.id))
  })

  it('keeps the current value when the destination search comes up empty, closes on Esc and shows every candidate next time', () => {
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    const trigger = screen.getByRole('button', { name: '追加の検証' })
    fireEvent.click(trigger)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '存在しない検索' } })
    expect(screen.getByRole('status').textContent).toBe('No matching projects')
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
    expect(useStore.getState().targetProjectId).toBe(projectId)
    fireEvent.click(trigger)
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('does not fold the empty input while searching from the one-line add either, and lets typing continue after a pick', () => {
    app.projects.createProject({ name: 'Beta', path: '/tmp/second-repository' })
    useStore.setState({ detailOpen: true, cursorTaskId: readingTaskId })
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskSidebar /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Add Task (⌘N)' }))
    fireEvent.click(screen.getByRole('button', { name: /Add to: 追加の検証/ }), { detail: 0 })
    const search = screen.getByRole('combobox')
    fireEvent.change(search, { target: { value: 'Beta' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByPlaceholderText('Task title...')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Add to: Beta/ })).toBe(document.activeElement)
  })

  it.each(['button', 'keyboard'] as const)('saves from the ordinary add field with no preceding task (%s)', async method => {
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    fireEvent.change(screen.getByPlaceholderText('Task title...'), { target: { value: '一覧から追加する' } })
    if (method === 'button') fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    else fireEvent.keyDown(screen.getByPlaceholderText('Task title...'), { key: 'Enter', metaKey: true })
    await waitFor(() => expect(findAdded()).toMatchObject({ projectId, status: 'queued', dependsOn: [] }))
    expect(useStore.getState().snapshot?.tasks.some(task => task.id === findAdded()?.id)).toBe(true)
    expect(useStore.getState().drafts['new:all']).toBeUndefined()
    expect(screen.getByPlaceholderText<HTMLTextAreaElement>('Task title...').value).toBe('')
  })

  it('adds from the + of a list while reading a detail, without switching the task being read', async () => {
    useStore.setState({ detailOpen: true, cursorTaskId: readingTaskId })
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskSidebar /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Add Task (⌘N)' }))
    fireEvent.change(screen.getByPlaceholderText('Task title...'), { target: { value: '一覧から追加する' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Task title...'), { key: 'Enter', metaKey: true })
    await waitFor(() => expect(findAdded()).toMatchObject({ projectId, status: 'queued', dependsOn: [] }))
    expect(screen.getByText('一覧から追加する')).toBeTruthy()
    expect(useStore.getState().cursorTaskId).toBe(readingTaskId)
    expect(useStore.getState().detailOpen).toBe(true)
    expect(screen.getByPlaceholderText<HTMLInputElement>('Task title...').value).toBe('')
  })

  it('keeps the reason and the input on a failed save, and adds exactly one on a retry', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskComposer /></ThemeProvider>)
    const input = screen.getByPlaceholderText<HTMLTextAreaElement>('Task title...')
    fireEvent.change(input, { target: { value: '一覧から追加する' } })
    fireEvent.click(screen.getByRole('button', { name: 'Dependency' }))
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Choose preceding task' })).getByRole('option', { name: /読んでいるタスク/ }))
    app.db.exec('PRAGMA query_only=ON')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByText('Could not add the task')
    expect(screen.getByText(/readonly/i)).toBeTruthy()
    expect(input.value).toBe('一覧から追加する')
    expect(findAdded()).toBeUndefined()
    expect(screen.getByRole('button', { name: /読んでいるタスク.*after/ })).toBeTruthy()
    expect(useStore.getState().toasts).toEqual([])
    expect(log).toHaveBeenCalledWith('Quuu operation failed', 'tasks.create', expect.objectContaining({ code: 'OPERATION_FAILED' }))
    app.db.exec('PRAGMA query_only=OFF')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(input.value).toBe(''))
    expect(app.tasks.listTasks().filter(task => task.title === '一覧から追加する')).toHaveLength(1)
    expect(screen.queryByText('Could not add the task')).toBeNull()
    expect(findAdded()?.dependsOn).toEqual([{ taskId: readingTaskId, mode: 'done' }])
  })

  it('leaves existing values alone for fields left unspecified, and applies an explicit null or empty array', async () => {
    const scheduledAt = '2099-01-01T00:00:00.000Z'
    const task = await window.quuu.tasks.create({ projectId, title: '更新対象', scheduledAt, dependsOn: [{ taskId: readingTaskId, mode: 'done' }] })
    const unchanged = await window.quuu.tasks.update({ id: task.id, patch: { title: undefined, scheduledAt: undefined, dependsOn: undefined } })
    expect(unchanged).toMatchObject({ title: '更新対象', scheduledAt, dependsOn: [{ taskId: readingTaskId, mode: 'done' }] })
    const cleared = await window.quuu.tasks.update({ id: task.id, patch: { scheduledAt: null, dependsOn: [] } })
    expect(cleared).toMatchObject({ scheduledAt: null, dependsOn: [] })
    const settings = await window.quuu.settings.get()
    expect(await window.quuu.settings.set({ theme: undefined })).toEqual(settings)
  })

  it('does not save a request that fails the contract', async () => {
    for (const input of [{ projectId, title: undefined }, { projectId, title: '拒否', unexpected: 'value' }, { projectId, title: '拒否', dependsOn: null }, { projectId, title: '拒否', dependsOn: [{ taskId: readingTaskId, mode: undefined }] }]) {
      await expect(wire.call(['tasks', 'create'], input, { context: {} })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    }
    expect(app.tasks.listTasks()).toHaveLength(1)
  })
  it('does not stall on a failed initial load, shows the reason and can reload from the screen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(app.workspace, 'listEditors').mockReturnValue([{ name: '確認用 Editor', path: '/tmp/FixtureEditor.app' }])
    vi.spyOn(app, 'snapshot').mockImplementationOnce(() => { throw new Error('一覧の保存先を読めません') })
    useStore.setState({ ready: false, snapshot: null, settings: null, initializationError: null })
    render(<App />)
    await screen.findByText("Couldn't load the screen")
    expect(screen.getAllByText('一覧の保存先を読めません').length).toBeGreaterThan(0)
    expect(useStore.getState().ready).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(useStore.getState().ready).toBe(true))
    await waitFor(() => expect(useStore.getState().editors).toEqual([{ name: '確認用 Editor', path: '/tmp/FixtureEditor.app' }]))
    expect(screen.queryByText("Couldn't load the screen")).toBeNull()
  })

})

describe('recurring tasks in the collection and frequency editor', () => {
  const createRule = (over = {}) => app.automation.createTaskRule({
    projectId, name: 'Daily maintenance', prompt: 'Check the project', priority: 2,
    agentOverrideId: null, whenIdle: true, cron: '', frequency: 'daily',
    blockStatuses: ['queued', 'running'], enabled: false, sortOrder: 0, ...over
  })

  it.each([{ name: 'overview', View: TaskOverview }, { name: 'sidebar', View: TaskSidebar }])('keeps definitions below tasks, opens the selected settings, and returns with Back ($name)', async ({ View }) => {
    const rule = createRule()
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><View /></ThemeProvider>)
    const tasks = screen.getByRole('listbox')
    const recurring = screen.getByRole('region', { name: 'Recurring tasks' })
    expect(tasks.compareDocumentPosition(recurring) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(recurring).getByText('Once a day · When the queue is empty', { exact: false })).toBeTruthy()
    expect(within(recurring).getByText('Disabled')).toBeTruthy()
    const button = within(recurring).getByRole('button')
    button.focus()
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(useStore.getState().detailOpen).toBe(false)
    fireEvent.click(button)
    expect(useStore.getState()).toMatchObject({ editingRuleId: rule.id, projectSettingsOpen: true, section: { kind: 'project', id: projectId } })
    await act(async () => { await useStore.getState().goBack() })
    expect(useStore.getState()).toMatchObject({ editingRuleId: null, projectSettingsOpen: false, section: { kind: 'all' } })
  })

  it('shows definitions even without ordinary tasks, scopes them by project, and leaves Needs review clear', () => {
    createRule()
    const other = app.projects.createProject({ name: 'Other', path: '/tmp/other' })
    createRule({ projectId: other.id, name: 'Other weekly task', frequency: 'weekly' })
    useStore.setState({ section: { kind: 'project', id: other.id } })
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskOverview /></ThemeProvider>)
    expect(screen.queryByText('Daily maintenance')).toBeNull()
    expect(screen.getByText('Other weekly task')).toBeTruthy()
    act(() => useStore.getState().setSection({ kind: 'review' }))
    expect(screen.queryByRole('region', { name: 'Recurring tasks' })).toBeNull()
  })

  it('switches an existing cron rule to a frequency, persists it through IPC, and retains edits on rejection', async () => {
    const rule = createRule({ frequency: 'none', cron: '0 3 * * *' })
    const { rerender } = render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskRuleEditor rule={rule} onBack={() => { }} /></ThemeProvider>)
    expect(screen.getByRole('textbox', { name: 'Cron expression' })).toHaveProperty('value', '0 3 * * *')
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Frequency' }))
    fireEvent.click(screen.getByRole('option', { name: 'Once a week' }))
    expect(screen.queryByRole('textbox', { name: 'Cron expression' })).toBeNull()
    rerender(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}><TaskRuleEditor rule={{ ...rule, updatedAt: '2026-09-22T00:00:00Z' }} onBack={() => { }} /></ThemeProvider>)
    expect(screen.getByRole('combobox', { name: 'Frequency' }).textContent).toContain('Once a week')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false))
    vi.spyOn(app.automation, 'updateTaskRule').mockImplementationOnce(() => { throw new Error('Save failed') })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Save failed')
    expect(screen.getByRole('combobox', { name: 'Frequency' }).textContent).toContain('Once a week')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('button', { name: 'Saved' })
    expect(app.snapshot().rules.find((r) => r.id === rule.id)).toMatchObject({ frequency: 'weekly', cron: '' })
    await act(async () => { await window.quuu.rules.update({ id: rule.id, patch: { name: 'Renamed', frequency: undefined } }) })
    expect(app.snapshot().rules.find((r) => r.id === rule.id)?.frequency).toBe('weekly')
    await expect(window.quuu.rules.update({ id: rule.id, patch: { cron: '0 3 * * *' } })).rejects.toThrow()
    expect(app.snapshot().rules.find((r) => r.id === rule.id)?.frequency).toBe('weekly')
  })
})
