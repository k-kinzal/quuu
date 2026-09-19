// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import type { Project } from '../src/main/projects/types.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { AppSnapshot } from '../src/main/snapshot.js'
import type { Task } from '../src/main/tasks/types.js'
import { contract } from '../src/preload/contract.js'
import { Inspector } from '../src/renderer/src/components/Inspector.js'
import { queryClient } from '../src/renderer/src/state/queryClient.js'
import { useStore } from '../src/renderer/src/state/store.js'
import { buildTheme } from '../src/renderer/src/ui/theme.js'

/**
 * The dependency rows have to show **what is stored**, not what happens to be nameable.
 *
 * An archived blocker leaves the task list, so the pane used to draw no row for it at all: it
 * said "no prerequisite" while the task still carried one, and the only control that removes a
 * prerequisite lives on that row — so it could not be removed either.
 */

afterEach(cleanup)

beforeAll(() => {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => { }, removeListener: () => { },
    addEventListener: () => { }, removeEventListener: () => { }, dispatchEvent: () => false
  })
})

const PROJECT: Project = {
  id: 'p1', name: 'Quuu', path: '/Users/me/Projects/taskd', color: '#5EABF1', priority: 2,
  targetKind: 'agent', targetId: 'a1', maxConcurrent: 1, enabled: true, deletedAt: null,
  importSince: null, editorApp: '', reportEnabled: false, commitIdentityMode: 'inherit',
  commitIdentity: { appSlug: '', botUserId: '' }, source: 'user', sortOrder: 0,
  createdAt: '', updatedAt: ''
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1', projectId: 'p1', title: 'Build the parser', prompt: '', status: 'queued',
    priority: 2, seq: 0, scheduledAt: null, currentRunId: null, sessionId: null,
    agentOverrideId: null, pendingMessage: '', reservedMessage: '', reviewNote: '',
    dependsOn: [], source: 'user', ruleId: null, externalKey: null, archived: false,
    createdAt: '', updatedAt: '', doneAt: null, ...over
  }
}

const update = vi.fn<(input: { id: string; patch: { dependsOn?: unknown } }) => Promise<Task>>()

/** The blocker is archived, so it is absent from the snapshot the screen renders from. */
const WAITING = task({ dependsOn: [{ taskId: 't-archived', mode: 'done' }] })

beforeEach(() => {
  queryClient.clear()
  update.mockReset().mockResolvedValue(WAITING)
  const snapshot: AppSnapshot = {
    projects: [PROJECT], tasks: [WAITING], rules: [], agents: [], groups: [], runs: [],
    scheduler: {
      running: true, activeRuns: 0, totalSlots: 1, queued: 1, review: 0, failed: 0,
      agents: [], holds: [], warnings: [], lastTickAt: null
    }
  }
  useStore.setState({
    snapshot, settings: { ...DEFAULT_SETTINGS, reportEnabled: false }, drafts: {},
    detailOpen: true, section: { kind: 'all' }, toasts: [], runs: [], selectedRunId: null
  })
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', {
    configurable: true,
    writable: true,
    value: createRouterClient({
      tasks: { update: os.tasks.update.handler(({ input }) => update(input)) },
      runs: { byTask: os.runs.byTask.handler(() => []) }
    })
  })
})

function show(current: Task): void {
  render(
    <ThemeProvider colorScheme="dark" buildTheme={buildTheme}>
      <Inspector task={current} project={PROJECT} width={320} />
    </ThemeProvider>
  )
}

describe('a prerequisite whose task left the list', () => {
  it('still gets a row, so the pane never claims a shorter list than the one stored', async () => {
    show(WAITING)
    await waitFor(() => expect(screen.getByText('Archived task')).toBeTruthy())
    // "Add" rather than "Specify": the pane counts it as one that is already set
    expect(screen.getByText('Add')).toBeTruthy()
  })

  it('can be removed from that row, which is the only place that removes one', async () => {
    show(WAITING)
    fireEvent.click(await screen.findByText('Archived task'))
    fireEvent.click(await screen.findByText('Remove Dependency'))
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ id: 't1', patch: { dependsOn: [] } })
    )
  })

  it('says nothing about a prerequisite that was never set', () => {
    show(task())
    expect(screen.queryByText('Archived task')).toBeNull()
    expect(screen.getByText('Specify')).toBeTruthy()
  })
})
