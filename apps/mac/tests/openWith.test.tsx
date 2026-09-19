import { createRouterClient, implement } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionOptions } from '../src/main/agents/sessionOptions.js'
import type { Run } from '../src/main/execution/types.js'
import type { Project } from '../src/main/projects/types.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { AppSnapshot } from '../src/main/snapshot.js'
import type { Task } from '../src/main/tasks/types.js'
import { contract } from '../src/preload/contract.js'

import { copyWorkingDirItem, openWithItems, resumableCli } from '../src/renderer/src/interaction/openWith.js'
import { useStore } from '../src/renderer/src/state/store.js'

/**
 * What goes into the "open" menu. **The OS draws it**, so all this guarantees is what gets handed over.
 *
 * The main thing checked is that **no row is shown that does nothing when pressed**.
 * Showing a resume row on a task that cannot be resumed (no session, or an unknown CLI)
 * means being refused after the press.
 */

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1',
  name: 'Quuu',
  path: '/Users/me/Projects/taskd',
  color: '#4EA8DE',
  priority: 2,
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
  updatedAt: '',
  ...over
})

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  projectId: 'p1',
  title: '直す',
  prompt: '',
  status: 'review',
  priority: 2,
  seq: 1,
  scheduledAt: null,
  currentRunId: 'r1',
  sessionId: 'sess-1',
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
})

const run = (over: Partial<Run> = {}): Run => ({
  id: 'r1',
  taskId: 't1',
  agentId: 'a1',
  resolvedFromGroupId: null,
  sessionId: 'sess-1',
  kind: 'initial',
  status: 'succeeded',
  attempt: 1,
  fallbackFromRunId: null,
  pid: null,
  cwd: '/Users/me/Projects/taskd-worktrees/x',
  command: 'claude',
  args: [],
  promptPreview: '',
  exitCode: 0,
  errorKind: null,
  errorMessage: '',
  sessionLogPath: null,
  stdoutLogPath: '/tmp/r1.log',
  source: 'user',
  externalKey: null,
  startedAt: '2026-08-22T00:00:00.000Z',
  endedAt: '2026-08-22T00:01:00.000Z',
  ...over
})

function snapshot(over: Partial<AppSnapshot> = {}): AppSnapshot {
  const result: AppSnapshot = {
    projects: [project()],
    tasks: [task()],
    rules: [],
    agents: [],
    groups: [],
    runs: [run()],
    scheduler: {
      running: false,
      activeRuns: 0,
      totalSlots: 0,
      queued: 0,
      review: 0,
      failed: 0,
      agents: [],
      holds: [],
      warnings: [],
      lastTickAt: null
    },
    ...over
  }
  return { ...result, ...sessionOptions(result.tasks, result.runs, result.agents) }
}

const labels = (items: { label: string }[]): string[] => items.map((i) => i.label)

beforeEach(() => {
  useStore.setState({
    snapshot: snapshot(),
    settings: { ...DEFAULT_SETTINGS },
    editors: [
      { path: '/Applications/GoLand.app', name: 'GoLand' },
      { path: '/Applications/Xcode.app', name: 'Xcode' }
    ]
  })
})

describe('the menu for opening the working directory', () => {
  it('shows a resume row named after the CLI on a task that has a session', () => {
    expect(resumableCli('t1')).toBe('Claude Code')
    expect(labels(openWithItems({ kind: 'task', id: 't1' }))).toEqual([
      'Open in Terminal',
      'Resume Claude Code in Terminal',
      'Open in App',
      'Show in Finder'
    ])
  })

  it('shows no resume row without a session (avoiding a press that gets refused)', () => {
    useStore.setState({
      snapshot: snapshot({ tasks: [task({ sessionId: null })], runs: [] })
    })
    expect(resumableCli('t1')).toBeNull()
    expect(labels(openWithItems({ kind: 'task', id: 't1' }))).toEqual([
      'Open in Terminal',
      'Open in App',
      'Show in Finder'
    ])
  })

  it('shows none on a task that ran on an unknown CLI either', () => {
    useStore.setState({
      snapshot: snapshot({ runs: [run({ command: 'my-agent' })] })
    })
    expect(resumableCli('t1')).toBeNull()
  })

  /* Resume acts on the session of a task. Run rows and project rows do not have it */
  it('shows no resume on a run or on a project', () => {
    expect(labels(openWithItems({ kind: 'run', id: 'r1' }))).toEqual([
      'Open in Terminal',
      'Open in App',
      'Show in Finder'
    ])
    expect(labels(openWithItems({ kind: 'project', id: 'p1' }))).toEqual([
      'Open in Terminal',
      'Open in App',
      'Show in Finder'
    ])
  })

  it('makes it one row named after the app when the target is settled', () => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, editorApp: '/Applications/GoLand.app' }
    })
    expect(labels(openWithItems({ kind: 'task', id: 't1' }))).toEqual([
      'Open in Terminal',
      'Resume Claude Code in Terminal',
      'Open in GoLand',
      'Open in Another App',
      'Show in Finder'
    ])
  })

  it('lets the project setting win over the app default', () => {
    useStore.setState({
      snapshot: snapshot({ projects: [project({ editorApp: '/Applications/Xcode.app' })] }),
      settings: { ...DEFAULT_SETTINGS, editorApp: '/Applications/GoLand.app' }
    })
    expect(labels(openWithItems({ kind: 'task', id: 't1' }))[2]).toBe('Open in Xcode')
  })

  it('lists everything but the settled one, plus "choose another app...", in the submenu', () => {
    useStore.setState({
      settings: { ...DEFAULT_SETTINGS, editorApp: '/Applications/GoLand.app' }
    })
    const items = openWithItems({ kind: 'task', id: 't1' })
    const submenu = items.find((i) => i.label === 'Open in Another App')?.submenu ?? []
    expect(labels(submenu)).toEqual(['Xcode', 'Choose Another App…'])
  })

  /*
   * "Open" is one single group.
   *
   * Back when Finder sat in a separate group (next to copy), **one menu held two sets of "open"**
   * with different destinations - the terminal opened the worktree, while Finder opened
   * the registered project path. They are one set now, not even split by a rule.
   */
  it('keeps the open actions in one group with no rule breaking it up', () => {
    const items = openWithItems({ kind: 'task', id: 't1' })
    expect(items.some((i) => i.separatorBefore)).toBe(false)
    expect(labels(items).at(-1)).toBe('Show in Finder')
  })

  /*
   * main decides where to open. Pasting the path the screen believes it knows puts
   * something other than what was opened on the clipboard (they split on a worktree).
   */
  it('asks main for the same place opening uses before pasting the path', async () => {
    const copy = vi.fn<(text: string) => void>()
    const workingDir = vi.fn<(target: { kind: string; id: string }) => Promise<string>>().mockResolvedValue('/Users/me/Projects/taskd-worktrees/x')
    // The screen code reads the bare `window`. This is a node environment, so the whole base is installed
    const client = createRouterClient({ open: { workingDir: implement(contract.open.workingDir).handler(({ input }) => workingDir(input)) }, system: { copy: implement(contract.system.copy).handler(({ input }) => copy(input)) } })
    Object.assign(globalThis, { window: { quuu: client } })

    copyWorkingDirItem({ kind: 'task', id: 't1' }).onSelect?.()
    await vi.waitFor(() => expect(copy).toHaveBeenCalledWith('/Users/me/Projects/taskd-worktrees/x'))
    expect(workingDir).toHaveBeenCalledWith({ kind: 'task', id: 't1' })
  })

  /*
   * A key hint goes only on the surface that acts on the currently selected task.
   * The same hint on a project row would point somewhere else when pressed.
   */
  it('adds the key hint only on the task surface', () => {
    const withKeys = openWithItems({ kind: 'task', id: 't1' }, { accelerators: true })
    expect(withKeys[0].accelerator).toBe('Cmd+Shift+T')
    expect(withKeys[1].accelerator).toBe('Cmd+Shift+R')

    const plain = openWithItems({ kind: 'project', id: 'p1' })
    expect(plain.every((i) => i.accelerator === undefined)).toBe(true)
  })
})
