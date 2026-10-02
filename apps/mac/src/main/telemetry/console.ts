import { format } from 'node:util'
import { SeverityNumber } from '@opentelemetry/api-logs'

/** One console line: its severity, the fixed text it starts with, the first Error in it, and the whole line. */
export type ConsoleReport = (severity: SeverityNumber, label: string | null, error: Error | undefined, text: string) => void

let captured = false
let reporting = false

/**
 * Forward what main already says to its console as warnings and errors.
 *
 * Quuu reports most of its trouble this way (`console.error('Hook processing failed', …)`), so
 * these lines are the failures nobody saw on screen. The console itself is untouched; this only
 * listens alongside it.
 */
export function captureConsole(report: ConsoleReport): void {
  if (captured) return
  captured = true
  for (const [method, severity] of [['error', SeverityNumber.ERROR], ['warn', SeverityNumber.WARN]] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]): void => {
      original(...args)
      // An exporter complaining through the console must not feed itself.
      if (reporting) return
      reporting = true
      try {
        report(severity, typeof args[0] === 'string' ? args[0] : null, args.find((arg): arg is Error => arg instanceof Error), format(...args))
      } catch { /* Telemetry never breaks the console it listens to */ }
      finally { reporting = false }
    }
  }
}
