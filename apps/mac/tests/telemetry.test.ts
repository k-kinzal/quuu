import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRouterClient } from '@orpc/server'
import { InMemoryLogRecordExporter, LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { MeterProvider } from '@opentelemetry/sdk-metrics'
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { logs } from '@opentelemetry/api-logs'
import { metrics, type HrTime } from '@opentelemetry/api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import { createOperationsRouter } from '../src/main/api/router.js'
import type { DesktopOperations, OperationHost } from '../src/main/api/host.js'
import { readTelemetryConfig } from '../src/main/telemetry/config.js'
import { observeOperation, startTelemetry, stopTelemetry, telemetryActive, type InstallSdk, type OperationCaller } from '../src/main/telemetry/index.js'
import { observeApp, reportLaunch } from '../src/main/telemetry/app.js'
import { reportRenderer } from '../src/main/telemetry/ui.js'
import { screenOf, startUsageReports, type ScreenState } from '../src/renderer/src/state/usage.js'
import type { RendererTelemetry } from '../src/api/schemas/telemetry.js'
import { makeAgent, makeProject, makeTask, occupy } from './helpers.js'

let workdir: string
// Fresh each test: shutting the SDK down stops its exporters for good.
let spans: InMemorySpanExporter
let records: InMemoryLogRecordExporter

/** The real SDK wiring, with exporters a test can read instead of OTLP. */
const inMemory: InstallSdk = () => {
  const tracing = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spans)] })
  tracing.register()
  const meters = new MeterProvider()
  metrics.setGlobalMeterProvider(meters)
  const logging = new LoggerProvider({ processors: [new SimpleLogRecordProcessor({ exporter: records })] })
  logs.setGlobalLoggerProvider(logging)
  return async () => { await Promise.all([tracing.shutdown(), meters.shutdown(), logging.shutdown()]) }
}
const ON = { enabled: true, endpoint: '', headers: {}, resourceAttributes: {} }
const BUILD = { version: '1.0.0-test', packaged: false }

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'taskd-telemetry-'))
  process.env.QUUU_USER_DATA = workdir
  spans = new InMemorySpanExporter()
  records = new InMemoryLogRecordExporter()
})

afterEach(async () => {
  await stopTelemetry()
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

function makeApp(): QuuuApp {
  const app = new QuuuApp(':memory:')
  app.scheduler.pause()
  return app
}

function routerFor(app: QuuuApp, caller: OperationCaller) {
  const host: OperationHost<object> = {
    authorize: () => undefined,
    callerOf: () => caller,
    releaseWithOwner: () => () => undefined,
    sendEvent: () => undefined,
    desktopFor: () => ({}) as DesktopOperations
  }
  const owner = {}
  return createRouterClient(createOperationsRouter(app, host), { context: { owner } })
}

/** Log processors hand records to the exporter a tick later. */
const exportedSoFar = (): Promise<void> => new Promise(resolve => setImmediate(resolve))
const millis = (time: HrTime): number => time[0] * 1000 + time[1] / 1e6
const events = (name: string) => records.getFinishedLogRecords().filter(record => record.eventName === name)
const exported = (): string => JSON.stringify([
  ...spans.getFinishedSpans().map(span => ({ name: span.name, attributes: span.attributes, events: span.events })),
  ...records.getFinishedLogRecords().map(record => ({ body: record.body, attributes: record.attributes }))
])

describe('telemetry settings', () => {
  it('stays off unless telemetry.json or QUUU_OTEL turns it on', () => {
    const file = join(workdir, 'telemetry.json')
    expect(readTelemetryConfig({}, file).enabled).toBe(false)
    // An endpoint left in a shell is not consent to export.
    expect(readTelemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' }, file).enabled).toBe(false)
    expect(readTelemetryConfig({ QUUU_OTEL: '1' }, file).enabled).toBe(true)

    writeFileSync(file, JSON.stringify({ enabled: true, endpoint: 'http://collector:4318/', headers: { authorization: 'Bearer x', ignored: 1 } }))
    expect(readTelemetryConfig({}, file)).toEqual({ enabled: true, endpoint: 'http://collector:4318', headers: { authorization: 'Bearer x' }, resourceAttributes: {} })
    expect(readTelemetryConfig({ QUUU_OTEL: '0' }, file).enabled).toBe(false)
    expect(readTelemetryConfig({ OTEL_SDK_DISABLED: 'true', QUUU_OTEL: '1' }, file).enabled).toBe(false)
  })

  it('loads no SDK and records nothing while off', async () => {
    expect(await startTelemetry(BUILD, { ...ON, enabled: false }, inMemory)).toBe(false)
    expect(telemetryActive()).toBe(false)
    await expect(observeOperation('tasks.list', {}, { kind: 'window' }, undefined, () => Promise.resolve('ok'))).resolves.toBe('ok')
    expect(spans.getFinishedSpans()).toEqual([])
  })
})

describe('operation traces', () => {
  it('names the operation and who called it, and records which fields changed but never their contents', async () => {
    await startTelemetry(BUILD, ON, inMemory)
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(app.db, project, 't')
    const client = routerFor(app, { kind: 'cli', agentRunId: 'run_from_agent' })

    await client.tasks.update({ id: task, patch: { prompt: 'a secret instruction', priority: 1 } })

    const [span] = spans.getFinishedSpans()
    expect(span.name).toBe('tasks.update')
    expect(span.attributes).toMatchObject({
      'quuu.operation': 'tasks.update',
      'quuu.operation.group': 'tasks',
      'quuu.operation.route': 'local',
      'quuu.caller.kind': 'cli',
      'quuu.caller.agent_run': true,
      'quuu.run.id': 'run_from_agent',
      'quuu.operation.input.fields': ['id', 'patch'],
      'quuu.operation.patch.fields': ['priority', 'prompt'],
      'quuu.operation.target_id': task
    })
    await exportedSoFar()
    expect(exported()).not.toContain('a secret instruction')
  })

  it('traces a polled call once a minute but traces every failure with its cause', async () => {
    await startTelemetry(BUILD, ON, inMemory)
    const app = makeApp()
    const client = routerFor(app, { kind: 'window' })

    await client.projects.list()
    await client.projects.list()
    expect(spans.getFinishedSpans().map(span => span.name)).toEqual(['projects.list'])

    await expect(client.tasks.update({ id: 'task_00000000000000000000', patch: { priority: 1 } })).rejects.toThrow()
    const failed = spans.getFinishedSpans().find(span => span.name === 'tasks.update')!
    expect(failed.status.code).toBe(2)
    expect(failed.attributes['error.type']).toBe('OPERATION_FAILED:Error')
    const exception = failed.events.find(event => event.name === 'exception')!
    expect(exception.attributes?.['exception.stacktrace']).toContain('task not found')
    // The router's own complaint is kept too, inside the same trace.
    console.error('Hook processing failed', new Error('disk full'))
    await exportedSoFar()
    const [logged] = events('quuu.log').filter(record => record.attributes['quuu.log.label'] === 'Hook processing failed')
    expect(logged.attributes['exception.message']).toBe('disk full')
  })
})

describe('what the app reports about itself', () => {
  it('reports the setup at launch, each lifecycle fact after it commits, and a finished run as a span over its real duration', async () => {
    await startTelemetry(BUILD, ON, inMemory)
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'Fable' })
    const project = makeProject(app.db, { name: 'quuu', targetId: agent, path: workdir })
    observeApp(app)
    reportLaunch(app)
    await exportedSoFar()
    expect(events('quuu.app.started')[0].attributes).toMatchObject({ 'quuu.inventory.projects': 1, 'quuu.inventory.agents.enabled': 1 })
    expect(events('quuu.settings.profile')[0].attributes).toHaveProperty('quuu.settings.worktreeEnabled')

    const task = makeTask(app.db, project, 'private title')
    const run = occupy(app.db, task, agent)
    repo.updateRun(app.db, run, { status: 'failed', errorKind: 'nonzero-exit', errorMessage: 'exit 1', exitCode: 1, endedAt: new Date(Date.now() + 5000).toISOString() })
    await exportedSoFar()

    const facts = events('quuu.task.lifecycle').map(record => record.attributes['quuu.task.lifecycle'])
    expect(facts).toEqual(['created', 'queued', 'stopped'])
    const stopped = events('quuu.task.lifecycle').find(record => record.attributes['quuu.task.lifecycle'] === 'stopped')!
    expect(stopped.attributes).toMatchObject({ 'quuu.task.id': task, 'quuu.project.name': 'quuu', 'quuu.run.status': 'failed', 'quuu.agent.name': 'Fable', 'quuu.run.exit_code': 1 })

    const span = spans.getFinishedSpans().find(entry => entry.name === 'quuu.run')!
    const stored = repo.getRun(app.db, run)!
    expect(millis(span.startTime)).toBe(Date.parse(stored.startedAt))
    expect(millis(span.endTime)).toBe(Date.parse(stored.endedAt!))
    expect(span.status).toEqual({ code: 2, message: 'exit 1' })
    expect(span.parentSpanContext).toBeUndefined()
    expect(exported()).not.toContain('private title')
  })

  it('keeps a renderer crash with the screen and component stack it happened in', async () => {
    await startTelemetry(BUILD, ON, inMemory)
    reportRenderer({ kind: 'error', origin: 'render', type: 'TypeError', message: 'x is undefined', stack: 'TypeError: x is undefined\n    at Inspector', componentStack: '\n    at Inspector', screen: 'all/task' })
    await exportedSoFar()
    const [error] = events('quuu.error')
    expect(error.severityText).toBe('ERROR')
    expect(error.attributes).toMatchObject({ 'quuu.error.origin': 'renderer.render', 'exception.type': 'TypeError', 'quuu.ui.screen': 'all/task' })
    expect(error.attributes['exception.stacktrace']).toContain('Component stack:')
  })
})

describe('screen names', () => {
  const base: ScreenState = { section: { kind: 'all' }, cursorTaskId: null, detailOpen: false, settingsCategory: 'general', editingAgentId: null, editingGroupId: null, editingRuleId: null }

  it('names a place by where it is, never by what it shows', () => {
    expect(screenOf(base)).toBe('all')
    expect(screenOf({ ...base, cursorTaskId: 'task_1', detailOpen: true })).toBe('all/task')
    expect(screenOf({ ...base, section: { kind: 'settings' }, settingsCategory: 'agents', editingAgentId: 'agent_1' })).toBe('settings/agents/agent')
    const project = { ...base, section: { kind: 'project', id: 'proj_1' } } as const
    expect(screenOf(project)).toBe('project')
    // Every `project<Name>Open` flag is a panel, including ones added after this was written.
    expect(screenOf({ ...project, projectPullRequestsOpen: true, projectSettingsOpen: false } as ScreenState)).toBe('project/pullRequests')
  })
})

describe('window usage reports', () => {
  it('reports each new screen with how long the last one was shown, and a dragged pane once it settles', () => {
    vi.useFakeTimers()
    const sent: RendererTelemetry[] = []
    vi.stubGlobal('window', { quuuTelemetry: { record: (event: RendererTelemetry) => sent.push(event) } })
    type State = ScreenState & { table: object; filters: object; layout: { list: number }; paletteOpen: boolean }
    let state: State = { section: { kind: 'all' }, cursorTaskId: null, detailOpen: false, settingsCategory: 'general', editingAgentId: null, editingGroupId: null, editingRuleId: null, table: {}, filters: {}, layout: { list: 300 }, paletteOpen: false }
    const listeners: Array<(next: State, previous: State) => void> = []
    const set = (patch: Partial<State>): void => { const previous = state; state = { ...state, ...patch }; for (const listener of listeners) listener(state, previous) }
    const stop = startUsageReports({ getState: () => state, subscribe: listener => { listeners.push(listener); return () => undefined } })
    try {
      vi.advanceTimersByTime(4000)
      set({ cursorTaskId: 'task_1', detailOpen: true })
      for (const list of [310, 320, 330]) set({ layout: { list } })
      set({ paletteOpen: true })
      vi.advanceTimersByTime(1000)

      expect(sent).toEqual([
        { kind: 'screen', screen: 'all', previous: null, previousDurationMs: null },
        { kind: 'screen', screen: 'all/task', previous: 'all', previousDurationMs: 4000, taskId: 'task_1' },
        { kind: 'action', action: 'layout', fields: ['list'], screen: 'all/task' },
        { kind: 'action', action: 'palette.open', fields: [], screen: 'all/task' }
      ])
    } finally {
      stop()
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })
})
