import { ATTR, EVENT, type ErrorOrigin } from './attributes.js'
import { emitEvent, recordError } from './index.js'

/** What a window reports, as the IPC reception hands it over once validated. */
export type RendererReport =
  | { kind: 'screen'; screen: string; previous: string | null; previousDurationMs: number | null; projectId?: string; taskId?: string }
  | { kind: 'action'; action: string; fields?: string[]; screen?: string }
  | { kind: 'error'; origin: 'uncaught' | 'unhandled_rejection' | 'render'; type: string; message: string; stack?: string; componentStack?: string; screen?: string }

const ORIGINS: Record<Extract<RendererReport, { kind: 'error' }>['origin'], ErrorOrigin> = {
  uncaught: 'renderer.uncaught',
  unhandled_rejection: 'renderer.unhandled_rejection',
  render: 'renderer.render'
}

export function reportRenderer(report: RendererReport): void {
  switch (report.kind) {
    case 'screen':
      emitEvent(EVENT.uiScreen, {
        [ATTR.uiScreen]: report.screen,
        ...(report.previous ? { [ATTR.uiPreviousScreen]: report.previous } : {}),
        ...(report.previousDurationMs !== null ? { [ATTR.uiPreviousDurationMs]: report.previousDurationMs } : {}),
        ...(report.projectId ? { [ATTR.projectId]: report.projectId } : {}),
        ...(report.taskId ? { [ATTR.taskId]: report.taskId } : {})
      })
      return
    case 'action':
      emitEvent(EVENT.uiAction, {
        [ATTR.uiAction]: report.action,
        ...(report.fields?.length ? { [ATTR.uiFields]: [...report.fields].sort() } : {}),
        ...(report.screen ? { [ATTR.uiScreen]: report.screen } : {})
      })
      return
    case 'error': {
      // Rebuilt so the shared exception attributes apply; the stack is the renderer's, not this one.
      const error = Object.assign(new Error(report.message), { name: report.type })
      error.stack = report.stack ? report.stack : `${report.type}: ${report.message}`
      if (report.componentStack) error.stack += `\nComponent stack:${report.componentStack}`
      recordError(ORIGINS[report.origin], error, report.screen ? { [ATTR.uiScreen]: report.screen } : {})
    }
  }
}

/** A menu command, and whether a shortcut, a click or the app itself (a notification, a swipe) sent it. */
export function reportCommand(command: string, trigger: 'shortcut' | 'menu' | 'notification' | 'gesture' | 'app'): void {
  emitEvent(EVENT.uiCommand, { [ATTR.uiCommand]: command, [ATTR.uiTrigger]: trigger })
}
