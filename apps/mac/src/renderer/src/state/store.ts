import { paneProfiles, restorePaneWidth, type PaneWidth } from '@design-system/react/layout-spec'
import { create } from 'zustand'
import { scopeTasks, type ScopeFilter } from '../model/derive.js'
import { failureMessage, failureReason } from '../model/operationFailure.js'
import type { ColumnWidths, TaskColumnId, TaskFilters, TaskSort, TaskSortKey } from '../model/table.js'
import { NO_FILTERS, nextSort } from '../model/table.js'

import type { Run, SchedulerStatus } from '../../../preload/api/execution.js'
import type { SessionSnapshot } from '../../../preload/api/session.js'
import type { AppSettings } from '../../../preload/api/settings.js'
import type { AppSnapshot, ToastPayload } from '../../../preload/api/snapshot.js'
import type { AddAction, Task } from '../../../preload/api/tasks.js'

import type { EditorApp } from '../../../preload/api/desktop.js'

import { mergeMessages } from '../model/mergeMessages.js'
import type { NewTaskLink } from '../model/taskLinkModel.js'
import type { DraftStorage, Drafts } from './drafts.js'
import { loadDrafts, pruneDrafts, saveDrafts, setDraftIn } from './drafts.js'
import type { Place, Section, SettingsCategory, Trail } from './navigation.js'
import { INITIAL_PLACE, INITIAL_TRAIL, placeOf, record, sameSection, stepTo } from './navigation.js'
import { reconcileSnapshot, sameValue } from './reconcile.js'

export type { Place, Section, SettingsCategory } from './navigation.js'

/**
 * How far L1 collapses while the detail is open (rule C).
 *   compact … rows stay identifiable by title and navigable up/down (default)
 *   hidden  … hidden. Pressing the edge handle returns to compact (explicit action only)
 *
 * No "squeeze the width and shed information" step. A collapsed form you cannot
 * tell apart earns area while delivering zero value (rule C-2).
 *
 * On screen these three steps are called "minimize / side-by-side / maximize".
 * Maximize is not a list state — it is `detailOpen: false` (the full-width table)
 * itself — so it does not live here. Presenting them as one "list size" axis is
 * the UI's job, not how the state is held.
 */
export type ListMode = 'compact' | 'hidden'

export interface Layout {
  rail: PaneWidth
  /** Width of the list in side-by-side view. */
  list: PaneWidth
  listMode: ListMode
  inspector: PaneWidth
  railCollapsed: boolean
  inspectorOpen: boolean
}

/*
 * The localStorage keys keep the old name (taskd). Changing them when renaming
 * to Quuu would make the already-saved pane widths, sort, and queue target
 * unreadable and reset them to defaults. The user's surviving state beats the
 * name of a key nobody sees.
 */
const LAYOUT_KEY = 'taskd.layout.v8'

const DEFAULT_LAYOUT: Layout = {
  rail: paneProfiles.navigation.initial,
  list: paneProfiles.collection.initial,
  listMode: 'compact',
  inspector: paneProfiles.inspector.initial,
  railCollapsed: false,
  inspectorOpen: true
}

/**
 * Where drafts are stored. Where localStorage is missing, reads and writes
 * throw, but `drafts.ts` swallows that and degrades to "just not saved".
 */
const DRAFT_STORAGE: DraftStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value)
}

function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return DEFAULT_LAYOUT
    const saved = JSON.parse(raw) as Partial<Layout>
    return {
      ...DEFAULT_LAYOUT, ...saved,
      rail: restorePaneWidth('navigation', saved.rail),
      list: restorePaneWidth('collection', saved.list),
      inspector: restorePaneWidth('inspector', saved.inspector)
    }
  } catch {
    return DEFAULT_LAYOUT
  }
}

/**
 * How the full-width table looks (column widths and sort order).
 *
 * **Only the look is kept — never the filters.** Widths and sort are tool
 * settings, so they should be the same next time, but filters that outlive a
 * restart look like "only 3 rows after launch". Never carry over a state that
 * makes the user hunt for vanished rows.
 */
export interface TableView {
  sort: TaskSort | null
  widths: ColumnWidths
}

const TABLE_KEY = 'taskd.table.v1'

const DEFAULT_TABLE: TableView = { sort: null, widths: {} }

function loadTable(): TableView {
  try {
    const raw = localStorage.getItem(TABLE_KEY)
    if (!raw) return DEFAULT_TABLE
    const saved = JSON.parse(raw) as Partial<TableView>
    return {
      sort: saved.sort ?? null,
      widths: saved.widths ?? {}
    }
  } catch {
    return DEFAULT_TABLE
  }
}

/**
 * The queue-target project the user last picked themselves.
 *
 * Both queueing surfaces (the list's one-line input, the bottom composer) get
 * unmounted, so holding the chosen target in a component would reset it to the
 * default on every screen change. Queueing into the same place repeatedly is a
 * real usage, so it lives here and **survives closing the window**.
 *
 * No cleanup even when it points at a deleted / archived project. Target
 * resolution (`defaultTargetProjectId`) only looks at projects that can be
 * queued into, so that case degrades to the same as having picked nothing.
 */
const TARGET_KEY = 'taskd.target.v1'

function loadTargetProject(): string | null {
  try {
    return localStorage.getItem(TARGET_KEY)
  } catch {
    return null
  }
}

function saveTable(set: (patch: Partial<State>) => void, table: TableView): void {
  set({ table })
  try {
    localStorage.setItem(TABLE_KEY, JSON.stringify(table))
  } catch {
    // The table still works without storage
  }
}

interface State {
  ready: boolean
  initializationError: string | null
  snapshot: AppSnapshot | null
  windowLayout: { leftInset: number; collapsedRailWidth: number; overhang: number }
  settings: AppSettings | null
  /**
   * Installed IDEs / editors. Counted once at startup and kept.
   *
   * Menus are assembled synchronously (a single template handed to the OS), so
   * we cannot go look at the disk once they open. After reinstalling apps, the
   * settings pane recounts (`refreshEditors`).
   */
  editors: EditorApp[]
  section: Section

  /** The row highlighted in L1. The detail is not necessarily open. */
  cursorTaskId: string | null
  /** Whether L2 is open. */
  detailOpen: boolean
  landedTaskId: string | null

  settingsCategory: SettingsCategory
  editingAgentId: string | null
  editingGroupId: string | null
  /** Whether the project's configuration is open inside that project's screen (rule F). */
  projectSettingsOpen: boolean
  editingRuleId: string | null
  /** Everywhere this window has been, and how far back through it we have stepped (`navigation.ts`). */
  trail: Trail

  runs: Run[]
  selectedRunId: string | null
  session: SessionSnapshot | null
  sessionLoading: boolean

  toasts: ToastPayload[]
  layout: Layout
  /** Columns of the full-width table (widths and sort order). Persisted. */
  table: TableView
  /** Table filters. Not persisted (cleared when leaving the section). */
  filters: TaskFilters
  /** The queue-target project the user last picked. Persisted. */
  targetProjectId: string | null
  /** New-task choices stay separate for each project and survive composer unmounts. */
  newTaskAgentIds: Record<string, string | null>
  /**
   * The add action the user last picked. null queues into waiting (`defaultAddAction`).
   *
   * The queueing surfaces get unmounted so it lives in the store, but it is
   * **not persisted**. Closing the window with "run now" picked would leave the
   * next launch waiting in that shape. A choice to run must not carry across launches.
   */
  addAction: AddAction | null
  /**
   * The link the next queued task will carry (`lib/taskLink.ts`).
   *
   * The queueing surfaces get unmounted so it lives here, but it is **not
   * persisted**. Ordering is contextual — "a follow-up to the task I'm reading
   * now" — so surviving a restart would make unrelated tasks wait.
   */
  newTaskLink: NewTaskLink | null
  /** Whether the command palette (⌘T) is open. */
  paletteOpen: boolean
  /**
   * Instructions being written (rule D-②).
   * The composer gets unmounted, so drafts live outside the component.
   */
  drafts: Drafts

  init(): Promise<void>
  setSection(section: Section): void
  /**
   * Step back / forward through the screens already seen. Returns where it
   * landed so the caller can hand that pane the keyboard, or null when the
   * trail has no reachable step left in that direction.
   */
  goBack(): Promise<Place | null>
  goForward(): Promise<Place | null>
  /** Bring done tasks into / out of scope. Backed by the filters (`filters.includeDone`). */
  toggleShowDone(): void

  moveCursor(taskId: string | null): Promise<void>
  openTask(taskId: string): Promise<void>
  /** Open a task a notification points at, staying in the current section when it holds the task. */
  revealTask(taskId: string): Promise<void>
  closeDetail(): void

  setSettingsCategory(category: SettingsCategory): void
  editAgent(id: string | null): void
  editGroup(id: string | null): void
  openProjectSettings(open: boolean): void
  editRule(id: string | null): void

  selectRun(runId: string): Promise<void>
  refreshRuns(taskId: string): Promise<void>
  loadMoreSession(direction?: 'older' | 'newer' | 'latest'): Promise<void>

  setLayout(patch: Partial<Layout>): void

  /** Sorting on header click. Cycles ascending → descending → default. */
  toggleSort(key: TaskSortKey): void
  /** Set the sort outright (picking "ascending / descending / unsorted" from the menu). */
  setSort(sort: TaskSort | null): void
  setColumnWidth(id: TaskColumnId, width: number): void
  resetColumnWidth(id: TaskColumnId): void
  setFilters(patch: Partial<TaskFilters>): void
  /** Reset sort, widths, and filters to defaults at once. */
  resetTableView(): void

  /** Re-pick the queue target (only when picked from the menu; not called when the hierarchy decides). */
  setTargetProject(projectId: string): void
  setNewTaskAgent(projectId: string, agentId: string | null): void
  /** Re-pick the add action (null returns to "follow what was written"). */
  setAddAction(action: AddAction | null): void
  /** Deposit / clear the link (null returns to a task with no link). */
  setNewTaskLink(link: NewTaskLink | null): void

  setPalette(open: boolean): void
  setDraft(key: string, text: string): void
  reportFailure(error: unknown, path?: readonly string[], notify?: boolean): void
  pushToast(toast: ToastPayload): void
  dismissToast(id: string): void
  setSettings(patch: Partial<AppSettings>): Promise<void>
  /** Recount installed IDEs / editors (when the settings pane opens). */
  refreshEditors(): Promise<void>
  applySnapshot(snapshot: AppSnapshot): void
  applyScheduler(status: SchedulerStatus): void
  markLanded(taskId: string): void
  markDoneAndAdvance(taskId: string, ordered: string[]): Promise<void>
}

let initStarted = false
const reportedFailures = new WeakMap<object, { id: string; inline: boolean }>()

let sessionRequest = 0
let sessionEvent = 0

/** The scope a section lists, before any filter. `null` for surfaces that list no tasks. */
function sectionScope(section: Section): ScopeFilter | null {
  if (section.kind === 'settings') return null
  return { kind: section.kind, projectId: section.kind === 'project' ? section.id : undefined, showDone: true }
}

function sectionShows(snapshot: AppSnapshot, section: Section, taskId: string): boolean {
  const scope = sectionScope(section)
  return scope !== null && scopeTasks(snapshot, scope).some((task) => task.id === taskId)
}

/** Set while a move is being written down, so moves made inside a move do not become steps of their own. */
let recording = false

/**
 * Make a move, and write where it went into the trail.
 *
 * One press is one step back. Several of these actions call each other —
 * opening a project's configuration closes the detail first, a notification
 * changes section and then opens the task — and without this the person would
 * have to press back twice to undo what they pressed once.
 */
function navigate<T>(set: (patch: Partial<State>) => void, get: () => State, move: () => T): T {
  if (recording) return move()
  recording = true
  try {
    const from = placeOf(get())
    const result = move()
    set({ trail: record(get().trail, from, placeOf(get())) })
    return result
  } finally {
    recording = false
  }
}

/**
 * Step through the trail.
 *
 * Where we are standing is written back before leaving, so a row highlighted
 * since arriving is still highlighted on the way forward again. The conversation
 * is let go and re-read: the entry holds which task is open, never how far down
 * its conversation had been read.
 */
async function travel(
  set: (patch: Partial<State>) => void,
  get: () => State,
  step: -1 | 1
): Promise<Place | null> {
  const trail = get().trail
  const index = stepTo(trail, step, get().snapshot)
  if (index === null) return null

  const from = placeOf(get())
  const places = trail.places.slice()
  places[trail.index] = from
  const place = places[index]

  if (get().selectedRunId) void window.quuu.session.close()
  set({
    ...place,
    trail: { places, index },
    paletteOpen: false,
    runs: [],
    selectedRunId: null,
    session: null,
    // Filters belong to the section (the same rule as `setSection`). Arriving in another one carries none over
    filters: sameSection(from.section, place.section) ? get().filters : NO_FILTERS
  })
  if (place.detailOpen && place.cursorTaskId) await get().refreshRuns(place.cursorTaskId)
  return place
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  initializationError: null,
  snapshot: null,
  windowLayout: { leftInset: 0, collapsedRailWidth: 0, overhang: 0 },
  settings: null,
  editors: [],
  ...INITIAL_PLACE,
  landedTaskId: null,
  trail: INITIAL_TRAIL,

  runs: [],
  selectedRunId: null,
  session: null,
  sessionLoading: false,

  toasts: [],
  layout: loadLayout(),
  table: loadTable(),
  filters: NO_FILTERS,
  targetProjectId: loadTargetProject(),
  newTaskAgentIds: {},
  addAction: null,
  newTaskLink: null,
  paletteOpen: false,
  drafts: loadDrafts(DRAFT_STORAGE),

  async init() {
    // React StrictMode runs effects twice. Subscribing twice duplicates
    // toasts and snapshots, so let this through only once.
    if (get().ready || initStarted) return
    initStarted = true

    set({ initializationError: null })
    const result = await Promise.all([
      window.quuu.snapshot(),
      window.quuu.settings.get(),
      window.quuu.system.windowLayout()
    ]).catch(error => {
      initStarted = false
      set({ initializationError: failureReason(error) })
      get().reportFailure(error, ['snapshot'])
      return null
    })
    if (!result) return
    const [snapshot, settings, windowLayout] = result
    // Drafts whose destination is gone never appear on screen again. Drop them on
    // every launch so they don't pile up (archived tasks leave the list too, so they drop here)
    const drafts = pruneDrafts(get().drafts, {
      taskIds: snapshot.tasks.map((t) => t.id),
      projectIds: snapshot.projects.map((p) => p.id)
    })
    set({ snapshot, settings, windowLayout, ready: true, drafts })
    saveDrafts(DRAFT_STORAGE, drafts)

    // Don't hold up startup. The IDE list only has to be ready by the first menu open
    void get().refreshEditors()

    window.quuuEvents.snapshot((next) => get().applySnapshot(next))
    window.quuuEvents.schedulerStatus((status) => get().applyScheduler(status))
    window.quuuEvents.toast((toast) => get().pushToast(toast))

    window.quuuEvents.sessionAppended((payload) => {
      const session = get().session
      // Match on the Run, not the session ID. When main finds the real log file
      // and swaps what it watches, the ID can change while the Run stays the same.
      if (payload.runId !== get().selectedRunId || (!session && !payload.replacement)) return
      sessionEvent++
      set({
        session: {
          ...(session ?? { logPath: null, title: null, hasMore: false, totalMessages: 0 }),
          ...payload.replacement,
          sessionId: payload.sessionId,
          messages: mergeMessages(session?.messages ?? [], payload),
          exists: true
        }
      })
    })
  },

  // Rule A-1: picking a section never opens the detail. Show the whole picture first.
  setSection(section) {
    navigate(set, get, () => {
      if (get().selectedRunId) void window.quuu.session.close()
      set({
        section,
        detailOpen: false,
        paletteOpen: false,
        cursorTaskId: null,
        runs: [],
        selectedRunId: null,
        session: null,
        editingAgentId: null,
        editingGroupId: null,
        projectSettingsOpen: false,
        editingRuleId: null,
        // Filters belong to the section. Carried over, the destination becomes an
        // inexplicably short list (a project filter carried into another project shows 0 rows)
        filters: NO_FILTERS
      })
    })
  },

  async goBack() {
    return travel(set, get, -1)
  },

  async goForward() {
    return travel(set, get, 1)
  },

  toggleShowDone() {
    const filters = get().filters
    const includeDone = !filters.includeDone
    set({
      filters: {
        ...filters,
        includeDone,
        /* When taking done out of scope, also drop a "done" left in the status
           filter. Kept, the list turns to 0 rows the moment it's excluded, with no readable reason */
        statuses: includeDone ? filters.statuses : filters.statuses.filter((s) => s !== 'done')
      }
    })
  },

  async moveCursor(taskId) {
    set({ cursorTaskId: taskId })
    if (!taskId) {
      if (get().selectedRunId) void window.quuu.session.close()
      set({ runs: [], selectedRunId: null, session: null })
      return
    }
    if (get().detailOpen) await get().refreshRuns(taskId)
  },

  async openTask(taskId) {
    navigate(set, get, () => set({ cursorTaskId: taskId, detailOpen: true, projectSettingsOpen: false }))
    await get().refreshRuns(taskId)
  },

  /**
   * A notification is an entrance, not a destination. When the section already on screen
   * holds the task — the project being read, the review list it is waiting in, all tasks —
   * open it right there. Being thrown to "all tasks" from the project you were in, for a
   * task that was in view the whole time, is the accident. Only when this section cannot
   * show it (settings, another project) move: to the review list if the task is waiting
   * there, otherwise to all tasks.
   *
   * "Holds" means the section's scope, not what the filters on top of it currently let
   * through. A done task hidden by the done filter is still this project's; leaving for a
   * section that hides it just the same would trade the person's place for nothing.
   */
  async revealTask(taskId) {
    const { section, snapshot } = get()
    const shows = (candidate: Section): boolean => snapshot !== null && sectionShows(snapshot, candidate, taskId)
    const review: Section = { kind: 'review' }
    const destination: Section = shows(section) ? section : shows(review) ? review : { kind: 'all' }
    /*
     * Moving section and opening the task are one step, not two. Back from a task a
     * notification opened returns to where the notification arrived — not to a list
     * that was never on screen.
     */
    await navigate(set, get, () => {
      if (!sameSection(destination, section)) get().setSection(destination)
      return get().openTask(taskId)
    })
  },

  closeDetail() {
    navigate(set, get, () => {
      if (get().selectedRunId) void window.quuu.session.close()
      set({ detailOpen: false, session: null, selectedRunId: null, runs: [] })
    })
  },

  setSettingsCategory(category) {
    navigate(set, get, () => set({ settingsCategory: category, editingAgentId: null, editingGroupId: null }))
  },

  editAgent(id) {
    navigate(set, get, () => set({ editingAgentId: id, editingGroupId: null }))
  },
  editGroup(id) {
    navigate(set, get, () => set({ editingGroupId: id, editingAgentId: null }))
  },
  openProjectSettings(open) {
    navigate(set, get, () => {
      if (open) get().closeDetail()
      set({ projectSettingsOpen: open, detailOpen: false, editingRuleId: null })
    })
  },
  editRule(id) {
    const rule = get().snapshot?.rules.find((r) => r.id === id)
    // A newly created rule can arrive in the snapshot just after its create reply.
    navigate(set, get, () => {
      if (rule) {
        const section = get().section
        if (section.kind !== 'project' || section.id !== rule.projectId) get().setSection({ kind: 'project', id: rule.projectId })
        if (!get().projectSettingsOpen) get().openProjectSettings(true)
      }
      set({ editingRuleId: id })
    })
  },

  async refreshRuns(taskId) {
    const runs = await window.quuu.runs.byTask(taskId)
    if (get().cursorTaskId !== taskId || !get().detailOpen) return

    const current = get().selectedRunId
    // If the latest was being read, follow the next run too. Never move someone who picked history.
    const following = !current || current === get().runs[0]?.id
    const keep = !following && runs.some((r) => r.id === current) ? current : (runs[0]?.id ?? null)
    set({ runs })

    if (keep) {
      if (keep !== current || !get().session) await get().selectRun(keep)
    } else {
      set({ selectedRunId: null, session: null })
    }
  },

  async selectRun(runId) {
    const request = ++sessionRequest
    const event = sessionEvent
    set({ selectedRunId: runId, session: null, sessionLoading: true })
    try {
      const session = await window.quuu.session.load(runId)
      if (get().selectedRunId !== runId || request !== sessionRequest) return
      set({ session: event === sessionEvent ? session : get().session, sessionLoading: false })
    } catch {
      if (get().selectedRunId !== runId || request !== sessionRequest) return
      set({ sessionLoading: false })
    }
  },

  async loadMoreSession(direction = 'older') {
    const request = ++sessionRequest
    const event = sessionEvent
    const runId = get().selectedRunId
    if (!runId) return
    const session = await window.quuu.session.loadMore({ runId, direction })
    if (get().selectedRunId !== runId || request !== sessionRequest || event !== sessionEvent) return
    set({ session })
  },

  setLayout(patch) {
    const layout = { ...get().layout, ...patch }
    set({ layout })
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
    } catch {
      // Layout still works without storage
    }
  },

  toggleSort(key) {
    saveTable(set, { ...get().table, sort: nextSort(get().table.sort, key) })
  },

  setSort(sort) {
    saveTable(set, { ...get().table, sort })
  },

  setColumnWidth(id, width) {
    const table = get().table
    saveTable(set, { ...table, widths: { ...table.widths, [id]: width } })
  },

  /*
   * Resetting to the default **forgets** the value instead of writing it.
   * Holding a value equal to the default is indistinguishable from a touched
   * column, and whether to offer "reset view" becomes undecidable.
   */
  resetColumnWidth(id) {
    const table = get().table
    const widths = { ...table.widths }
    delete widths[id]
    saveTable(set, { ...table, widths })
  },

  setFilters(patch) {
    set({ filters: { ...get().filters, ...patch } })
  },

  resetTableView() {
    saveTable(set, DEFAULT_TABLE)
    set({ filters: NO_FILTERS })
  },

  setNewTaskAgent(projectId, agentId) {
    set({ newTaskAgentIds: { ...get().newTaskAgentIds, [projectId]: agentId } })
  },

  setTargetProject(projectId) {
    set({ targetProjectId: projectId })
    try {
      localStorage.setItem(TARGET_KEY, projectId)
    } catch {
      // Even without storage, it is remembered while this window stays open
    }
  },

  setAddAction(action) {
    set({ addAction: action })
  },

  setNewTaskLink(link) {
    set({ newTaskLink: link })
  },

  setPalette(open) {
    set({ paletteOpen: open })
  },

  /**
   * Write a draft. An empty string means "discard the draft" (also used after sending).
   * Mirroring to localStorage on every keystroke keeps it even if the whole window is lost.
   */
  setDraft(key, text) {
    const drafts = setDraftIn(get().drafts, key, text)
    if (drafts === get().drafts) return
    set({ drafts })
    saveDrafts(DRAFT_STORAGE, drafts)
  },

  reportFailure(error, path = [], notify = true) {
    const previous = error && typeof error === 'object' ? reportedFailures.get(error) : undefined
    if (previous && (previous.inline || get().toasts.some(t => t.id === previous.id))) return
    const detail = failureReason(error)
    const id = `operation-${crypto.randomUUID()}`
    if (error && typeof error === 'object') reportedFailures.set(error, { id, inline: !notify })
    console.error('Quuu operation failed', path.join('.'), error)
    try {
      localStorage.setItem('taskd.operation-error.v1', JSON.stringify({ at: new Date().toISOString(), operation: path.join('.'), detail, stack: error instanceof Error ? error.stack : undefined }))
    } catch {
      // A broken log store must not take the on-screen feedback down with it.
    }
    if (notify) get().pushToast({ id, level: 'error', message: failureMessage(path), detail })
  },

  pushToast(toast) {
    if (toast.detail && get().toasts.some(t => t.detail === toast.detail)) return
    set({ toasts: [...get().toasts.slice(-4), toast] })
    // Failure reasons stay until the user has seen them.
    if (toast.level !== 'error') setTimeout(() => get().dismissToast(toast.id), 6000)
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },

  async setSettings(patch) {
    const settings = await window.quuu.settings.set(patch)
    set({ settings })
  },

  async refreshEditors() {
    set({ editors: await window.quuu.open.editors() })
  },

  applySnapshot(next) {
    const prev = get().snapshot
    const snapshot = reconcileSnapshot(prev, next)
    if (snapshot === prev) return
    set({ snapshot })

    const cursor = get().cursorTaskId
    if (!cursor || !get().detailOpen) return

    const before = prev?.tasks.find((t) => t.id === cursor)
    const after = snapshot.tasks.find((t) => t.id === cursor)
    if (!after) {
      get().closeDetail()
      return
    }
    if (before && (before.status !== after.status || before.currentRunId !== after.currentRunId ||
      snapshot.runs.find((r) => r.id === after.currentRunId)?.status !== prev?.runs.find((r) => r.id === before.currentRunId)?.status)) {
      void get().refreshRuns(cursor)
    }
  },

  applyScheduler(status) {
    const snapshot = get().snapshot
    if (!snapshot || sameValue(snapshot.scheduler, status)) return
    set({ snapshot: { ...snapshot, scheduler: status } })
  },

  markLanded(taskId) {
    set({ landedTaskId: taskId })
    setTimeout(() => {
      if (get().landedTaskId === taskId) set({ landedTaskId: null })
    }, 1000)
  },

  async markDoneAndAdvance(taskId, ordered) {
    const index = ordered.indexOf(taskId)
    const next = ordered[index + 1] ?? ordered[index - 1] ?? null
    await window.quuu.tasks.markDone(taskId)
    if (next && next !== taskId) {
      if (get().detailOpen) await get().openTask(next)
      else await get().moveCursor(next)
    }
  }
}))

/** The task under the cursor. */
export function useCursorTask(): Task | null {
  return useStore((s) => {
    if (!s.snapshot || !s.cursorTaskId) return null
    return s.snapshot.tasks.find((t) => t.id === s.cursorTaskId) ?? null
  })
}

/** Only screens shown after loading use settings. Don't duplicate storage defaults on the screen side. */
export function useSettings(): AppSettings {
  return useStore(state => {
    if (!state.settings) throw new Error('Settings have not finished loading')
    return state.settings
  })
}
