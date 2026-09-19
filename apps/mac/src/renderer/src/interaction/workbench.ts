import { paneWeights } from '@design-system/react/layout-spec'
import { useState } from 'react'

export type WorkTool = 'main' | 'terminal'
export type InspectorTool = 'task' | 'symbols' | 'coverage' | 'project-tasks'

interface SavedWorkbenchLayout {
  workOrder: WorkTool[]
  visibleWork: WorkTool[]
  workSizes: Record<WorkTool, number>
  inspectorOrder: InspectorTool[]
  taskInspectorOpen: boolean
  visibleInspectors: Partial<Record<WorkTool, InspectorTool[]>>
  inspectorSizes: Record<InspectorTool, number>
}

export interface WorkbenchLayout extends SavedWorkbenchLayout {
  activeWork: WorkTool
}

const KEY = 'taskd.workbench.v2'
const LEGACY_KEY = 'taskd.workbench.v1'
const WORK_TOOLS: WorkTool[] = ['main', 'terminal']
const INSPECTOR_TOOLS: InspectorTool[] = ['task', 'symbols', 'coverage', 'project-tasks']
const CONTEXT_INSPECTOR_TOOLS = INSPECTOR_TOOLS.filter((id) => id !== 'task')

const DEFAULT: WorkbenchLayout = {
  workOrder: WORK_TOOLS,
  visibleWork: ['main'],
  workSizes: { main: paneWeights.primary, terminal: paneWeights.standard },
  activeWork: 'main',
  inspectorOrder: INSPECTOR_TOOLS,
  taskInspectorOpen: true,
  visibleInspectors: {
    main: [],
    terminal: ['project-tasks']
  },
  inspectorSizes: { task: paneWeights.standard, symbols: paneWeights.standard, coverage: paneWeights.standard, 'project-tasks': paneWeights.standard }
}

function known<T extends string>(values: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter((value): value is T => typeof value === 'string' && allowed.includes(value as T)))]
}

function complete<T extends string>(values: T[], all: readonly T[]): T[] {
  return [...values, ...all.filter((value) => !values.includes(value))]
}

function sizes<T extends string>(saved: unknown, defaults: Record<T, number>): Record<T, number> {
  if (!saved || typeof saved !== 'object') return defaults
  const values = saved as Partial<Record<T, unknown>>
  return Object.fromEntries(
    Object.entries(defaults).map(([id, fallback]) => {
      const value = values[id as T]
      return [id, typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback]
    })
  ) as Record<T, number>
}

/** Preserve explicit pane choices when two former surfaces become one. */
function migrate(saved: string): Partial<SavedWorkbenchLayout> {
  type LegacyWork = 'chat' | 'review' | 'terminal'
  const legacy = JSON.parse(saved) as {
    workOrder?: LegacyWork[]
    visibleWork?: LegacyWork[]
    workSizes?: Record<LegacyWork, number>
    inspectorOrder?: InspectorTool[]
    visibleInspectors?: Partial<Record<LegacyWork, InspectorTool[]>>
    inspectorSizes?: Record<InspectorTool, number>
  }
  const merge = (values: unknown): WorkTool[] => [...new Set(
    known(values, ['chat', 'review', 'terminal'] as const).map((id) => id === 'terminal' ? 'terminal' as const : 'main' as const)
  )]
  const oldSizes = sizes(legacy.workSizes, { chat: paneWeights.standard, review: paneWeights.primary, terminal: paneWeights.standard })
  const visible = known(legacy.visibleWork, ['chat', 'review', 'terminal'] as const)
  const mainSize = visible.filter((id) => id !== 'terminal').reduce((sum, id) => sum + oldSizes[id], 0)
  const inspectors = legacy.visibleInspectors
  return {
    workOrder: merge(legacy.workOrder),
    visibleWork: Array.isArray(legacy.visibleWork) ? merge(legacy.visibleWork) : DEFAULT.visibleWork,
    workSizes: { main: mainSize || DEFAULT.workSizes.main, terminal: oldSizes.terminal },
    inspectorOrder: legacy.inspectorOrder,
    visibleInspectors: {
      main: inspectors?.chat || inspectors?.review
        ? [...new Set([...known(inspectors.chat, INSPECTOR_TOOLS), ...known(inspectors.review, INSPECTOR_TOOLS)])]
        : ['task'],
      terminal: inspectors?.terminal ?? DEFAULT.visibleInspectors.terminal
    },
    inspectorSizes: legacy.inspectorSizes
  }
}

function load(): WorkbenchLayout {
  try {
    const saved = localStorage.getItem(KEY)
    const legacy = localStorage.getItem(LEGACY_KEY)
    const parsed = saved ? JSON.parse(saved) as Partial<SavedWorkbenchLayout> : legacy ? migrate(legacy) : {}
    const workOrder = complete(known(parsed.workOrder, WORK_TOOLS), WORK_TOOLS)
    const visibleWork = Array.isArray(parsed.visibleWork)
      ? known(parsed.visibleWork, WORK_TOOLS)
      : DEFAULT.visibleWork
    const visibleInspectors = { ...DEFAULT.visibleInspectors }
    for (const work of WORK_TOOLS) {
      const saved = parsed.visibleInspectors?.[work]
      if (saved) visibleInspectors[work] = known(saved, CONTEXT_INSPECTOR_TOOLS)
    }
    return {
      workOrder,
      visibleWork,
      workSizes: sizes(parsed.workSizes, DEFAULT.workSizes),
      activeWork: visibleWork[0] ?? 'main',
      inspectorOrder: complete(known(parsed.inspectorOrder, INSPECTOR_TOOLS), INSPECTOR_TOOLS),
      // Task details used to belong only to main; preserve that choice across all work surfaces.
      taskInspectorOpen: typeof parsed.taskInspectorOpen === 'boolean'
        ? parsed.taskInspectorOpen
        : parsed.visibleInspectors?.main
          ? known(parsed.visibleInspectors.main, INSPECTOR_TOOLS).includes('task')
          : DEFAULT.taskInspectorOpen,
      visibleInspectors,
      inspectorSizes: sizes(parsed.inspectorSizes, DEFAULT.inspectorSizes)
    }
  } catch {
    return DEFAULT
  }
}

function save(layout: WorkbenchLayout): void {
  try {
    const stored: SavedWorkbenchLayout = {
      workOrder: layout.workOrder,
      visibleWork: layout.visibleWork,
      workSizes: layout.workSizes,
      inspectorOrder: layout.inspectorOrder,
      taskInspectorOpen: layout.taskInspectorOpen,
      visibleInspectors: layout.visibleInspectors,
      inspectorSizes: layout.inspectorSizes
    }
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    // Even if it can't be persisted, the workbench keeps working for this session
  }
}

/**
 * Opening, closing and ordering the workbench.
 *
 * Several can be shown at once, so this is never "tabs that select one". Pressing the
 * glyph at the edge again closes that surface, and dragging changes only the display order.
 */
export function useWorkbenchLayout(): {
  layout: WorkbenchLayout
  toggleWork(id: WorkTool): void
  openWork(id: WorkTool): void
  focusWork(id: WorkTool): void
  closeWork(id: WorkTool): void
  reorderWork(ids: string[]): void
  resizeWork(before: WorkTool, after: WorkTool, share: number): void
  toggleInspector(id: InspectorTool): void
  closeInspector(id: InspectorTool): void
  reorderInspectors(ids: string[]): void
  resizeInspectors(before: InspectorTool, after: InspectorTool, share: number): void
} {
  const [layout, setLayout] = useState(load)

  const change = (update: (current: WorkbenchLayout) => WorkbenchLayout): void => {
    setLayout((current) => {
      const next = update(current)
      save(next)
      return next
    })
  }

  return {
    layout,
    toggleWork(id) {
      change((current) => {
        const visible = current.visibleWork.includes(id)
        const visibleWork = visible
          ? current.visibleWork.filter((value) => value !== id)
          : [...current.visibleWork, id]
        return {
          ...current,
          visibleWork,
          activeWork: visible
            ? visibleWork[0] ?? current.activeWork
            : id
        }
      })
    },
    openWork(id) {
      change((current) => ({
        ...current,
        activeWork: id,
        visibleWork: current.visibleWork.includes(id) ? current.visibleWork : [...current.visibleWork, id]
      }))
    },
    focusWork(id) {
      change((current) => ({ ...current, activeWork: id }))
    },
    closeWork(id) {
      change((current) => {
        const visibleWork = current.visibleWork.filter((value) => value !== id)
        return {
          ...current,
          visibleWork,
          activeWork: current.activeWork === id ? visibleWork[0] ?? current.activeWork : current.activeWork
        }
      })
    },
    reorderWork(ids) {
      change((current) => ({ ...current, workOrder: complete(known(ids, WORK_TOOLS), WORK_TOOLS) }))
    },
    resizeWork(before, after, share) {
      change((current) => {
        const total = current.workSizes[before] + current.workSizes[after]
        return {
          ...current,
          workSizes: {
            ...current.workSizes,
            [before]: total * share,
            [after]: total * (1 - share)
          }
        }
      })
    },
    toggleInspector(id) {
      change((current) => {
        if (id === 'task') return { ...current, taskInspectorOpen: !current.taskInspectorOpen }
        const visible = current.visibleInspectors[current.activeWork] ?? []
        return {
          ...current,
          visibleInspectors: {
            ...current.visibleInspectors,
            [current.activeWork]: visible.includes(id)
              ? visible.filter((value) => value !== id)
              : [...visible, id]
          }
        }
      })
    },
    closeInspector(id) {
      change((current) => id === 'task' ? { ...current, taskInspectorOpen: false } : ({
        ...current,
        visibleInspectors: {
          ...current.visibleInspectors,
          [current.activeWork]: (current.visibleInspectors[current.activeWork] ?? []).filter(
            (value) => value !== id
          )
        }
      }))
    },
    reorderInspectors(ids) {
      change((current) => ({
        ...current,
        inspectorOrder: complete(known(ids, INSPECTOR_TOOLS), INSPECTOR_TOOLS)
      }))
    },
    resizeInspectors(before, after, share) {
      change((current) => {
        const total = current.inspectorSizes[before] + current.inspectorSizes[after]
        return {
          ...current,
          inspectorSizes: {
            ...current.inspectorSizes,
            [before]: total * share,
            [after]: total * (1 - share)
          }
        }
      })
    }
  }
}

export function inspectorTools(work: WorkTool): InspectorTool[] {
  if (work === 'main') return INSPECTOR_TOOLS
  return ['task', 'coverage', 'project-tasks']
}

export function visibleInspectorTools(layout: WorkbenchLayout): InspectorTool[] {
  const available = inspectorTools(layout.activeWork)
  const visible = layout.visibleInspectors[layout.activeWork] ?? []
  return layout.inspectorOrder.filter((id) =>
    available.includes(id) && (id === 'task' ? layout.taskInspectorOpen : visible.includes(id))
  )
}
