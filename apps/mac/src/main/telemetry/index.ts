import { createHash } from 'node:crypto'
import { context, metrics, SpanKind, SpanStatusCode, trace, type Attributes, type Histogram, type Span, type Tracer } from '@opentelemetry/api'
import { logs, SeverityNumber, type Logger } from '@opentelemetry/api-logs'
import { ATTR, EVENT, type CallerKind, type ErrorOrigin } from './attributes.js'
import { readTelemetryConfig, type TelemetryBuild, type TelemetryConfig } from './config.js'
import { captureConsole } from './console.js'

export { ATTR, EVENT, SPAN } from './attributes.js'
export type { CallerKind, ErrorOrigin } from './attributes.js'

export type { TelemetryBuild } from './config.js'

interface Instruments {
  tracer: Tracer
  logger: Logger
  operationDuration: Histogram
  runDuration: Histogram
}

/*
 * Off (null) until `startTelemetry` installs an SDK. The SDK is imported only then, so a Quuu that
 * never opted in loads nothing but the API and every call below returns before doing any work.
 */
let instruments: Instruments | null = null
let shutdownSdk: (() => Promise<void>) | null = null

export function telemetryActive(): boolean {
  return instruments !== null
}

/** Registers the global providers and answers how to flush them. Tests install in-memory ones. */
export type InstallSdk = (config: TelemetryConfig, build: TelemetryBuild) => () => Promise<void>

export async function startTelemetry(build: TelemetryBuild, config: TelemetryConfig = readTelemetryConfig(), install?: InstallSdk): Promise<boolean> {
  if (instruments || !config.enabled) return instruments !== null
  shutdownSdk = (install ?? (await import('./sdk.js')).startSdk)(config, build)
  const meter = metrics.getMeter('quuu', build.version)
  instruments = {
    tracer: trace.getTracer('quuu', build.version),
    logger: logs.getLogger('quuu', build.version),
    operationDuration: meter.createHistogram('quuu.operation.duration', { unit: 's', description: 'Every operation call, including the repeats traces leave out' }),
    runDuration: meter.createHistogram('quuu.run.duration', { unit: 's', description: 'Agent runs from launch to exit' })
  }
  captureConsole((severity, label, error, text) => emitEvent(EVENT.log, {
    ...(error ? exceptionAttributes(error) : {}),
    ...(label === null ? {} : { [ATTR.logLabel]: truncate(label, 200) })
  }, severity, truncate(text, 8000)))
  return true
}

/** Flush what is buffered. Bounded, so a collector that went away cannot hold up quitting. */
export async function stopTelemetry(timeoutMs = 3000): Promise<void> {
  const stop = shutdownSdk
  instruments = null
  shutdownSdk = null
  if (!stop) return
  let timer: NodeJS.Timeout | undefined
  await Promise.race([
    stop().catch(error => { console.warn('Telemetry shutdown failed:', error) }),
    new Promise<void>(resolve => { timer = setTimeout(resolve, timeoutMs) })
  ])
  clearTimeout(timer)
  // Let go of the globals too, so a later start (a test) installs afresh.
  trace.disable(); metrics.disable(); logs.disable(); context.disable()
}

/** For the few callers that would do real work (a DB read) just to describe something. */
export function tracer(): Tracer | null {
  return instruments?.tracer ?? null
}

export function recordRunDuration(seconds: number, attributes: Attributes): void {
  instruments?.runDuration.record(seconds, attributes)
}

const SEVERITY_TEXT: Partial<Record<SeverityNumber, string>> = {
  [SeverityNumber.INFO]: 'INFO', [SeverityNumber.WARN]: 'WARN', [SeverityNumber.ERROR]: 'ERROR', [SeverityNumber.FATAL]: 'FATAL'
}

/**
 * One fact as an OpenTelemetry event (a log record named by `event.name`). Emitted inside an
 * operation it carries that operation's trace, so a lifecycle change links to the call that made it.
 */
export function emitEvent(name: string, attributes: Attributes = {}, severity = SeverityNumber.INFO, body: string = name): void {
  if (!instruments) return
  instruments.logger.emit({
    eventName: name,
    severityNumber: severity,
    severityText: SEVERITY_TEXT[severity],
    body,
    // Duplicated as an attribute: backends that predate the EventName field still index this.
    attributes: { 'event.name': name, ...attributes }
  })
}

export function recordError(origin: ErrorOrigin, error: unknown, attributes: Attributes = {}): void {
  if (!instruments) return
  const exception = exceptionAttributes(error)
  emitEvent(EVENT.error, { [ATTR.errorOrigin]: origin, ...exception, ...attributes }, SeverityNumber.ERROR, String(exception[ATTR.exceptionMessage] ?? origin))
}

/** Semantic-convention exception attributes, with the cause chain kept in the stack. */
export function exceptionAttributes(error: unknown): Attributes {
  if (!(error instanceof Error)) {
    return { [ATTR.exceptionType]: error === null ? 'null' : typeof error, [ATTR.exceptionMessage]: truncate(describe(error), 4000) }
  }
  const stack: string[] = []
  let current: unknown = error
  for (let depth = 0; current instanceof Error && depth < 4; depth++, current = current.cause) {
    stack.push(`${depth ? 'Caused by: ' : ''}${current.stack ?? `${current.name}: ${current.message}`}`)
  }
  if (current !== undefined && !(current instanceof Error)) stack.push(`Caused by: ${describe(current)}`)
  return {
    [ATTR.exceptionType]: errorName(error),
    [ATTR.exceptionMessage]: truncate(error.message, 4000),
    [ATTR.exceptionStacktrace]: truncate(stack.join('\n'), 16_000)
  }
}

function errorName(error: Error): string {
  const named = error.constructor?.name
  return named && named !== 'Error' ? named : error.name
}

function describe(value: unknown): string {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) ?? String(value) } catch { return String(value) }
}

export function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export interface OperationCaller {
  kind: CallerKind
  /** The agent run whose CLI made this call, when an agent rather than a person is operating Quuu. */
  agentRunId?: string | null
}

/** Quuu's ids (`task_…`, `proj_…`). Anything else in a string input may be content and is not exported. */
const QUUU_ID = /^[a-z]+_[0-9a-f]{20}$/

/*
 * Screens poll (the review refreshes every second). A successful call identical to one this caller
 * made within the window adds nothing to a trace, so only the duration metric counts it; a failure
 * is always traced.
 */
const REPEAT_WINDOW_MS = 60_000
const recentCalls = new WeakMap<object, Map<string, number>>()
/** Owners that are not objects (a test's `'window'`) share one record. */
const sharedCalls = new Map<string, number>()
function callsOf(owner: unknown, create: boolean): Map<string, number> | undefined {
  if (typeof owner !== 'object' || owner === null) return sharedCalls
  let calls = recentCalls.get(owner)
  if (!calls && create) recentCalls.set(owner, calls = new Map<string, number>())
  return calls
}

export function operationAttributes(name: string, caller: OperationCaller, input: unknown): Attributes {
  const attributes: Attributes = {
    [ATTR.operation]: name,
    [ATTR.operationGroup]: name.split('.')[0],
    [ATTR.callerKind]: caller.kind,
    [ATTR.callerAgentRun]: Boolean(caller.agentRunId)
  }
  if (caller.agentRunId) attributes[ATTR.runId] = caller.agentRunId
  if (typeof input === 'string' && QUUU_ID.test(input)) attributes[ATTR.operationTargetId] = input
  if (!isRecord(input)) return attributes
  attributes[ATTR.operationInputFields] = Object.keys(input).sort()
  if (isRecord(input.patch)) attributes[ATTR.operationPatchFields] = Object.keys(input.patch).sort()
  if (typeof input.id === 'string' && QUUU_ID.test(input.id)) attributes[ATTR.operationTargetId] = input.id
  if (typeof input.taskId === 'string' && QUUU_ID.test(input.taskId)) attributes[ATTR.taskId] = input.taskId
  if (typeof input.projectId === 'string' && QUUU_ID.test(input.projectId)) attributes[ATTR.projectId] = input.projectId
  return attributes
}

/**
 * Trace one operation call. `markForwarded` records that a satellite sent it to its host.
 *
 * The span is the call's parent context, so every event and console complaint made while it runs
 * lands in the same trace.
 */
export async function observeOperation<T>(
  name: string,
  owner: unknown,
  caller: OperationCaller,
  input: unknown,
  run: (markForwarded: () => void) => Promise<T>
): Promise<T> {
  const active = instruments
  if (!active) return run(() => undefined)
  const startTime = Date.now()
  const key = callKey(name, input)
  const repeated = isRepeat(owner, key, startTime)
  const attributes = operationAttributes(name, caller, input)
  let forwarded = false
  const markForwarded = (): void => { forwarded = true }
  const span = repeated ? null : active.tracer.startSpan(name, { kind: SpanKind.SERVER, attributes, startTime })
  const finish = (target: Span, error?: unknown): void => {
    target.setAttribute(ATTR.operationRoute, forwarded ? 'host' : 'local')
    if (error !== undefined) {
      const type = errorType(error)
      target.setAttribute(ATTR.errorType, type)
      target.addEvent('exception', exceptionAttributes(error))
      target.setStatus({ code: SpanStatusCode.ERROR, message: truncate(error instanceof Error ? error.message : describe(error), 1000) })
    }
    target.end()
    active.operationDuration.record((Date.now() - startTime) / 1000, {
      [ATTR.operation]: name, [ATTR.callerKind]: caller.kind, [ATTR.callerAgentRun]: Boolean(caller.agentRunId),
      ...(error === undefined ? {} : { [ATTR.errorType]: errorType(error) })
    })
  }
  try {
    const result = span ? await context.with(trace.setSpan(context.active(), span), () => run(markForwarded)) : await run(markForwarded)
    if (span && typeof result === 'boolean') span.setAttribute(ATTR.operationResult, result)
    remember(owner, key, startTime)
    if (span) finish(span)
    else active.operationDuration.record((Date.now() - startTime) / 1000, { [ATTR.operation]: name, [ATTR.callerKind]: caller.kind, [ATTR.callerAgentRun]: Boolean(caller.agentRunId) })
    return result
  } catch (error) {
    callsOf(owner, false)?.delete(key)
    finish(span ?? active.tracer.startSpan(name, { kind: SpanKind.SERVER, attributes, startTime }), error)
    throw error
  }
}

/** oRPC failures carry a code (`OPERATION_FAILED`, `BAD_REQUEST`, …); their cause is the real error. */
function errorType(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    const cause = error instanceof Error && error.cause instanceof Error ? `:${errorName(error.cause)}` : ''
    return `${error.code}${cause}`
  }
  return error instanceof Error ? errorName(error) : typeof error
}

function callKey(name: string, input: unknown): string {
  let text: string
  try { text = JSON.stringify(input) ?? '' } catch { text = String(input) }
  return `${name}:${createHash('sha1').update(text).digest('base64')}`
}

function isRepeat(owner: unknown, key: string, now: number): boolean {
  const at = callsOf(owner, false)?.get(key)
  return at !== undefined && now - at < REPEAT_WINDOW_MS
}

function remember(owner: unknown, key: string, now: number): void {
  const calls = callsOf(owner, true)
  if (!calls) return
  // Only refreshed by a traced call, so a view polled all day still shows up once a minute.
  if (!isRepeat(owner, key, now)) calls.set(key, now)
  if (calls.size > 256) for (const [stored, at] of calls) if (now - at >= REPEAT_WINDOW_MS) calls.delete(stored)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
