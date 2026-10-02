/** One signal's latest export: whether the collector took it, and why not when it did not. */
export interface ExportOutcome {
  signal: TelemetrySignal
  at: string
  ok: boolean
  error: string | null
}

export type TelemetrySignal = 'traces' | 'metrics' | 'logs'

/*
 * An exporter that cannot reach its collector says so only to OpenTelemetry's own diagnostics,
 * which nobody reads in a desktop app. Keeping the last outcome lets `app.telemetry` answer
 * "is it actually arriving" instead of only "is it switched on".
 */
const outcomes = new Map<TelemetrySignal, ExportOutcome>()

export function recordExport(signal: TelemetrySignal, ok: boolean, error?: unknown): void {
  outcomes.set(signal, {
    signal,
    at: new Date().toISOString(),
    ok,
    error: ok ? null : error instanceof Error ? error.message : typeof error === 'string' ? error : 'export failed'
  })
}

export function lastExports(): ExportOutcome[] {
  return [...outcomes.values()].sort((a, b) => a.signal.localeCompare(b.signal))
}

export function forgetExports(): void {
  outcomes.clear()
}
