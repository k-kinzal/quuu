import type { RendererTelemetry } from '../../../api/schemas/telemetry.js'
import type { Section, SettingsCategory } from './navigation.js'

/** The part of the store a screen name is read from. */
export interface ScreenState {
  section: Section
  cursorTaskId: string | null
  detailOpen: boolean
  settingsCategory: SettingsCategory
  editingAgentId: string | null
  editingGroupId: string | null
  editingRuleId: string | null
}

/**
 * Where the person is, named by place and never by content: `all/task`, `project/dashboard`,
 * `settings/agents/agent`. Main exports these only when telemetry is on.
 */
export function screenOf(state: ScreenState): string {
  const { section } = state
  if (section.kind === 'settings') {
    const editing = state.editingAgentId ? '/agent' : state.editingGroupId ? '/group' : ''
    return `settings/${state.settingsCategory}${editing}`
  }
  const parts: string[] = [section.kind]
  if (section.kind === 'project') {
    const panel = projectPanel(state)
    if (panel) parts.push(panel)
    if (state.editingRuleId) parts.push('rule')
  }
  if (state.detailOpen && state.cursorTaskId) parts.push('task')
  return parts.join('/')
}

/** Every project panel is a `project<Name>Open` flag, so a panel added later is named without a change here. */
function projectPanel(state: ScreenState): string | null {
  for (const [key, value] of Object.entries(state)) {
    const panel = /^project(\w+)Open$/.exec(key)?.[1]
    if (panel && value === true) return panel[0].toLowerCase() + panel.slice(1)
  }
  return null
}

/** The UI-only state no operation records. Each is reported by which of its fields changed. */
interface ActionState {
  table: object
  filters: object
  layout: object
  paletteOpen: boolean
}

type UsageState = ScreenState & ActionState

/** A drag fires a change per frame; one report follows once it settles. */
const SETTLE_MS = 1000

let currentScreen: string | null = null

/**
 * Report screens and UI-only actions as they change. `subscribe` is the store's own, so this
 * module never owns state; the reports are fire and forget.
 */
export function startUsageReports<S extends UsageState>(store: { getState(): S; subscribe(listener: (state: S, previous: S) => void): () => void }): () => void {
  const send = (event: RendererTelemetry): void => { window.quuuTelemetry?.record(event) }
  let shownAt = Date.now()
  const pending = new Map<string, { fields: Set<string>; timer: ReturnType<typeof setTimeout> }>()
  const action = (name: string, changed: string[]): void => {
    const earlier = pending.get(name)
    if (earlier) clearTimeout(earlier.timer)
    const fields = new Set([...earlier?.fields ?? [], ...changed])
    pending.set(name, {
      fields,
      timer: setTimeout(() => {
        pending.delete(name)
        send({ kind: 'action', action: name, fields: [...fields], ...(currentScreen ? { screen: currentScreen } : {}) })
      }, SETTLE_MS)
    })
  }
  const showScreen = (state: S): void => {
    const screen = screenOf(state)
    if (screen === currentScreen) return
    const now = Date.now()
    const projectId = state.section.kind === 'project' ? state.section.id : undefined
    const taskId = state.detailOpen && state.cursorTaskId ? state.cursorTaskId : undefined
    send({
      kind: 'screen', screen, previous: currentScreen, previousDurationMs: currentScreen ? now - shownAt : null,
      ...(projectId ? { projectId } : {}), ...(taskId ? { taskId } : {})
    })
    currentScreen = screen
    shownAt = now
  }
  showScreen(store.getState())
  const unsubscribe = store.subscribe((state, previous) => {
    showScreen(state)
    for (const name of ['table', 'filters', 'layout'] as const) {
      if (state[name] !== previous[name]) action(name, changedFields(state[name], previous[name]))
    }
    if (state.paletteOpen && !previous.paletteOpen) action('palette.open', [])
  })
  return () => {
    unsubscribe()
    for (const entry of pending.values()) clearTimeout(entry.timer)
    pending.clear()
  }
}

function changedFields(next: object, previous: object): string[] {
  const before = previous as Record<string, unknown>, after = next as Record<string, unknown>
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => before[key] !== after[key])
}

/** A failure the window could not hand to an operation, with the screen it happened on. */
export function reportRendererError(origin: 'uncaught' | 'unhandled_rejection' | 'render', error: unknown, componentStack?: string | null): void {
  const failure = error instanceof Error ? error : null
  window.quuuTelemetry?.record({
    kind: 'error',
    origin,
    type: (failure?.name ?? typeof error).slice(0, 200),
    message: (failure?.message ?? describe(error)).slice(0, 4000),
    ...(failure?.stack ? { stack: failure.stack.slice(0, 16_000) } : {}),
    ...(componentStack ? { componentStack: componentStack.slice(0, 16_000) } : {}),
    ...(currentScreen ? { screen: currentScreen } : {})
  })
}

function describe(value: unknown): string {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) ?? String(value) } catch { return String(value) }
}
