// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import type { Project } from '../src/main/projects/types.js'
import type { AppSnapshot } from '../src/main/snapshot.js'
import type { Task } from '../src/main/tasks/types.js'
import { contract } from '../src/preload/contract.js'
import { Toasts } from '../src/renderer/src/components/Toasts.js'
import { NO_FILTERS } from '../src/renderer/src/model/table.js'
import { useStore, type Section } from '../src/renderer/src/state/store.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

/**
 * A notification is an entrance, not a destination.
 *
 * Pressing one used to throw the person to "all tasks" (or the review list) even when the
 * project they were reading held the task the whole time. And since a press always led
 * somewhere, a failure that had been read and only needed to go away could not be cleared
 * without leaving. That actually happened.
 */

afterEach(cleanup)

beforeAll(() => {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => { }, removeListener: () => { },
    addEventListener: () => { }, removeEventListener: () => { }, dispatchEvent: () => false
  })
})

function project(id: string): Project {
  return {
    id, name: id, path: `/Users/me/Projects/${id}`, color: '#5EABF1', priority: 2,
    targetKind: 'agent', targetId: 'a1', maxConcurrent: 1, enabled: true, deletedAt: null,
    importSince: null, editorApp: '', reportEnabled: true, commitIdentityMode: 'inherit',
    commitIdentity: { appSlug: '', botUserId: '' }, source: 'user', sortOrder: 0,
    createdAt: '', updatedAt: ''
  }
}

function task(id: string, projectId: string, status: Task['status']): Task {
  return {
    id, projectId, title: `Task ${id}`, prompt: '', status,
    priority: 2, seq: 0, scheduledAt: null, currentRunId: null, sessionId: null,
    agentOverrideId: null, pendingMessage: '', reservedMessage: '', reviewNote: '', dependsOn: [],
    source: 'user', ruleId: null, externalKey: null, archived: false,
    createdAt: '', updatedAt: '', doneAt: null
  }
}

const snapshot: AppSnapshot = {
  projects: [project('p1'), project('p2')],
  tasks: [task('waiting', 'p1', 'review'), task('queued', 'p2', 'queued'), task('finished', 'p1', 'done')],
  rules: [], agents: [], groups: [], runs: [],
  scheduler: {
    running: true, activeRuns: 0, totalSlots: 1, queued: 0, review: 0, failed: 0,
    agents: [], holds: [], warnings: [], lastTickAt: null
  }
}

function open(section: Section): void {
  useStore.setState({
    snapshot, section, filters: NO_FILTERS, detailOpen: false, cursorTaskId: null,
    toasts: [], runs: [], selectedRunId: null, session: null
  })
}

beforeEach(() => {
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', {
    configurable: true,
    writable: true,
    value: createRouterClient({ runs: { byTask: os.runs.byTask.handler(() => []) } })
  })
})

describe('opening a task from a notification', () => {
  it('stays in the project being read when that project holds the task', async () => {
    open({ kind: 'project', id: 'p1' })
    await useStore.getState().revealTask('waiting')
    expect(useStore.getState().section).toEqual({ kind: 'project', id: 'p1' })
    expect(useStore.getState().cursorTaskId).toBe('waiting')
    expect(useStore.getState().detailOpen).toBe(true)
  })

  it('stays in the review list when the task is waiting there', async () => {
    open({ kind: 'review' })
    await useStore.getState().revealTask('waiting')
    expect(useStore.getState().section).toEqual({ kind: 'review' })
    expect(useStore.getState().detailOpen).toBe(true)
  })

  it('does not leave a section for a done task it holds behind the done filter', async () => {
    open({ kind: 'project', id: 'p1' })
    await useStore.getState().revealTask('finished')
    expect(useStore.getState().section).toEqual({ kind: 'project', id: 'p1' })
    expect(useStore.getState().cursorTaskId).toBe('finished')
  })

  it('moves to the review list when another project is open and the task waits for review', async () => {
    open({ kind: 'project', id: 'p2' })
    await useStore.getState().revealTask('waiting')
    expect(useStore.getState().section).toEqual({ kind: 'review' })
    expect(useStore.getState().cursorTaskId).toBe('waiting')
  })

  it('moves to all tasks when nothing on screen or in review holds the task', async () => {
    open({ kind: 'settings' })
    await useStore.getState().revealTask('queued')
    expect(useStore.getState().section).toEqual({ kind: 'all' })
    expect(useStore.getState().cursorTaskId).toBe('queued')
  })
})

describe('the notification itself', () => {
  function show(): void {
    render(
      <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
        <Toasts />
      </ThemeProvider>
    )
  }

  it('can be cleared from its close control without going anywhere', () => {
    open({ kind: 'project', id: 'p2' })
    useStore.getState().pushToast({ id: 'n1', level: 'error', message: 'The report could not be written', taskId: 'waiting' })
    show()
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(useStore.getState().toasts).toEqual([])
    expect(useStore.getState().section).toEqual({ kind: 'project', id: 'p2' })
    expect(useStore.getState().detailOpen).toBe(false)
  })

  it('opens the task when its body is pressed, and goes away', async () => {
    open({ kind: 'project', id: 'p1' })
    useStore.getState().pushToast({ id: 'n2', level: 'error', message: 'The report could not be written', taskId: 'waiting' })
    show()
    fireEvent.click(screen.getByText('The report could not be written'))
    await waitFor(() => expect(useStore.getState().detailOpen).toBe(true))
    expect(useStore.getState().cursorTaskId).toBe('waiting')
    expect(useStore.getState().section).toEqual({ kind: 'project', id: 'p1' })
    expect(useStore.getState().toasts).toEqual([])
  })
})
