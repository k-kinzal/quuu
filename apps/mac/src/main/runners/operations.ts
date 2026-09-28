import { EventEmitter } from 'node:events'
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { basename, join, posix } from 'node:path'
import type { Server } from 'node:https'
import { setTimeout as delay } from 'node:timers/promises'
import { userDataDir, runLogPath } from '../appPaths.js'
import type { Agent } from '../agents/types.js'
import type { Db } from '../db/database.js'
import { inTransaction } from '../db/database.js'
import * as repo from '../db/repo.js'
import { resolveHooks } from '../hooks/config.js'
import { candidateAgents } from '../execution/agentResolver.js'
import { t } from '../i18n/index.js'
import { issueToken } from '../platform/githubAuthRuntime.mjs'
import { GITHUB_API_VERSION, githubAppKeyStore, githubRepositoryFromRemote } from '../platform/githubAuth.js'
import type { Project } from '../projects/types.js'
import { botLogin, hasGitHubAppAuthentication, resolveCommitIdentity } from '../settings/commitIdentity.js'
import { newId, nowIso } from '../util.js'
import { listenForRunners } from './listener.js'
import { projectRepository } from './repository.js'
import type { GitCredential, RemoteJob, RemoteJobSpec, RemoteRunner, RunnerConfig, RunnerPoll, RunnerReply, RunnerWorkspace } from './types.js'

const ONLINE_MS = 20_000
const hash = (value: string): string => createHash('sha256').update(value).digest('hex')
export function runnerAgentName(command: string): string { return basename(command.replaceAll('\\', '/')).replace(/\.exe$/i, '') }

export class RunnerOperations extends EventEmitter {
  private server: Server | null = null
  private port = 0
  private fingerprint = ''
  private error = ''
  private stopped = false
  private pin: { value: string; expires: number; attempts: number } | null = null
  private credentials = new Map<string, GitCredential>()
  private issuing = new Map<string, Promise<GitCredential>>()
  private polls = new Set<string>()
  constructor(private db: Db, private changed: () => void) { super() }

  config(): RunnerConfig { return { enabled: false, port: 47833, ...JSON.parse(repo.getSetting(this.db, 'runners.config') ?? '{}') as Partial<RunnerConfig> } }
  async start(): Promise<void> {
    this.stopped = false
    if (!this.config().enabled || this.server) return
    try {
      const listening = await listenForRunners({ port: this.config().port, dir: join(userDataDir(), 'runners'),
        pair: input => this.pair(input), poll: (token, input) => this.poll(token, input) })
      if (this.stopped) { listening.server.close(); return }
      this.server = listening.server
      this.port = listening.port
      this.fingerprint = listening.fingerprint
      this.error = ''
    } catch (error) { this.error = error instanceof Error ? error.message : String(error) }
    this.changed()
  }
  stop(): void {
    this.stopped = true
    this.server?.closeAllConnections()
    this.server?.close()
    this.server = null
    this.pin = null
  }
  async configure(config: RunnerConfig): Promise<ReturnType<RunnerOperations['status']>> {
    repo.setSetting(this.db, 'runners.config', JSON.stringify(config))
    this.stop()
    await this.start()
    return this.status()
  }
  status() {
    return { ...this.config(), listening: this.server !== null, port: this.server ? this.port : this.config().port,
      fingerprint: this.fingerprint, error: this.error,
      urls: this.server ? Object.values(networkInterfaces()).flatMap(items => (items ?? [])
        .filter(item => item.family === 'IPv4' && !item.internal).map(item => `https://${item.address}:${this.port}`)) : [],
      runners: repo.listRemoteRunners(this.db).map(({ tokenHash: _tokenHash, ...runner }) => ({ ...runner,
        online: this.online(runner), active: repo.listRemoteJobs(this.db, runner.id).length })) }
  }
  pairing() {
    if (!this.server) throw new Error(t('runners.listenerOff'))
    this.pin = { value: String(randomInt(0, 100_000_000)).padStart(8, '0'), expires: Date.now() + 5 * 60_000, attempts: 0 }
    return { pin: this.pin.value, expiresAt: new Date(this.pin.expires).toISOString(), fingerprint: this.fingerprint, urls: this.status().urls }
  }
  private pair(input: { version: 1; pin: string; name: string; agents: RemoteRunner['agents']; root: string; capacity: number }) {
    const pin = this.pin
    if (!pin || pin.expires < Date.now() || ++pin.attempts > 10 ||
      !timingSafeEqual(Buffer.from(hash(input.pin)), Buffer.from(hash(pin.value)))) throw new Error('Pairing refused')
    this.pin = null
    const token = randomBytes(32).toString('hex')
    const runner: RemoteRunner = { id: newId('runner'), name: input.name, agents: input.agents, root: posix.normalize(input.root),
      capacity: input.capacity, lastSeen: nowIso(), revoked: false, tokenHash: hash(token) }
    repo.saveRemoteRunner(this.db, runner)
    this.changed()
    return { id: runner.id, token }
  }
  revoke(id: string): void {
    const runner = this.requireRunner(id)
    if (repo.listRemoteJobs(this.db, id).length) throw new Error(t('runners.busyRevoke'))
    repo.saveRemoteRunner(this.db, { ...runner, revoked: true })
    this.changed()
  }
  private online(runner: Pick<RemoteRunner, 'revoked' | 'lastSeen'>): boolean { return !runner.revoked && Date.now() - Date.parse(runner.lastSeen) < ONLINE_MS && !!this.server }
  private requireRunner(id: string): RemoteRunner {
    const runner = repo.listRemoteRunners(this.db).find(runner => runner.id === id)
    if (!runner) throw new Error(t('runners.notFound'))
    return runner
  }
  supports(runner: RemoteRunner, agent: Agent): boolean { return runner.agents.some(item => item.name === runnerAgentName(agent.command)) }

  /** Every auxiliary target needs a usable member on the same machine as the task checkout. */
  private dependenciesAvailable(runner: RemoteRunner, project: Project): boolean {
    const settings = repo.getAppSettings(this.db)
    const available = (kind: string, id: string | null): boolean => {
      if (!id) return false
      const ids = kind === 'group' ? repo.getGroup(this.db, id)?.memberIds ?? [] : [id]
      return ids.some(id => { const agent = repo.getAgent(this.db, id); return agent?.enabled === true && this.supports(runner, agent) })
    }
    if (settings.reportEnabled && project.reportEnabled && !available(settings.reportTargetKind, settings.reportTargetId)) return false
    return resolveHooks(settings.taskHooks, project.taskHooks).filter(hook => hook.enabled && hook.kind === 'agent')
      .every(hook => available(hook.targetKind, hook.targetId))
  }

  choose(taskId: string, project: Project, agent: Agent, auxiliary?: Agent): RunnerWorkspace | null {
    const existing = repo.getRunnerWorkspace(this.db, taskId)
    if (existing) {
      const runner = this.requireRunner(existing.runnerId)
      if (!project.runnerEnabled || !this.online(runner) || !this.supports(runner, agent) || (auxiliary && !this.supports(runner, auxiliary)) || !this.dependenciesAvailable(runner, project)) {
        throw new Error(t('runners.waiting', { name: runner.name }))
      }
      if (repo.listRemoteJobs(this.db, runner.id).length >= runner.capacity) throw new Error(t('runners.full', { name: runner.name }))
      return existing
    }
    if (!project.runnerEnabled || project.builtIn || repo.listRunsByTask(this.db, taskId).some(run => !run.runnerId)) return null
    const runner = repo.listRemoteRunners(this.db).find(candidate => this.online(candidate) && this.supports(candidate, agent) && (!auxiliary || this.supports(candidate, auxiliary)) &&
      this.dependenciesAvailable(candidate, project) && repo.listRemoteJobs(this.db, candidate.id).length < candidate.capacity)
    if (!runner) return null
    const remote = projectRepository(project.path, project.gitRemote)
    return { taskId, runnerId: runner.id, ...remote, cwd: posix.join(runner.root, 'workspaces', taskId, remote.subdirectory) }
  }
  reserve(workspace: RunnerWorkspace): void { repo.saveRunnerWorkspace(this.db, workspace) }
  chooseForHook(taskId: string, project: Project, agent?: Agent): RunnerWorkspace | null {
    const existing = this.workspace(taskId)
    if (existing) return existing
    const task = repo.getTask(this.db, taskId)
    if (!task) return null
    const target = task.agentOverrideId ? { ...project, targetKind: 'agent' as const, targetId: task.agentOverrideId } : project
    for (const primary of candidateAgents(this.db, target).filter(item => item.enabled)) {
      const chosen = this.choose(taskId, project, primary, agent)
      if (chosen) return chosen
    }
    return null
  }
  rankAgent(taskId: string, project: Project, agent: Agent): number {
    if (!project.runnerEnabled || project.builtIn || repo.listRunsByTask(this.db, taskId).some(run => !run.runnerId)) return 1
    return repo.listRemoteRunners(this.db).some(runner => this.online(runner) && this.supports(runner, agent) &&
      this.dependenciesAvailable(runner, project) && repo.listRemoteJobs(this.db, runner.id).length < runner.capacity) ? 0 : 1
  }
  workspace(taskId: string): RunnerWorkspace | null { return repo.getRunnerWorkspace(this.db, taskId) }
  agentCommand(workspace: RunnerWorkspace, agent: Agent): string {
    const command = this.requireRunner(workspace.runnerId).agents.find(item => item.name === runnerAgentName(agent.command))?.command
    if (!command) throw new Error(t('runners.agentMissing', { name: agent.name }))
    return command
  }
  canUseAgent(taskId: string, agent: Agent): boolean {
    const workspace = this.workspace(taskId)
    return !workspace || this.supports(this.requireRunner(workspace.runnerId), agent)
  }
  enqueue(spec: RemoteJobSpec, logPath = runLogPath(spec.id)): RemoteJob {
    const existing = repo.getRemoteJob(this.db, spec.id)
    if (existing) return existing
    const job: RemoteJob = { id: spec.id, runnerId: spec.workspace.runnerId, taskId: spec.taskId, status: 'queued',
      spec, cancelRequested: false, logPath, sessionPath: null, logOffset: 0, sessionOffset: 0, result: null }
    repo.saveRemoteJob(this.db, job)
    return job
  }
  job(id: string): RemoteJob | null { return repo.getRemoteJob(this.db, id) }
  async inspect(taskId: string, action: 'snapshot' | 'file' | 'comment', input: Partial<Pick<RemoteJobSpec, 'review' | 'file' | 'comment'>> = {}): Promise<unknown> {
    const workspace = this.workspace(taskId)
    const task = repo.getTask(this.db, taskId)
    const project = task ? repo.getProject(this.db, task.projectId) : null
    if (!workspace || !project) throw new Error(t('runners.notFound'))
    if (!this.online(this.requireRunner(workspace.runnerId))) throw new Error(t('runners.disconnected'))
    const id = newId('inspect')
    const runs = repo.listRunsByTask(this.db, taskId)
    this.enqueue({ id, taskId, projectId: project.id, workspace, action, command: '', args: [], env: {}, sessionId: '',
      adapter: 'stdout', timeoutSeconds: 120, createWorkspace: false, project,
      review: { baseline: repo.getTaskReviewBase(this.db, taskId), evidence: repo.reviewEvidence(this.db, taskId),
        windows: runs.map(run => ({ from: run.startedAt, to: run.endedAt })),
        recorded: repo.getReviewSnapshot(this.db, taskId)?.snapshot.commits.map(commit => commit.sha) ?? [] }, ...input })
    return (await this.wait(id, 120_000)).result?.value
  }
  logOnRunner(taskId: string, runId: string): string {
    const workspace = this.workspace(taskId)
    if (!workspace) throw new Error(t('runners.notFound'))
    return posix.join(this.requireRunner(workspace.runnerId).root, 'jobs', runId, 'stdout.log')
  }
  cancel(id: string): void {
    const job = this.job(id)
    if (job && job.status !== 'finished') repo.saveRemoteJob(this.db, { ...job, cancelRequested: true })
  }
  async wait(id: string, timeout = 60_000): Promise<RemoteJob> {
    const deadline = Date.now() + timeout
    while (!this.stopped && this.db.isOpen && Date.now() < deadline) {
      const job = this.job(id)
      if (job?.status === 'finished') {
        if (job.result?.error || job.result?.exitCode !== 0) throw new Error(job.result?.error || t('runners.operationFailed'))
        return job
      }
      await delay(100)
    }
    this.cancel(id)
    throw new Error(t('runners.disconnected'))
  }

  private async credential(job: RemoteJob): Promise<GitCredential | null> {
    const identity = resolveCommitIdentity(repo.getAppSettings(this.db), job.spec.project)
    const repository = githubRepositoryFromRemote(job.spec.workspace.repository)
    if (!identity || !hasGitHubAppAuthentication(identity) || !repository) return null
    const key = `${identity.appId}:${repository}`
    const cached = this.credentials.get(key)
    if (cached && cached.expiresAt > Date.now() + 15 * 60_000) return cached
    let issuing = this.issuing.get(key)
    if (!issuing) {
      issuing = issueToken({ appId: identity.appId!, repository, ...githubAppKeyStore(identity.appId!), apiVersion: GITHUB_API_VERSION }, AbortSignal.timeout(30_000))
        .then(issued => { const credential = { ...issued, repository, user: botLogin(identity.appSlug) }; this.credentials.set(key, credential); return credential })
        .finally(() => this.issuing.delete(key))
      this.issuing.set(key, issuing)
    }
    return issuing
  }

  private async poll(token: string, input: RunnerPoll): Promise<RunnerReply> {
    const runner = repo.listRemoteRunners(this.db).find(item => !item.revoked && timingSafeEqual(Buffer.from(item.tokenHash), Buffer.from(hash(token))))
    if (!runner || this.polls.has(runner.id)) throw new Error('Runner authentication failed')
    this.polls.add(runner.id)
    try {
      const connectionChanged = !this.online(runner) || JSON.stringify(runner.agents) !== JSON.stringify(input.agents)
      if (connectionChanged || Date.now() - Date.parse(runner.lastSeen) >= 5000) {
        repo.saveRemoteRunner(this.db, { ...runner, agents: input.agents, lastSeen: nowIso() })
      }
      const reply: RunnerReply = { jobs: [], cancel: [], acknowledgements: [], credentials: {} }
      for (const update of input.updates) {
        const job = this.job(update.id)
        if (!job || job.runnerId !== runner.id) continue
        if (job.status !== 'finished') {
          job.logOffset = appendChunk(job.logPath, job.logOffset, update.logOffset, update.log)
          if (update.session) {
            job.sessionPath ??= `${job.logPath}.session.jsonl`
            job.sessionOffset = appendChunk(job.sessionPath, job.sessionOffset, update.sessionOffset, update.session)
          }
          job.status = 'running'
          // Completion is acknowledged only after every byte in this update was committed.
          if (update.result && job.logOffset === update.logOffset + Buffer.from(update.log, 'base64').length &&
            job.sessionOffset === update.sessionOffset + Buffer.from(update.session, 'base64').length) {
            job.result = update.result
            job.status = 'finished'
          }
          inTransaction(this.db, () => { repo.saveRemoteJob(this.db, job); this.emit('job', job, update.sessionId) })
        }
        reply.acknowledgements.push({ id: job.id, logOffset: job.logOffset, sessionOffset: job.sessionOffset, finished: job.status === 'finished' })
      }
      for (const job of repo.listRemoteJobs(this.db, runner.id)) {
        if (job.cancelRequested) {
          reply.cancel.push(job.id)
          if (job.status === 'queued') reply.jobs.push(job.spec)
          continue
        }
        try {
          const credential = await this.credential(job)
          if (this.stopped || !this.db.isOpen) break
          if (credential) reply.credentials[job.id] = credential
          // A lost response resends the same immutable id; the worker's durable journal deduplicates it.
          if (job.status === 'queued') reply.jobs.push(job.spec)
        } catch (error) {
          if (this.stopped || !this.db.isOpen) break
          if (job.status === 'queued') {
            job.status = 'finished'
            job.result = { started: false, exitCode: null, canceled: false, timedOut: false, sessionId: job.spec.sessionId,
              error: error instanceof Error ? error.message : String(error) }
            repo.saveRemoteJob(this.db, job)
            this.emit('job', job, job.spec.sessionId)
          }
        }
      }
      if (connectionChanged) this.changed()
      return reply
    } finally { this.polls.delete(runner.id) }
  }
}

/** The persisted byte cursor is authoritative, including after a crash between file and DB writes. */
function appendChunk(path: string, offset: number, incoming: number, encoded: string): number {
  if (incoming !== offset || !encoded) return offset
  mkdirSync(join(path, '..'), { recursive: true })
  const data = Buffer.from(encoded, 'base64')
  const fd = openSync(path, existsSync(path) ? 'r+' : 'w', 0o600)
  try { writeSync(fd, data, 0, data.length, offset) } finally { closeSync(fd) }
  return offset + data.length
}
