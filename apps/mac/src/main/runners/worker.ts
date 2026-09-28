import { execFile, spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync } from 'node:fs'
import { hostname } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { adapterFor } from '../agent-adapters/registry.js'
import { isStoreParser } from '../agent-adapters/types.js'
import { killProcessGroup } from '../platform/runProcess.js'
import { resolveLogPath } from '../session/logAdapters.js'
import { pinnedRequest } from './tls.js'
import { configuredRunnerLabels } from './labels.js'
import { atomicJson, executeJob, jobAuthDir, writeCredential } from './workerJob.js'
import { recordProcess, recordedProcess } from './processIdentity.js'
import type { RemoteJobSpec, RemoteResult, RunnerAgent, RunnerReply, RunnerUpdate } from './types.js'

interface WorkerRecord { spec: RemoteJobSpec; startedAt: number; logOffset: number; sessionOffset: number; sessionId: string; acknowledged: boolean }
interface Connection { url: string; fingerprint: string; id: string; token: string; capacity?: number }
const safeId = (value: string): boolean => /^[\w-]{1,100}$/.test(value)

export async function detectRunnerAgents(): Promise<RunnerAgent[]> {
  const names = (process.env.QUUU_RUNNER_AGENTS ?? 'codex,claude,cursor-agent').split(',').filter(Boolean)
  const agents: RunnerAgent[] = []
  for (const name of names) {
    if (!/^[\w.-]+$/.test(name)) continue
    try {
      const { stdout } = await promisify(execFile)(name, ['--version'], { timeout: 15_000, maxBuffer: 16_384 })
      agents.push({ name, command: name, version: stdout.trim().slice(0, 300) })
    } catch { /* Missing CLIs are not advertised. */ }
  }
  return agents
}

export class RunnerWorker {
  private stopped = false
  private agents: RunnerAgent[] = []
  private checkedAt = 0
  private cursor = 0
  constructor(readonly root: string, private entry: string, private connection: Connection) {
    mkdirSync(join(root, 'jobs'), { recursive: true, mode: 0o700 })
  }
  stop(): void { this.stopped = true }
  async run(): Promise<void> {
    while (!this.stopped) {
      try { await this.tick() }
      catch (error) { console.error(error instanceof Error ? error.message : 'Runner connection failed') }
      await delay(1000)
    }
  }
  async tick(): Promise<void> {
    if (Date.now() - this.checkedAt > 60_000) { this.agents = await detectRunnerAgents(); this.checkedAt = Date.now() }
    const records = this.records().filter(record => !record.acknowledged)
    // Two bounded results plus log chunks fit under the listener's request limit.
    const batch = records.slice(this.cursor, this.cursor + 2)
    this.cursor = this.cursor + 2 >= records.length ? 0 : this.cursor + 2
    const updates = batch.map(record => this.update(record))
    const reply = await pinnedRequest(this.connection.url, this.connection.fingerprint, '/poll', {
      version: 1, labels: configuredRunnerLabels(), agents: this.agents, updates
    }, this.connection.token) as RunnerReply
    for (const [id, credential] of Object.entries(reply.credentials)) {
      if (safeId(id)) writeCredential(this.root, id, credential)
    }
    for (const acknowledgement of reply.acknowledgements) {
      const record = records.find(record => record.spec.id === acknowledgement.id)
      if (!record) continue
      record.logOffset = acknowledgement.logOffset
      record.sessionOffset = acknowledgement.sessionOffset
      record.acknowledged = acknowledgement.finished
      this.save(record)
      if (record.acknowledged) rmSync(jobAuthDir(this.root, record.spec.id), { recursive: true, force: true })
    }
    let active = records.filter(record => !existsSync(join(this.root, 'jobs', record.spec.id, 'result.json'))).length
    const preparing = new Set(records.filter(record => !existsSync(join(this.root, 'jobs', record.spec.id, 'result.json')))
      .map(record => record.spec.taskId))
    const configured = this.connection.capacity ?? Number(process.env.QUUU_RUNNER_CAPACITY ?? '2')
    const capacity = Number.isFinite(configured) ? Math.max(1, Math.min(64, Math.floor(configured))) : 2
    for (const spec of reply.jobs) {
      if (existsSync(join(this.root, 'jobs', spec.id, 'record.json'))) continue
      const canceled = reply.cancel.includes(spec.id)
      if (!canceled && active >= capacity) continue
      if (!canceled && preparing.has(spec.taskId) && !existsSync(join(this.root, 'workspaces', `${spec.taskId}.baseline.json`))) continue
      this.launch(spec, canceled)
      if (!canceled) { active++; preparing.add(spec.taskId) }
    }
    for (const id of reply.cancel) this.cancel(id)
  }
  private records(): WorkerRecord[] {
    return readdirSync(join(this.root, 'jobs')).filter(safeId).flatMap(id => {
      try { return [JSON.parse(readFileSync(join(this.root, 'jobs', id, 'record.json'), 'utf8')) as WorkerRecord] } catch { return [] }
    })
  }
  private save(record: WorkerRecord): void { atomicJson(join(this.root, 'jobs', record.spec.id, 'record.json'), record) }
  private launch(spec: RemoteJobSpec, canceled = false): void {
    if (!safeId(spec.id) || !safeId(spec.taskId) || spec.workspace.runnerId !== this.connection.id) throw new Error('Invalid Runner job identity')
    const dir = join(this.root, 'jobs', spec.id)
    if (existsSync(join(dir, 'record.json'))) return
    if (spec.workspace.cwd !== join(this.root, 'workspaces', spec.taskId, spec.workspace.subdirectory) ||
      spec.workspace.subdirectory.split('/').includes('..')) throw new Error('Invalid Runner workspace')
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    this.save({ spec, startedAt: Date.now(), logOffset: 0, sessionOffset: 0, sessionId: spec.sessionId, acknowledged: false })
    atomicJson(join(dir, 'spec.json'), spec)
    if (canceled) { atomicJson(join(dir, 'result.json'), { ...this.failed(spec, ''), canceled: true }); return }
    const fd = openSync(join(dir, 'stdout.log'), 'a', 0o600)
    try {
      const child = spawn(process.execPath, [this.entry, 'execute', this.root, spec.id], {
        detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
      })
      child.once('error', error => atomicJson(join(dir, 'result.json'), this.failed(spec, error.message)))
      if (child.pid) recordProcess(join(dir, 'pid'), child.pid)
      child.unref()
    } finally { closeSync(fd) }
  }
  private failed(spec: RemoteJobSpec, error: string): RemoteResult {
    return { started: false, exitCode: null, canceled: false, timedOut: false, sessionId: spec.sessionId, error }
  }
  private update(record: WorkerRecord): RunnerUpdate {
    const spec = record.spec, dir = join(this.root, 'jobs', spec.id), stdout = join(dir, 'stdout.log')
    const adapter = adapterFor(spec.adapter)
    record.sessionId = adapter.sessionIdInStdout?.(stdout) ?? record.sessionId
    if (!resolveLogPath(spec.adapter, spec.workspace.cwd, record.sessionId) && adapter.recoverSessionId) {
      record.sessionId = adapter.recoverSessionId({ cwd: spec.workspace.cwd, startedAtMs: record.startedAt,
        claimed: new Set(this.records().filter(other => other.spec.taskId !== spec.taskId).map(other => other.sessionId)) }) ?? record.sessionId
    }
    const source = spec.adapter === 'stdout' || isStoreParser(adapter.createParser()) ? null : resolveLogPath(spec.adapter, spec.workspace.cwd, record.sessionId)
    const log = readChunk(stdout, record.logOffset), session = source ? readChunk(source, record.sessionOffset) : { data: '', end: true }
    const resultPath = join(dir, 'result.json')
    const pid = recordedProcess(join(dir, 'pid'))
    if (!existsSync(resultPath) && !pid) {
      const child = recordedProcess(join(dir, 'child-pid'))
      if (child) killProcessGroup(child, 'SIGKILL')
      atomicJson(resultPath, { ...this.failed(spec, 'Runner execution was interrupted; the instruction was not replayed'),
        started: existsSync(join(dir, 'child-pid')) })
    }
    const result = existsSync(resultPath) && log.end && session.end
      ? { ...JSON.parse(readFileSync(resultPath, 'utf8')) as RemoteResult, sessionId: record.sessionId } : undefined
    return { id: spec.id, logOffset: record.logOffset, log: log.data, sessionOffset: record.sessionOffset,
      session: session.data, sessionId: record.sessionId, ...(result ? { result } : {}) }
  }
  private cancel(id: string): void {
    if (!safeId(id)) return
    const dir = join(this.root, 'jobs', id)
    const pid = recordedProcess(join(dir, 'pid')), child = recordedProcess(join(dir, 'child-pid'))
    if (pid) killProcessGroup(pid, 'SIGTERM')
    if (child) {
      killProcessGroup(child, 'SIGTERM')
      setTimeout(() => killProcessGroup(child, 'SIGKILL'), 5000).unref()
    }
    // A cancellation can arrive before the lost launch response. Keep a durable tombstone.
    if (!existsSync(join(dir, 'record.json'))) {
      mkdirSync(dir, { recursive: true })
      atomicJson(join(dir, 'result.json'), { exitCode: null, canceled: true, timedOut: false, error: '', sessionId: '' })
    }
  }
}
function readChunk(path: string, offset: number): { data: string; end: boolean } {
  if (!existsSync(path)) return { data: '', end: true }
  const fd = openSync(path, 'r')
  try { const buffer = Buffer.alloc(256 * 1024), read = readSync(fd, buffer, 0, buffer.length, offset)
    return { data: buffer.subarray(0, read).toString('base64'), end: offset + read >= statSync(path).size }
  } finally { closeSync(fd) }
}

export async function workerMain(entry: string): Promise<void> {
  if (process.argv[2] === 'execute') {
    const root = process.argv[3], id = process.argv[4]
    if (!root || !safeId(id)) throw new Error('Invalid job arguments')
    await executeJob(root, JSON.parse(readFileSync(join(root, 'jobs', id, 'spec.json'), 'utf8')) as RemoteJobSpec)
    return
  }
  const root = resolve(process.env.QUUU_RUNNER_DATA ?? '/var/lib/quuu-runner')
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const configFile = join(root, 'connection.json')
  let connection: Connection
  if (existsSync(configFile)) connection = JSON.parse(readFileSync(configFile, 'utf8')) as Connection
  else {
    const url = process.env.QUUU_CONTROLLER_URL ?? '', fingerprint = process.env.QUUU_CONTROLLER_FINGERPRINT ?? ''
    const pin = process.env.QUUU_RUNNER_PIN_FILE ? readFileSync(process.env.QUUU_RUNNER_PIN_FILE, 'utf8').trim() : process.env.QUUU_RUNNER_PIN ?? ''
    const capacity = Number(process.env.QUUU_RUNNER_CAPACITY ?? '2')
    const paired = await pinnedRequest(url, fingerprint, '/pair', { version: 1, pin, root,
      name: process.env.QUUU_RUNNER_NAME ?? hostname(), capacity, labels: configuredRunnerLabels(), agents: await detectRunnerAgents() }) as { id: string; token: string }
    connection = { url, fingerprint, capacity, ...paired }
    atomicJson(configFile, connection)
  }
  delete process.env.QUUU_RUNNER_PIN
  console.log(`Runner connected as ${connection.id}`)
  const worker = new RunnerWorker(root, entry, connection)
  process.on('SIGTERM', () => worker.stop())
  process.on('SIGINT', () => worker.stop())
  await worker.run()
}
