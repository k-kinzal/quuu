import { randomUUID } from 'node:crypto'
import { arch, release } from 'node:os'
import { metrics } from '@opentelemetry/api'
import { logs } from '@opentelemetry/api-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import type { TelemetryBuild, TelemetryConfig } from './config.js'
import { recordExport, type TelemetrySignal } from './health.js'

/**
 * Install the OpenTelemetry SDK: traces, metrics and logs over OTLP/HTTP (protobuf).
 *
 * Loaded only after someone opted in (`config.ts`), so a Quuu that never did carries none of it.
 */
export function startSdk(config: TelemetryConfig, build: TelemetryBuild): () => Promise<void> {
  const resource = resourceFromAttributes({
    'service.name': 'quuu',
    'service.namespace': 'quuu',
    'service.version': build.version,
    // One launch. A restart is a new instance, so a query can split usage into sittings.
    'service.instance.id': randomUUID(),
    'deployment.environment.name': environment(build),
    'os.type': process.platform,
    'os.version': release(),
    'host.arch': arch(),
    'process.runtime.name': 'electron',
    'process.runtime.version': process.versions.electron ?? process.version,
    ...config.resourceAttributes
  })
  const exporter = (signal: TelemetrySignal) => ({
    // Left out, each exporter reads OTEL_EXPORTER_OTLP_(<SIGNAL>_)ENDPOINT / _HEADERS itself.
    ...(config.endpoint ? { url: `${config.endpoint}/v1/${signal}` } : {}),
    ...(Object.keys(config.headers).length ? { headers: config.headers } : {})
  })

  const tracing = new NodeTracerProvider({ resource, spanProcessors: [new BatchSpanProcessor(watched('traces', new OTLPTraceExporter(exporter('traces'))))] })
  // Registers the AsyncLocalStorage context manager too, so an operation's span follows its awaits.
  tracing.register()
  const meters = new MeterProvider({
    resource,
    readers: [new PeriodicExportingMetricReader({ exporter: watched('metrics', new OTLPMetricExporter(exporter('metrics'))), exportIntervalMillis: 60_000 })]
  })
  metrics.setGlobalMeterProvider(meters)
  const logging = new LoggerProvider({ resource, processors: [new BatchLogRecordProcessor({ exporter: watched('logs', new OTLPLogExporter(exporter('logs'))) })] })
  logs.setGlobalLoggerProvider(logging)

  return async () => {
    await Promise.allSettled([tracing.shutdown(), meters.shutdown(), logging.shutdown()])
  }
}

/** What every OpenTelemetry exporter hands back. `code` 0 is `ExportResultCode.SUCCESS`. */
interface ExportResult { code: number; error?: Error }

/** Note each export's outcome for `app.telemetry`, then report it to the processor as before. */
function watched<E extends { export(items: never, done: (result: ExportResult) => void): void }>(signal: TelemetrySignal, exporter: E): E {
  const original = exporter.export.bind(exporter) as (items: unknown, done: (result: ExportResult) => void) => void
  ;(exporter as { export(items: unknown, done: (result: ExportResult) => void): void }).export = (items, done) => {
    original(items, result => {
      recordExport(signal, result.code === 0, result.error)
      done(result)
    })
  }
  return exporter
}

/**
 * Which data a query should count as kinzal's own use. A verification instance (`QUUU_USER_DATA`,
 * docs/verification.md) runs fixtures, and a development build is someone working on Quuu.
 */
function environment(build: TelemetryBuild): string {
  if (process.env.QUUU_USER_DATA) return 'verification'
  return build.packaged ? 'production' : 'development'
}
