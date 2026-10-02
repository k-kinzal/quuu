import type { App } from 'electron'
import { inspect } from 'node:util'
import { SeverityNumber } from '@opentelemetry/api-logs'
import { ATTR, EVENT } from './attributes.js'
import { emitEvent, recordError } from './index.js'

/**
 * The failures that never reach an operation: main's own uncaught errors and rejections, and a
 * renderer or helper process that died. Plus when Quuu's window is in front, which is what turns a
 * stream of events into sittings at the desk.
 */
export function observeElectron(app: App): void {
  // A monitor only watches: Electron still reports and handles the exception as it did.
  process.on('uncaughtExceptionMonitor', (error, origin) => {
    recordError(origin === 'unhandledRejection' ? 'main.unhandled_rejection' : 'main.uncaught', error)
  })
  // Electron only warns about these, and a listener silences that warning, so it is written again.
  process.on('unhandledRejection', reason => {
    recordError('main.unhandled_rejection', reason)
    process.stderr.write(`Unhandled promise rejection: ${inspect(reason)}\n`)
  })
  app.on('render-process-gone', (_event, _contents, details) => {
    if (details.reason === 'clean-exit') return
    recordError('main.render_process_gone', new Error(`Renderer gone: ${details.reason}`), { 'quuu.process.exit_code': details.exitCode, 'quuu.process.reason': details.reason })
  })
  app.on('child-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    recordError('main.child_process_gone', new Error(`${details.type} process gone: ${details.reason}`), {
      'quuu.process.type': details.type, 'quuu.process.reason': details.reason, 'quuu.process.exit_code': details.exitCode,
      ...(details.name ? { 'quuu.process.name': details.name } : {})
    })
  })
  app.on('browser-window-focus', () => emitEvent(EVENT.appFocus, { [ATTR.uiFocused]: true }))
  app.on('browser-window-blur', () => emitEvent(EVENT.appFocus, { [ATTR.uiFocused]: false }))
}

export function reportQuit(): void {
  emitEvent(EVENT.appQuit, {}, SeverityNumber.INFO)
}
