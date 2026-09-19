// @vitest-environment jsdom
import { StrictMode } from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../src/main/projects/types.js'
import type { Task } from '../src/main/tasks/types.js'
import type { ReviewFile, ReviewSnapshot } from '../src/main/review/types.js'
import { ActivityBar, ThemeProvider } from '@design-system/react'
import { inspectorTools, useWorkbenchLayout, visibleInspectorTools } from '../src/renderer/src/interaction/workbench.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'
import { TaskMainPane } from '../src/renderer/src/components/TaskMainPane.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { TaskWorkbench } from '../src/renderer/src/components/TaskWorkbench.js'
import { CodeStructurePane } from '../src/renderer/src/components/CodeStructurePane.js'
import { CoveragePane } from '../src/renderer/src/components/CoveragePane.js'
import { ProjectTasksPane } from '../src/renderer/src/components/ProjectTasksPane.js'
import { buildFileTree } from '../src/renderer/src/model/reviewTree.js'

function workTask(id = 'task-1'): Task {
  return {
    id,
    projectId: 'project-1',
    title: 'レビューする',
    prompt: '',
    status: 'review',
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
}

function fakeStorage(): Storage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size
    }
  }
}

beforeEach(() => {
  queryClient.clear()
  useStore.setState({ snapshot: null, session: null, runs: [], drafts: {}, sessionLoading: false })
  vi.stubGlobal('localStorage', fakeStorage())
  // jsdom cannot scroll to the selected code line; assert the browser request instead.
  HTMLElement.prototype.scrollIntoView = vi.fn()
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('lists local changes, staging and commit hashes in order and opens each version of a partially staged file', async () => {
  const localRevision = { base: 'b'.repeat(40), head: 'c'.repeat(40) }
  const stagedRevision = { base: 'a'.repeat(40), head: 'b'.repeat(40) }
  const snapshot: ReviewSnapshot = {
    cwd: '/tmp/project', branch: 'main', repository: null, tree: [], changes: [], revision: null,
    localChanges: [{ path: 'result.ts', change: 'modified' }], localRevision,
    stagedChanges: [{ path: 'result.ts', change: 'modified' }], stagedRevision,
    commits: ['d', 'e'].map(char => ({ sha: char.repeat(40), shortSha: char.repeat(7),
      subject: `Commit ${char}`, author: 'Fixture', committedAt: '', files: [{ path: 'result.ts', change: 'modified' }] })),
    pullRequests: [], coverage: null, projectTasks: []
  }
  const file = vi.fn().mockImplementation(({ request }: { request: { source: string; path: string } }) => Promise.resolve({
    source: request.source, path: request.path, language: '', content: '', diff: [], symbols: [], binary: false
  }))
  vi.stubGlobal('quuu', { review: { file, closePullRequest: vi.fn() } })
  const onFile = vi.fn()
  const view = render(<ThemeProvider colorScheme="light" buildTheme={buildTheme}>
    <TaskMainPane task={workTask()} project={undefined} snapshot={snapshot}
      loading={false} error={null} requestedLine={null} onRefresh={vi.fn()} onFile={onFile} />
  </ThemeProvider>)
  fireEvent.click(screen.getByRole('tab', { name: /Commit\s*4/ }))
  await waitFor(() => expect(file).toHaveBeenNthCalledWith(1, { taskId: 'task-1',
    request: { source: 'task', path: 'result.ts', previousPath: undefined, revision: localRevision } }))
  const roots = screen.getAllByRole('treeitem').filter(row => row.hasAttribute('aria-expanded'))
  expect(roots.map(row => row.textContent)).toEqual(['Local changes', 'Staged', 'ddddddd', 'eeeeeee'])
  for (const [label, revision] of [['Local changes', localRevision], ['Staged', stagedRevision]] as const) {
    const group = screen.getByRole('treeitem', { name: label })
    if (group.getAttribute('aria-expanded') !== 'true') fireEvent.click(group)
    fireEvent.click(screen.getAllByRole('treeitem', { name: 'result.ts' })[label === 'Local changes' ? 0 : 1])
    await waitFor(() => expect(file).toHaveBeenCalledWith({ taskId: 'task-1',
      request: { source: 'task', path: 'result.ts', previousPath: undefined, revision } }))
  }
  const commit = screen.getByRole('treeitem', { name: 'ddddddd' })
  if (commit.getAttribute('aria-expanded') !== 'true') fireEvent.click(commit)
  expect(commit.title).toContain('Commit d')
  fireEvent.click(screen.getAllByRole('treeitem', { name: 'result.ts' })[2])
  await waitFor(() => expect(file).toHaveBeenCalledWith({ taskId: 'task-1',
    request: { source: 'commit', path: 'result.ts', previousPath: undefined, ref: 'd'.repeat(40) } }))
  view.rerender(<ThemeProvider colorScheme="light" buildTheme={buildTheme}>
    <TaskMainPane task={workTask()} project={undefined} snapshot={{ ...snapshot, localChanges: [], stagedChanges: [] }}
      loading={false} error={null} requestedLine={null} onRefresh={vi.fn()} onFile={onFile} />
  </ThemeProvider>)
  expect(screen.queryByRole('treeitem', { name: 'Local changes' })).toBeNull()
  expect(screen.queryByRole('treeitem', { name: 'Staged' })).toBeNull()
  expect(screen.getByRole('treeitem', { name: 'ddddddd' })).toBeTruthy()
  expect(screen.getByRole('tab', { name: /Commit\s*2/ })).toBeTruthy()
})

it('tints project and change rows alike, keeps the tint on selection, and opens deleted files from the saved diff', async () => {
  const revision = { base: 'a'.repeat(40), head: 'b'.repeat(40) }
  const snapshot: ReviewSnapshot = {
    cwd: '/tmp/project', branch: 'main', repository: null,
    tree: buildFileTree([{ path: 'src/clean.ts' }, { path: 'src/edit.ts' }, { path: 'new/add.ts' }]),
    changes: [{ path: 'src/edit.ts', change: 'modified' }, { path: 'new/add.ts', change: 'added' }, { path: 'gone/deleted.ts', change: 'deleted' }],
    revision, stagedChanges: [], stagedRevision: null, localChanges: [], localRevision: null,
    commits: [], pullRequests: [], coverage: null, projectTasks: []
  }
  const file = vi.fn().mockImplementation(({ request }: { request: { source: string; path: string } }) => Promise.resolve({
    source: request.source, path: request.path, language: '', content: '', diff: [], symbols: [], binary: false
  }))
  vi.stubGlobal('quuu', { review: { file, closePullRequest: vi.fn() } })
  render(<ThemeProvider colorScheme="light" buildTheme={buildTheme}>
    <TaskMainPane task={workTask()} project={undefined} snapshot={snapshot}
      loading={false} error={null} requestedLine={null} onRefresh={vi.fn()} onFile={vi.fn()} />
  </ThemeProvider>)
  fireEvent.click(screen.getByRole('tab', { name: 'Project' }))
  const removed = screen.getByRole('treeitem', { name: 'deleted.ts' })
  expect(removed.getAttribute('aria-description')).toBe('Deleted')
  expect(screen.getByRole('treeitem', { name: 'gone' }).getAttribute('aria-description')).toBe('Deleted')
  fireEvent.click(removed)
  await waitFor(() => expect(file).toHaveBeenCalledWith({ taskId: 'task-1', request: { source: 'task', path: 'gone/deleted.ts', previousPath: undefined, revision } }))
  await waitFor(() => expect(removed.getAttribute('aria-selected')).toBe('true'))
  const selectedColor = getComputedStyle(removed).backgroundColor
  expect(selectedColor).not.toBe('rgba(0, 0, 0, 0)')
  fireEvent.click(screen.getByRole('treeitem', { name: 'new' }))
  fireEvent.click(screen.getByRole('treeitem', { name: 'src' }))
  const added = screen.getByRole('treeitem', { name: 'add.ts' })
  const modified = screen.getByRole('treeitem', { name: 'edit.ts' })
  const clean = screen.getByRole('treeitem', { name: 'clean.ts' })
  const addedColor = getComputedStyle(added).backgroundColor
  const modifiedColor = getComputedStyle(modified).backgroundColor
  expect(addedColor).not.toBe(modifiedColor)
  expect(modifiedColor).not.toBe(getComputedStyle(clean).backgroundColor)
  // Only the disclosure slot, file icon and label occupy horizontal space.
  expect(added.children).toHaveLength(3)
  fireEvent.click(screen.getByRole('tab', { name: /Changes/ }))
  expect(getComputedStyle(screen.getByRole('treeitem', { name: 'add.ts' })).backgroundColor).toBe(addedColor)
  expect(getComputedStyle(screen.getByRole('treeitem', { name: 'edit.ts' })).backgroundColor).toBe(modifiedColor)
  expect(screen.queryByRole('treeitem', { name: 'clean.ts' })).toBeNull()
})

describe('the workbench vertical navigation', () => {
  it('draws several work surfaces as shown at once and reports only the item that was pressed', () => {
    const activate = vi.fn()
    render(
      <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
        <ActivityBar
          label="作業"
          items={[
            { id: 'chat', label: 'チャット', icon: <span>C</span> },
            { id: 'review', label: 'レビュー', icon: <span>R</span>, badge: 'dot' },
            { id: 'terminal', label: 'ターミナル', icon: <span>T</span> }
          ]}
          visibleIds={['chat', 'review']}
          activeId="review"
          onToggle={activate}
        />
      </ThemeProvider>
    )

    expect(screen.getByRole('button', { name: 'チャット' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'レビュー' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'ターミナル' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'ターミナル' }))
    expect(activate).toHaveBeenCalledWith('terminal')
  })

  it('reorders with Alt+arrow exactly as dragging does', () => {
    const reorder = vi.fn()
    render(
      <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
        <ActivityBar
          label="作業"
          items={[
            { id: 'chat', label: 'チャット', icon: <span>C</span> },
            { id: 'review', label: 'レビュー', icon: <span>R</span> },
            { id: 'terminal', label: 'ターミナル', icon: <span>T</span> }
          ]}
          visibleIds={['chat']}
          onToggle={() => undefined}
          onReorder={reorder}
        />
      </ThemeProvider>
    )

    fireEvent.keyDown(screen.getByRole('button', { name: 'レビュー' }), {
      key: 'ArrowUp',
      altKey: true
    })
    expect(reorder).toHaveBeenCalledWith(['review', 'chat', 'terminal'])
  })

  it('inserts an item dragged downward between the items it was dropped across', () => {
    const reorder = vi.fn()
    const dataTransfer = {
      effectAllowed: 'none',
      setData: vi.fn()
    }
    render(
      <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
        <ActivityBar
          label="作業"
          items={[
            { id: 'chat', label: 'チャット', icon: <span>C</span> },
            { id: 'review', label: 'レビュー', icon: <span>R</span> },
            { id: 'terminal', label: 'ターミナル', icon: <span>T</span> }
          ]}
          visibleIds={['chat']}
          onToggle={() => undefined}
          onReorder={reorder}
        />
      </ThemeProvider>
    )

    fireEvent.dragStart(screen.getByRole('button', { name: 'チャット' }), { dataTransfer })
    fireEvent.dragOver(screen.getByRole('button', { name: 'ターミナル' }), {
      clientY: 0,
      dataTransfer
    })
    fireEvent.drop(screen.getByRole('button', { name: 'ターミナル' }), { dataTransfer })

    expect(reorder).toHaveBeenCalledWith(['review', 'chat', 'terminal'])
  })
})

describe('the workbench display state', () => {
  it('toggles the main and terminal surfaces independently and saves their order', () => {
    const { result } = renderHook(() => useWorkbenchLayout())
    expect(result.current.layout.workOrder).toEqual(['main', 'terminal'])
    act(() => result.current.toggleWork('terminal'))
    expect(result.current.layout.visibleWork).toEqual(['main', 'terminal'])
    act(() => result.current.toggleWork('main'))
    expect(result.current.layout.visibleWork).toEqual(['terminal'])
    act(() => result.current.toggleWork('terminal'))
    expect(result.current.layout.visibleWork).toEqual([])
    act(() => result.current.reorderWork(['terminal', 'main']))
    expect(JSON.parse(localStorage.getItem('taskd.workbench.v2') ?? '{}')).toMatchObject({
      workOrder: ['terminal', 'main'], visibleWork: []
    })
  })

  it('offers all former chat and review inspectors on the main surface', () => {
    const { result } = renderHook(() => useWorkbenchLayout())
    expect(inspectorTools('main')).toEqual(['task', 'symbols', 'coverage', 'project-tasks'])
    act(() => result.current.toggleInspector('symbols'))
    act(() => result.current.toggleInspector('coverage'))
    act(() => result.current.toggleInspector('project-tasks'))
    expect(visibleInspectorTools(result.current.layout)).toEqual(['task', 'symbols', 'coverage', 'project-tasks'])
  })

  it('keeps task details open across main and terminal while retaining each surface’s other inspectors', () => {
    const { result, unmount } = renderHook(() => useWorkbenchLayout())
    expect(visibleInspectorTools(result.current.layout)).toEqual(['task'])
    act(() => result.current.toggleInspector('symbols'))
    act(() => result.current.openWork('terminal'))
    expect(inspectorTools('terminal')).toEqual(['task', 'coverage', 'project-tasks'])
    expect(visibleInspectorTools(result.current.layout)).toEqual(['task', 'project-tasks'])
    act(() => result.current.closeWork('main'))
    expect(visibleInspectorTools(result.current.layout)).toEqual(['task', 'project-tasks'])

    act(() => result.current.closeInspector('task'))
    expect(visibleInspectorTools(result.current.layout)).toEqual(['project-tasks'])
    act(() => result.current.openWork('main'))
    expect(visibleInspectorTools(result.current.layout)).toEqual(['symbols'])
    act(() => result.current.toggleInspector('task'))
    act(() => result.current.focusWork('terminal'))
    expect(visibleInspectorTools(result.current.layout)).toEqual(['task', 'project-tasks'])
    act(() => result.current.toggleInspector('task'))
    act(() => result.current.focusWork('main'))
    expect(visibleInspectorTools(result.current.layout)).toEqual(['symbols'])

    unmount()
    const restored = renderHook(() => useWorkbenchLayout())
    expect(visibleInspectorTools(restored.result.current.layout)).toEqual(['project-tasks'])
    act(() => restored.result.current.toggleInspector('task'))
    act(() => restored.result.current.focusWork('main'))
    expect(visibleInspectorTools(restored.result.current.layout)).toEqual(['task', 'symbols'])
  })

  it.each([true, false])('preserves the saved main task-details choice (%s) when first opening the terminal', (open) => {
    localStorage.setItem('taskd.workbench.v2', JSON.stringify({
      visibleWork: ['terminal'],
      visibleInspectors: { main: open ? ['task', 'coverage'] : ['coverage'], terminal: ['project-tasks'] }
    }))
    const { result, unmount } = renderHook(() => useWorkbenchLayout())
    expect(visibleInspectorTools(result.current.layout)).toEqual(open ? ['task', 'project-tasks'] : ['project-tasks'])
    act(() => result.current.focusWork('main'))
    expect(visibleInspectorTools(result.current.layout)).toEqual(open ? ['task', 'coverage'] : ['coverage'])
    unmount()
    const restored = renderHook(() => useWorkbenchLayout())
    expect(visibleInspectorTools(restored.result.current.layout)).toEqual(open ? ['task', 'project-tasks'] : ['project-tasks'])
  })

  it('saves the height ratio of adjacent panes on the left and on the right', () => {
    const { result } = renderHook(() => useWorkbenchLayout())
    act(() => result.current.resizeWork('main', 'terminal', 0.25))
    act(() => result.current.resizeInspectors('task', 'coverage', 0.6))
    expect(JSON.parse(localStorage.getItem('taskd.workbench.v2') ?? '{}')).toMatchObject({
      workSizes: { main: 0.75, terminal: 2.25 },
      inspectorSizes: { task: 1.2, symbols: 1, coverage: 0.8, 'project-tasks': 1 }
    })
  })

  it('fills in the default ratio for an existing saved value that carries no height', () => {
    localStorage.setItem(
      'taskd.workbench.v1',
      JSON.stringify({
        workOrder: ['review', 'chat', 'terminal'],
        visibleWork: ['review', 'chat'],
        inspectorOrder: ['symbols', 'coverage', 'project-tasks', 'task'],
        visibleInspectors: { review: ['symbols', 'coverage'] }
      })
    )

    const { result } = renderHook(() => useWorkbenchLayout())
    expect(result.current.layout.workSizes).toEqual({ main: 3, terminal: 1 })
    expect(result.current.layout.inspectorSizes).toEqual({
      task: 1,
      symbols: 1,
      coverage: 1,
      'project-tasks': 1
    })
  })

  it('merges legacy pane visibility and inspectors without duplicates and prefers the new saved layout', () => {
    localStorage.setItem('taskd.workbench.v1', JSON.stringify({
      workOrder: ['terminal', 'review', 'chat'], visibleWork: ['review', 'chat', 'terminal'],
      workSizes: { chat: 2, review: 4, terminal: 3 },
      visibleInspectors: { chat: ['task', 'coverage'], review: ['symbols', 'coverage'], terminal: [] }
    }))
    const { result, unmount } = renderHook(() => useWorkbenchLayout())
    expect(result.current.layout).toMatchObject({
      workOrder: ['terminal', 'main'], visibleWork: ['main', 'terminal'],
      workSizes: { main: 6, terminal: 3 },
      taskInspectorOpen: true,
      visibleInspectors: { main: ['coverage', 'symbols'], terminal: [] }
    })
    act(() => result.current.closeWork('main'))
    unmount()
    const restored = renderHook(() => useWorkbenchLayout())
    expect(restored.result.current.layout.visibleWork).toEqual(['terminal'])
  })

  it('syncs review files and project tasks into the right pane and keeps them across a re-display', async () => {
    localStorage.setItem(
      'taskd.workbench.v1',
      JSON.stringify({
        workOrder: ['review', 'chat', 'terminal'],
        visibleWork: ['review', 'chat'],
        inspectorOrder: ['symbols', 'coverage', 'project-tasks', 'task'],
        visibleInspectors: { review: ['symbols', 'project-tasks'] }
      })
    )
    const snapshot: ReviewSnapshot = {
      cwd: '/tmp/project',
      branch: 'main',
      repository: null,
      tree: [],
      changes: [{ path: 'src/a.ts', change: 'modified' }],
      stagedChanges: [], stagedRevision: null, localChanges: [{ path: 'src/a.ts', change: 'modified' }],
      revision: { base: 'a'.repeat(40), head: 'b'.repeat(40) },
      localRevision: { base: 'a'.repeat(40), head: 'b'.repeat(40) },
      commits: [],
      pullRequests: [],
      coverage: null,
      projectTasks: [{ id: 'package:check', label: 'check', source: 'package', command: "npm run 'check'" }]
    }
    const file: ReviewFile = {
      source: 'task',
      path: 'src/a.ts',
      language: '',
      content: 'export function run() {}',
      diff: [{ kind: 'context', oldLine: 1, newLine: 1, text: 'export function run() {}' }],
      symbols: [{ name: 'run', kind: 'function', line: 1, depth: 0 }],
      binary: false
    }
    Object.defineProperty(window, 'quuu', {
      configurable: true,
      value: {
        review: {
          snapshot: vi.fn().mockResolvedValue(snapshot),
          file: vi.fn().mockResolvedValue(file),
          comment: vi.fn(),
          openPullRequest: vi.fn()
        },
        terminal: {
          open: vi.fn(),
          input: vi.fn(),
          resize: vi.fn(),
          runProjectTask: vi.fn(),
          close: vi.fn()
        },
        on: { terminal: () => () => undefined }
      }
    })
    const task = {
      id: 'task-1',
      projectId: 'project-1',
      title: 'レビューする',
      prompt: '',
      status: 'review',
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
    } satisfies Task
    const project = {
      id: 'project-1',
      name: 'project',
      path: '/tmp/project',
      color: '#fff',
      priority: 1,
      targetKind: 'agent',
      targetId: null,
      maxConcurrent: 1,
      enabled: true,
      deletedAt: null,
      importSince: null,
      commitIdentityMode: 'inherit',
      commitIdentity: { appSlug: '', botUserId: '' },
      editorApp: '',
      reportEnabled: true,
      source: 'user',
      sortOrder: 0,
      createdAt: '',
      updatedAt: ''
    } satisfies Project

    render(
      <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
        <TaskWorkbench task={task} project={project} />
      </ThemeProvider>
    )

    expect(within(screen.getByRole('navigation', { name: 'Task work area' })).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Main', 'Terminal'])
    fireEvent.click(screen.getByRole('tab', { name: /Changes/ }))
    await waitFor(() => expect(screen.getByTitle('run · line 1')).toBeTruthy())
    expect(screen.getByText('check')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }))
    expect(screen.getByText('check')).toBeTruthy()
    expect(screen.getByTitle('run · line 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Changes/ }))

    await waitFor(() => expect(screen.getByText('check')).toBeTruthy())
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole('tab', { name: 'Chat' }))
      fireEvent.click(screen.getByTitle('run · line 1'))
      expect(screen.getByRole('tab', { name: /Changes/ }).getAttribute('aria-selected')).toBe('true')
      expect(screen.getByRole('tab', { name: 'a.ts' })).toBeTruthy()
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
    }

  })

  it('does not repeat the automatic fetch when the first file cannot be opened', async () => {
    const snapshot: ReviewSnapshot = {
      cwd: '/tmp/project',
      branch: 'main',
      repository: null,
      tree: [],
      changes: [{ path: 'src/unreadable.ts', change: 'modified' }],
      stagedChanges: [], stagedRevision: null, localChanges: [{ path: 'src/unreadable.ts', change: 'modified' }],
      revision: { base: 'a'.repeat(40), head: 'b'.repeat(40) },
      localRevision: { base: 'a'.repeat(40), head: 'b'.repeat(40) },
      commits: [],
      pullRequests: [],
      coverage: null,
      projectTasks: []
    }
    const never = new Promise<ReviewFile>(() => undefined)
    const fileRequest = vi.fn()
      .mockRejectedValueOnce(new Error('cannot fetch the file'))
      .mockReturnValue(never)
    Object.defineProperty(window, 'quuu', {
      configurable: true,
      value: { review: { file: fileRequest } }
    })

    render(
      <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
        <StrictMode>
          <TaskMainPane
            task={workTask()}
            project={undefined}
            snapshot={snapshot}
            loading={false}
            error={null}
            requestedLine={null}
            onRefresh={() => undefined}
            onFile={() => undefined}
          />
        </StrictMode>
      </ThemeProvider>
    )

    fireEvent.click(screen.getByRole('tab', { name: /Changes/ }))
    await waitFor(() => expect(fileRequest).toHaveBeenCalledTimes(1))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(fileRequest).toHaveBeenCalledTimes(1)
    expect(screen.getByText('unreadable.ts')).toBeTruthy()
  })

  it('keeps one prompt input visible with its draft and selection across every main tab', () => {
    const refresh = vi.fn()
    const snapshot: ReviewSnapshot = {
      cwd: '/tmp/project',
      branch: 'feature/workbench',
      repository: null,
      tree: [],
      changes: [],
      stagedChanges: [], stagedRevision: null, localChanges: [],
      revision: { base: 'a'.repeat(40), head: 'b'.repeat(40) },
      localRevision: { base: 'a'.repeat(40), head: 'b'.repeat(40) },
      commits: [],
      pullRequests: [],
      coverage: null,
      projectTasks: []
    }

    render(
      <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
        <TaskMainPane
          task={workTask()}
            project={undefined}
          snapshot={snapshot}
          loading={false}
          error={null}
          requestedLine={null}
          onRefresh={refresh}
          onFile={() => undefined}
        />
      </ThemeProvider>
    )

    expect(screen.getByRole('toolbar', { name: 'Main actions' })).toBeTruthy()
    const modes = within(screen.getByRole('tablist', { name: 'Main view' })).getAllByRole('tab')
    expect(modes.map((tab) => tab.textContent)).toEqual(['Chat', 'Project', 'Changes0', 'Commit0', 'Pull Request0', 'Report'])
    expect(modes[0].getAttribute('aria-selected')).toBe('true')
    // Nothing has been written for this task, so the report tab is shut rather than opening onto nothing
    const report = modes[modes.length - 1]
    expect(report.getAttribute('aria-disabled') ?? String(report.hasAttribute('disabled'))).toBe('true')
    fireEvent.click(report)
    expect(report.getAttribute('aria-selected')).toBe('false')
    const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Write instructions' })
    fireEvent.change(input, { target: { value: 'Keep this draft while I read the diff' } })
    input.setSelectionRange(5, 9)
    for (const tab of [...modes.slice(1), modes[0]]) {
      fireEvent.click(tab)
      expect(screen.getByRole('textbox', { name: 'Write instructions' })).toBe(input)
      expect(input.closest('[hidden]')).toBeNull()
      expect(document.querySelector('[data-pane="chat"]') !== null).toBe(tab === modes[0])
      expect(input.value).toBe('Keep this draft while I read the diff')
      expect(input.selectionStart).toBe(5)
      expect(input.selectionEnd).toBe(9)
      expect(screen.getByRole('tabpanel').contains(input)).toBe(false)
    }
    expect(screen.getByText('feature/workbench')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: /Pull Request\s*0/ }))
    expect(screen.getByRole('tab', { name: /Pull Request\s*0/ }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh review info' }))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does not reopen a closed branch of the project tree on a re-render', async () => {
    const snapshot: ReviewSnapshot = {
      cwd: '/tmp/project',
      branch: 'feature/tree',
      repository: null,
      tree: [],
      changes: [{ path: 'src/nested/a.ts', change: 'modified' }],
      stagedChanges: [], stagedRevision: null, localChanges: [{ path: 'src/nested/a.ts', change: 'modified' }],
      revision: { base: 'a'.repeat(40), head: 'b'.repeat(40) },
      localRevision: { base: 'a'.repeat(40), head: 'b'.repeat(40) },
      commits: [],
      pullRequests: [],
      coverage: null,
      projectTasks: []
    }
    Object.defineProperty(window, 'quuu', {
      configurable: true,
      value: { review: { file: vi.fn().mockRejectedValue(new Error('test')) } }
    })

    render(
      <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
        <TaskMainPane
          task={workTask('task-tree')}
          project={undefined}
          snapshot={snapshot}
          loading={false}
          error={null}
          requestedLine={null}
          onRefresh={() => undefined}
          onFile={() => undefined}
        />
      </ThemeProvider>
    )

    fireEvent.click(screen.getByRole('tab', { name: /Changes/ }))
    const src = screen.getByRole('treeitem', { name: 'src' })
    expect(src.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(src)
    await waitFor(() => expect(src.getAttribute('aria-expanded')).toBe('false'))

    fireEvent.click(screen.getByRole('tab', { name: /Commit\s*1/ }))
    expect(screen.getByText('Local changes')).toBeTruthy()
  })

  it('adds a Pull Request to the same tab row as files, shows it in the code area and closes it', async () => {
    const snapshot: ReviewSnapshot = {
      cwd: '/tmp/project',
      branch: 'feature/pull-tab',
      repository: 'openai/quuu',
      tree: [],
      changes: [{ path: 'src/a.ts', change: 'modified' }],
      stagedChanges: [], stagedRevision: null, localChanges: [],
      revision: { base: 'a'.repeat(40), head: 'b'.repeat(40) },
      localRevision: null,
      commits: [],
      pullRequests: [
        {
          number: 42,
          title: 'レビューを作業面へ統合する',
          url: 'https://github.com/openai/quuu/pull/42',
          headRefName: 'feature/pull-tab',
          baseRefName: 'main',
          headSha: 'abc123',
          draft: false,
          updatedAt: '2026-08-29T00:00:00.000Z',
          check: 'success',
          files: [{ path: 'src/a.ts', change: 'modified' }]
        }
      ],
      coverage: null,
      projectTasks: []
    }
    const file: ReviewFile = {
      source: 'task',
      path: 'src/a.ts',
      language: 'typescript',
      content: 'export const value = 1',
      diff: [{ kind: 'added', oldLine: null, newLine: 1, text: 'export const value = 1' }],
      symbols: [],
      binary: false
    }
    const openPullRequest = vi.fn().mockResolvedValue({ ok: true })
    const hidePullRequest = vi.fn().mockResolvedValue({ ok: true })
    const closePullRequest = vi.fn().mockResolvedValue({ ok: true })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 320,
      y: 180,
      left: 320,
      top: 180,
      right: 1120,
      bottom: 780,
      width: 800,
      height: 600,
      toJSON: () => undefined
    })
    Object.defineProperty(window, 'quuu', {
      configurable: true,
      value: {
        review: {
          file: vi.fn().mockResolvedValue(file),
          openPullRequest,
          hidePullRequest,
          closePullRequest
        }
      }
    })

    render(
      <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
        <TaskMainPane
          task={workTask()}
            project={undefined}
          snapshot={snapshot}
          loading={false}
          error={null}
          requestedLine={null}
          onRefresh={() => undefined}
          onFile={() => undefined}
        />
      </ThemeProvider>
    )

    fireEvent.click(screen.getByRole('tab', { name: /Changes/ }))
    await waitFor(() => expect(screen.getByRole('tab', { name: 'a.ts' })).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: /Pull Request\s*1/ }))
    fireEvent.click(screen.getByRole('treeitem', { name: /#42 レビューを作業面へ統合する/ }))

    expect(screen.getByRole('tab', { name: /#42 レビューを作業面へ統合する/ })).toBeTruthy()
    expect(screen.getByLabelText('Pull Request #42')).toBeTruthy()
    await waitFor(() =>
      expect(openPullRequest).toHaveBeenCalledWith({
        id: 'pull-request-page:42:https://github.com/openai/quuu/pull/42',
        url: 'https://github.com/openai/quuu/pull/42',
        bounds: { x: 320, y: 180, width: 800, height: 600 }
      })
    )

    const prompt = screen.getByRole('textbox', { name: 'Write instructions' })
    fireEvent.click(screen.getByRole('tab', { name: 'Chat' }))
    expect(hidePullRequest).toHaveBeenCalledWith('pull-request-page:42:https://github.com/openai/quuu/pull/42')
    expect(screen.queryByLabelText('Pull Request #42')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Write instructions' })).toBe(prompt)
    fireEvent.click(screen.getByRole('tab', { name: /Pull Request\s*1/ }))
    expect(screen.getByRole('tab', { name: /#42 レビューを作業面へ統合する/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByLabelText('Pull Request #42')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'a.ts' }))
    expect(hidePullRequest).toHaveBeenCalledWith(
      'pull-request-page:42:https://github.com/openai/quuu/pull/42'
    )

    // An unselected PR closes inside its own tab too. The file being read is not switched.
    const close = screen.getByRole('button', { name: 'Close #42 レビューを作業面へ統合する' })
    expect(screen.getByRole('tab', { name: /#42 レビューを作業面へ統合する/ }).parentElement?.contains(close)).toBe(true)
    fireEvent.click(close)
    expect(closePullRequest).toHaveBeenCalledWith(
      'pull-request-page:42:https://github.com/openai/quuu/pull/42'
    )
    expect(screen.queryByRole('tab', { name: /#42 レビューを作業面へ統合する/ })).toBeNull()
    expect(screen.getByRole('tab', { name: 'a.ts' }).getAttribute('aria-selected')).toBe('true')

    fireEvent.click(screen.getByRole('treeitem', { name: /#42 レビューを作業面へ統合する/ }))
    const activeTab = screen.getByRole('tab', { name: /#42 レビューを作業面へ統合する/ })
    act(() => activeTab.focus())
    fireEvent.keyDown(activeTab, { key: 'Delete' })
    expect(screen.queryByRole('tab', { name: /#42 レビューを作業面へ統合する/ })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'a.ts' }))
  })

  it('opens and copies the right-clicked PR from its row and inactive tab without changing the selected tab', async () => {
    const pulls = [42, 43].map(number => ({
      number, title: `Review ${String(number)}`, url: `https://github.com/openai/quuu/pull/${String(number)}`,
      headRefName: 'feature', baseRefName: 'main', headSha: 'abc123', draft: false,
      updatedAt: '', check: 'success' as const, files: []
    }))
    const popupMenu = vi.fn().mockResolvedValue('0')
    const openExternal = vi.fn().mockResolvedValue(undefined)
    const copy = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('quuu', {
      system: { popupMenu, openExternal, copy },
      review: { openPullRequest: vi.fn().mockResolvedValue({ ok: true }), hidePullRequest: vi.fn(), closePullRequest: vi.fn() }
    })
    render(<ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
      <TaskMainPane task={workTask()} project={undefined} snapshot={{
        cwd: '/tmp/project', branch: 'main', repository: 'openai/quuu', tree: [], changes: [],
        stagedChanges: [], stagedRevision: null, localChanges: [], revision: null, localRevision: null, commits: [],
        pullRequests: pulls, coverage: null, projectTasks: []
      }} loading={false} error={null} requestedLine={null} onRefresh={vi.fn()} onFile={vi.fn()} />
    </ThemeProvider>)
    fireEvent.click(screen.getByRole('tab', { name: /Pull Request\s*2/ }))
    const secondRow = screen.getByRole('treeitem', { name: /#43 Review 43/ })
    fireEvent.contextMenu(secondRow)
    await waitFor(() => expect(openExternal).toHaveBeenLastCalledWith(pulls[1].url))
    expect(popupMenu).toHaveBeenLastCalledWith(expect.objectContaining({ items: [
      expect.objectContaining({ id: '0', label: 'Open in Browser' }),
      expect.objectContaining({ id: '1', label: 'Copy Link' })
    ] }))
    expect(secondRow.getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByRole('tab', { name: /#43 Review 43/ })).toBeNull()
    popupMenu.mockResolvedValue('1')
    fireEvent.contextMenu(secondRow)
    await waitFor(() => expect(copy).toHaveBeenLastCalledWith(pulls[1].url))

    fireEvent.click(secondRow)
    fireEvent.click(screen.getByRole('treeitem', { name: /#42 Review 42/ }))
    const firstTab = screen.getByRole('tab', { name: /#42 Review 42/ })
    const secondTab = screen.getByRole('tab', { name: /#43 Review 43/ })
    popupMenu.mockResolvedValue('0')
    fireEvent.contextMenu(secondTab)
    await waitFor(() => expect(openExternal).toHaveBeenCalledTimes(2))
    expect(openExternal).toHaveBeenLastCalledWith(pulls[1].url)
    expect(firstTab.getAttribute('aria-selected')).toBe('true')
    expect(secondTab.getAttribute('aria-selected')).toBe('false')
    popupMenu.mockResolvedValue('1')
    fireEvent.contextMenu(secondTab)
    await waitFor(() => expect(copy).toHaveBeenCalledTimes(2))
    expect(copy).toHaveBeenLastCalledWith(pulls[1].url)
  })
})

describe('the review information pane', () => {
  it('filters the code structure to the current file and jumps to the line of the chosen symbol', () => {
    const onLine = vi.fn()
    const file: ReviewFile = {
      source: 'working',
      path: 'src/workbench.ts',
      language: 'typescript',
      content: '',
      diff: [],
      symbols: [
        { name: 'Workbench', kind: 'class', line: 8, depth: 0 },
        { name: 'run', kind: 'method', line: 14, depth: 1 }
      ],
      binary: false
    }
    render(
      <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
        <CodeStructurePane file={file} requestedLine={null} onLine={onLine} />
      </ThemeProvider>
    )

    expect(screen.getByText('workbench.ts')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search code structure' }), {
      target: { value: 'run' }
    })
    expect(screen.queryByText('Workbench')).toBeNull()
    fireEvent.click(screen.getByTitle('run · line 14'))
    expect(onLine).toHaveBeenCalledWith(14)
  })

  it('lists coverage worst-gap first and sends uncovered lines to the code in order', () => {
    const onReveal = vi.fn()
    render(
      <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
        <CoveragePane
          coverage={{
            source: 'coverage/lcov.info',
            lines: { covered: 13, total: 20, percent: 65 },
            files: [
              {
                path: 'src/covered.ts',
                lines: { covered: 10, total: 10, percent: 100 },
                uncoveredLines: []
              },
              {
                path: 'src/gaps.ts',
                lines: { covered: 3, total: 10, percent: 30 },
                uncoveredLines: [4, 9]
              }
            ]
          }}
          onReveal={onReveal}
        />
      </ThemeProvider>
    )

    expect(screen.getByText('src/gaps.ts')).toBeTruthy()
    expect(screen.queryByText('src/covered.ts')).toBeNull()
    fireEvent.click(screen.getByTitle('src/gaps.ts'))
    expect(onReveal).toHaveBeenLastCalledWith('src/gaps.ts', 4)
    fireEvent.click(screen.getByRole('button', { name: 'Open the next uncovered line' }))
    expect(onReveal).toHaveBeenLastCalledWith('src/gaps.ts', 9)
  })

  it('picks a project task per definition, shows its command and runs it on Enter', () => {
    const onRun = vi.fn()
    render(
      <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
        <ProjectTasksPane
          tasks={[
            { id: 'package:check', label: 'check', source: 'package', command: "npm run 'check'" },
            { id: 'composer:test', label: 'test', source: 'composer', command: "composer run-script 'test'" }
          ]}
          onRun={onRun}
        />
      </ThemeProvider>
    )

    expect(screen.getByText('package.json')).toBeTruthy()
    expect(screen.getByText('composer.json')).toBeTruthy()
    const listbox = screen.getByRole('listbox', { name: 'Runnable project tasks' })
    fireEvent.keyDown(listbox, { key: 'ArrowDown' })
    fireEvent.keyDown(listbox, { key: 'Enter' })
    expect(onRun).toHaveBeenCalledWith('composer:test')
  })
})

it('does not let a slow file response after a switch to another task overwrite the current tab and code structure', async () => {
  let finishOld!: (file: ReviewFile) => void
  const old = new Promise<ReviewFile>((resolve) => { finishOld = resolve })
  const current: ReviewFile = { source: 'working', path: 'current.ts', language: '', content: 'current result', diff: [], symbols: [], binary: false }
  const file = vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce(current)
  Object.defineProperty(window, 'quuu', { configurable: true, value: { review: { file, closePullRequest: vi.fn() } } })
  const onFile = vi.fn()
  const props = { snapshot: null, loading: false, error: null, requestedLine: null, onRefresh: vi.fn(), onFile }
  const { rerender } = render(
    <ThemeProvider buildTheme={buildTheme}>
      <TaskMainPane {...props} task={workTask('old')} project={undefined} reveal={{ request: { source: 'working', path: 'old.ts' }, nonce: 1, line: null }} />
    </ThemeProvider>
  )
  await waitFor(() => expect(file).toHaveBeenCalledTimes(1))
  rerender(
    <ThemeProvider buildTheme={buildTheme}>
      <TaskMainPane {...props} task={workTask('current')} project={undefined} reveal={{ request: { source: 'working', path: 'current.ts' }, nonce: 2, line: null }} />
    </ThemeProvider>
  )
  await waitFor(() => expect(onFile).toHaveBeenLastCalledWith(current))
  await act(async () => {
    finishOld({ ...current, path: 'old.ts', content: 'old result' })
    await old
  })
  expect(onFile).toHaveBeenLastCalledWith(current)
  expect(screen.queryByText('old.ts')).toBeNull()
})
