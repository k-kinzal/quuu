// @vitest-environment jsdom
import { createRouterClient, implement } from '@orpc/server'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Project } from '../src/main/projects/types.js'
import type { AppSnapshot } from '../src/main/snapshot.js'
import type { Task } from '../src/main/tasks/types.js'
import { contract } from '../src/preload/contract.js'
import { createSwipeReader, useSwipeBackForward } from '../src/renderer/src/interaction/backForward.js'
import { runTaskListKey } from '../src/renderer/src/interaction/listNav.js'
import { NO_FILTERS } from '../src/renderer/src/model/table.js'
import { INITIAL_TRAIL } from '../src/renderer/src/state/navigation.js'
import { useStore } from '../src/renderer/src/state/store.js'

/**
 * Going back to the screen you were just looking at.
 *
 * Quuu had one direction only: every rail press, every task opened, every
 * settings category threw away where you came from. Reading a task, glancing at
 * another project and then wanting the first one back meant remembering which
 * project it had been in and finding the row again.
 *
 * What is guarded here is that the trail holds **places**, not every twitch of
 * the hands — a list walked with the arrow keys must not fill it — and that a
 * place that has since been deleted is stepped over rather than landed on.
 */

function project(id: string): Project {
  return {
    id, name: id, path: `/Users/me/Projects/${id}`, color: '#5EABF1', priority: 2,
    targetKind: 'agent', targetId: 'a1', maxConcurrent: 1, enabled: true, deletedAt: null,
    importSince: null, editorApp: '', reportEnabled: true, commitIdentityMode: 'inherit',
    commitIdentity: { appSlug: '', botUserId: '' }, source: 'user', sortOrder: 0,
    createdAt: '', updatedAt: ''
  }
}

function task(id: string, projectId: string): Task {
  return {
    id, projectId, title: `Task ${id}`, prompt: '', status: 'queued',
    priority: 2, seq: 0, scheduledAt: null, currentRunId: null, sessionId: null,
    agentOverrideId: null, pendingMessage: '', reservedMessage: '', reviewNote: '', dependsOn: [],
    source: 'user', ruleId: null, externalKey: null, archived: false,
    createdAt: '', updatedAt: '', doneAt: null
  }
}

function snapshotOf(projects: Project[], tasks: Task[]): AppSnapshot {
  return {
    projects, tasks, rules: [], agents: [], groups: [], runs: [],
    scheduler: {
      running: true, activeRuns: 0, totalSlots: 1, queued: 0, review: 0, failed: 0,
      agents: [], holds: [], warnings: [], lastTickAt: null
    }
  }
}

const snapshot = snapshotOf(
  [project('p1'), project('p2')],
  [task('one', 'p1'), task('two', 'p1'), task('three', 'p2')]
)

beforeEach(() => {
  const os = implement(contract)
  Object.defineProperty(window, 'quuu', {
    configurable: true,
    writable: true,
    value: createRouterClient({
      runs: { byTask: os.runs.byTask.handler(() => []) },
      session: { close: os.session.close.handler(() => undefined) }
    })
  })
  useStore.setState({
    snapshot, trail: INITIAL_TRAIL, section: { kind: 'all' }, filters: NO_FILTERS,
    cursorTaskId: null, detailOpen: false, projectSettingsOpen: false,
    settingsCategory: 'general', editingAgentId: null, editingGroupId: null,
    runs: [], selectedRunId: null, session: null, paletteOpen: false
  })
})

describe('back and forward', () => {
  it('returns to the screen that was on before this one', async () => {
    const s = (): ReturnType<typeof useStore.getState> => useStore.getState()
    s().setSection({ kind: 'project', id: 'p1' })
    await s().openTask('one')
    s().setSection({ kind: 'project', id: 'p2' })

    expect(await s().goBack()).not.toBeNull()
    expect(s().section).toEqual({ kind: 'project', id: 'p1' })
    expect(s().cursorTaskId).toBe('one')
    expect(s().detailOpen).toBe(true)
  })

  it('goes forward again to the screen it stepped back from', async () => {
    const s = (): ReturnType<typeof useStore.getState> => useStore.getState()
    await s().openTask('one')
    s().setSection({ kind: 'settings' })

    await s().goBack()
    expect(s().detailOpen).toBe(true)
    await s().goForward()
    expect(s().section).toEqual({ kind: 'settings' })
  })

  it('brings back the row that was highlighted when the screen was left', async () => {
    const s = (): ReturnType<typeof useStore.getState> => useStore.getState()
    await s().moveCursor('two')
    s().setSection({ kind: 'settings' })

    await s().goBack()
    expect(s().section).toEqual({ kind: 'all' })
    expect(s().cursorTaskId).toBe('two')
    expect(s().detailOpen).toBe(false)
  })

  it('does nothing at either end of the trail (a swipe past the start is not a failure)', async () => {
    const s = (): ReturnType<typeof useStore.getState> => useStore.getState()
    expect(await s().goBack()).toBeNull()
    expect(await s().goForward()).toBeNull()
    expect(s().section).toEqual({ kind: 'all' })
  })

  it('drops what lay ahead once another path is taken', async () => {
    const s = (): ReturnType<typeof useStore.getState> => useStore.getState()
    await s().openTask('one')
    await s().goBack()
    s().setSection({ kind: 'project', id: 'p2' })

    // The task opened earlier was gone forward into, and is no longer ahead of anything
    expect(await s().goForward()).toBeNull()
    expect(s().section).toEqual({ kind: 'project', id: 'p2' })
  })

  it('steps over a task that has since been deleted instead of landing on nothing', async () => {
    const s = (): ReturnType<typeof useStore.getState> => useStore.getState()
    await s().openTask('one')
    await s().openTask('two')
    s().setSection({ kind: 'settings' })
    useStore.setState({ snapshot: snapshotOf(snapshot.projects, [task('one', 'p1'), task('three', 'p2')]) })

    await s().goBack()
    expect(s().cursorTaskId).toBe('one')
    expect(s().detailOpen).toBe(true)
  })

  it('steps over a project that is no longer there', async () => {
    const s = (): ReturnType<typeof useStore.getState> => useStore.getState()
    s().setSection({ kind: 'project', id: 'p2' })
    s().setSection({ kind: 'settings' })
    useStore.setState({ snapshot: snapshotOf([project('p1')], snapshot.tasks) })

    await s().goBack()
    expect(s().section).toEqual({ kind: 'all' })
  })

  it('carries no filter into a section that never had it', async () => {
    const s = (): ReturnType<typeof useStore.getState> => useStore.getState()
    s().setSection({ kind: 'project', id: 'p1' })
    s().setFilters({ statuses: ['queued'] })
    s().setSection({ kind: 'settings' })

    await s().goBack()
    expect(useStore.getState().filters).toEqual(NO_FILTERS)
  })
})

describe('what counts as somewhere you have been', () => {
  it('files a task opened from a notification as one step, not two', async () => {
    const s = (): ReturnType<typeof useStore.getState> => useStore.getState()
    s().setSection({ kind: 'project', id: 'p1' })
    // 'three' lives in another project, so revealing it has to change section first
    await s().revealTask('three')
    expect(s().section).toEqual({ kind: 'all' })

    await s().goBack()
    expect(s().section).toEqual({ kind: 'project', id: 'p1' })
    expect(s().detailOpen).toBe(false)
  })

  it('leaves one step behind when a project configuration is opened over a task', async () => {
    const s = (): ReturnType<typeof useStore.getState> => useStore.getState()
    s().setSection({ kind: 'project', id: 'p1' })
    await s().openTask('one')
    s().openProjectSettings(true)

    await s().goBack()
    expect(s().projectSettingsOpen).toBe(false)
    expect(s().detailOpen).toBe(true)
    expect(s().cursorTaskId).toBe('one')
  })

  it('does not file every row the arrow keys pass over', async () => {
    const s = (): ReturnType<typeof useStore.getState> => useStore.getState()
    await s().openTask('one')
    const depth = s().trail.places.length

    const ordered = [task('one', 'p1'), task('two', 'p1'), task('three', 'p2')]
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp']) {
      runTaskListKey({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, preventDefault: () => undefined }, ordered)
    }

    expect(s().cursorTaskId).toBe('two')
    expect(s().detailOpen).toBe(true)
    expect(s().trail.places.length).toBe(depth)
  })

  it('keeps the trail to a bounded depth however long the window stays open', () => {
    const s = (): ReturnType<typeof useStore.getState> => useStore.getState()
    for (let i = 0; i < 120; i++) {
      s().setSection(i % 2 === 0 ? { kind: 'review' } : { kind: 'all' })
    }
    expect(s().trail.places.length).toBeLessThanOrEqual(50)
    expect(s().trail.index).toBe(s().trail.places.length - 1)
  })
})

/**
 * A swipe arrives as plain horizontal scrolling, so it has to be read back out
 * of the deltas. The thresholds are what stop a hand resting on the trackpad
 * from navigating, and what stop one flick's momentum from navigating twice.
 */
describe('reading a swipe out of the trackpad', () => {
  function swipe(read: (s: { deltaX: number; deltaY: number; timeStamp: number }) => void, x: number, y = 0, from = 1000): void {
    // One flick arrives as a stream of small deltas, not a single jump
    for (let i = 0; i < 10; i++) read({ deltaX: x / 10, deltaY: y / 10, timeStamp: from + i * 8 })
  }

  it('goes back when the swipe carries the screen far enough to the right', () => {
    const steps: number[] = []
    const read = createSwipeReader((step) => steps.push(step))
    swipe(read, -200)
    expect(steps).toEqual([-1])
  })

  it('goes forward on a swipe the other way', () => {
    const steps: number[] = []
    const read = createSwipeReader((step) => steps.push(step))
    swipe(read, 200)
    expect(steps).toEqual([1])
  })

  it('ignores a nudge too short to be meant as a swipe', () => {
    const steps: number[] = []
    const read = createSwipeReader((step) => steps.push(step))
    swipe(read, -40)
    expect(steps).toEqual([])
  })

  it('moves one step per flick, however long its momentum runs on', () => {
    const steps: number[] = []
    const read = createSwipeReader((step) => steps.push(step))
    // 600px of travel with no pause is still one gesture — the tail is the trackpad coasting
    for (let i = 0; i < 60; i++) read({ deltaX: -10, deltaY: 0, timeStamp: 1000 + i * 8 })
    expect(steps).toEqual([-1])
  })

  /*
   * The step a flick takes redraws the window, and that work can break the
   * stream and hand back the rest of the same flick looking like a fresh one.
   * Driving this at the real app, one swipe went back two screens.
   */
  it('does not take a second step from the tail of a flick that arrives late', () => {
    const steps: number[] = []
    const read = createSwipeReader((step) => steps.push(step))
    for (let i = 0; i < 5; i++) read({ deltaX: -20, deltaY: 0, timeStamp: 1000 + i * 8 })
    expect(steps).toEqual([-1])
    // The rest of the same flick, after a gap far longer than an ordinary pause between events
    for (let i = 0; i < 7; i++) read({ deltaX: -20, deltaY: 0, timeStamp: 1400 + i * 8 })
    expect(steps).toEqual([-1])
  })

  it('leaves a scroll that merely drifted sideways alone', () => {
    const steps: number[] = []
    const read = createSwipeReader((step) => steps.push(step))
    swipe(read, -200, -400)
    expect(steps).toEqual([])
  })

  it('reads the next flick once the trackpad has been still in between', () => {
    const steps: number[] = []
    const read = createSwipeReader((step) => steps.push(step))
    swipe(read, -200, 0, 1000)
    swipe(read, -200, 0, 4000)
    expect(steps).toEqual([-1, -1])
  })
})

/**
 * Which swipe counts is the Mac's to say, not Quuu's.
 *
 * Set to swipe between pages with three fingers, a two-finger sideways scroll is
 * just a scroll there — in every other app on that Mac, and so here too.
 */
describe('following how this Mac is set to swipe between pages', () => {
  afterEach(cleanup)

  function Swipes(): null {
    useSwipeBackForward()
    return null
  }

  /** Mount the swipe reader on a Mac set one way or the other, standing one step in from the start. */
  async function mount(twoFingerSwipes: boolean): Promise<void> {
    let asked = false
    const os = implement(contract)
    Object.defineProperty(window, 'quuu', {
      configurable: true,
      writable: true,
      value: createRouterClient({
        runs: { byTask: os.runs.byTask.handler(() => []) },
        session: { close: os.session.close.handler(() => undefined) },
        system: { scrollSwipes: os.system.scrollSwipes.handler(() => { asked = true; return twoFingerSwipes }) }
      })
    })
    useStore.getState().setSection({ kind: 'project', id: 'p1' })
    render(<Swipes />)
    await waitFor(() => expect(asked).toBe(true))
    // Let the answer land before the fingers move
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  function flick(deltaX: number): void {
    for (let i = 0; i < 10; i++) window.dispatchEvent(new WheelEvent('wheel', { deltaX: deltaX / 10 }))
  }

  it('goes back on a two-finger swipe when the Mac swipes between pages with two fingers', async () => {
    await mount(true)
    flick(-200)
    await waitFor(() => expect(useStore.getState().section).toEqual({ kind: 'all' }))
  })

  it('leaves a two-finger sideways scroll as a scroll when the Mac swipes with three fingers', async () => {
    await mount(false)
    flick(-200)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(useStore.getState().section).toEqual({ kind: 'project', id: 'p1' })
    expect(useStore.getState().trail.index).toBe(1)
  })
})
