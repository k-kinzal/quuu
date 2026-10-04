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
import { matchesRunnerLabels } from './labels.js'
import type { RunnerLoginAgent } from './agentAuth.js'
import { startLocalLogin, type StartLocalLogin } from './localLogin.js'
import type { GitCredential, RemoteJob, RemoteJobSpec, RemoteRunner, RunnerAgent, RunnerConfig, RunnerPoll, RunnerReply, RunnerWorkspace } from './types.js'

const ONLINE_MS = 20_000
interface PendingLogin {
  id: string
  agent: RunnerLoginAgent
  state: 'waiting' | 'delivering' | 'failed'
  error: string
  credential?: string
  cancel(): void
}
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
  private logins = new Map<string, PendingLogin>()
  constructor(private db: Db, private changed: () => void, private options: { login?: StartLocalLogin } = {}) { super() }

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
    for (const login of this.logins.values()) login.cancel()
    this.logins.clear()
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
      runners: repo.listRemoteRunners(this.db).map(({ tokenHash: _tokenHash, ...runner }) => {
        const login = this.logins.get(runner.id)
        return { ...runner, labels: runner.labels ?? [],
          agents: runner.agents.map(agent => ({ name: agent.name, command: agent.command, version: agent.version, auth: authentication(agent) })),
          ...(login ? { login: { agent: login.agent, state: login.state, error: login.error } } : {}),
          online: this.online(runner), active: repo.listRemoteJobs(this.db, runner.id).length }
      }) }
  }
  pairing() {
    if (!this.server) throw new Error(t('runners.listenerOff'))
    this.pin = { value: String(randomInt(0, 100_000_000)).padStart(8, '0'), expires: Date.now() + 5 * 60_000, attempts: 0 }
    const urls = this.status().urls
    return { pin: this.pin.value, expiresAt: new Date(this.pin.expires).toISOString(), fingerprint: this.fingerprint, urls,
      command: runnerLaunchCommand(urls[0] ?? '', this.fingerprint, this.pin.value) }
  }
  private pair(input: { version: 1; pin: string; name: string; agents: RemoteRunner['agents']; labels?: string[]; root: string; capacity: number }) {
    const pin = this.pin
    if (!pin || pin.expires < Date.now() || ++pin.attempts > 10 ||
      !timingSafeEqual(Buffer.from(hash(input.pin)), Buffer.from(hash(pin.value)))) throw new Error('Pairing refused')
    this.pin = null
    const token = randomBytes(32).toString('hex')
    const runner: RemoteRunner = { id: newId('runner'), name: input.name, agents: input.agents, root: posix.normalize(input.root),
      labels: input.labels ?? [], capacity: input.capacity, lastSeen: nowIso(), revoked: false, tokenHash: hash(token) }
    repo.saveRemoteRunner(this.db, runner)
    this.changed()
    return { id: runner.id, token }
  }
  revoke(id: string): void {
    const runner = this.requireRunner(id)
    if (repo.listRemoteJobs(this.db, id).length) throw new Error(t('runners.busyRevoke'))
    repo.saveRemoteRunner(this.db, { ...runner, revoked: true })
    this.logins.get(id)?.cancel()
    this.logins.delete(id)
    this.changed()
  }

  /**
   * Sign one Runner in to an agent: run the agent's own browser sign-in on this computer, then hand
   * the result over once. The Runner owns it from then on; Quuu keeps no copy. Every agent takes
   * this same path.
   */
  signIn(input: { runnerId: string; agent: RunnerLoginAgent }): ReturnType<RunnerOperations['status']> {
    const runner = this.requireRunner(input.runnerId)
    if (!this.online(runner)) throw new Error(t('runners.disconnected'))
    const advertised = runner.agents.find(agent => agent.name === input.agent)
    if (!advertised) throw new Error(t('runners.agentMissing', { name: input.agent }))
    // A worker that does not report sign-in also cannot receive one.
    if (advertised.signedIn === undefined) throw new Error(t('runners.updateRunner', { name: runner.name }))
    this.logins.get(runner.id)?.cancel()
    const command = repo.listAgents(this.db).find(agent => runnerAgentName(agent.command) === input.agent)?.command ?? input.agent
    const started = (this.options.login ?? startLocalLogin)(input.agent, command)
    const login: PendingLogin = { id: newId('login'), agent: input.agent, state: 'waiting', error: '', cancel: started.cancel }
    this.logins.set(runner.id, login)
    const current = (): boolean => this.logins.get(runner.id) === login
    started.credential.then(credential => {
      if (!current()) return
      login.credential = credential
      login.state = 'delivering'
      this.changed()
    }, (error: unknown) => {
      if (!current()) return
      login.state = 'failed'
      login.error = error instanceof Error ? error.message : String(error)
      this.changed()
    })
    this.changed()
    return this.status()
  }
  private online(runner: Pick<RemoteRunner, 'revoked' | 'lastSeen'>): boolean { return !runner.revoked && Date.now() - Date.parse(runner.lastSeen) < ONLINE_MS && !!this.server }
  private requireRunner(id: string): RemoteRunner {
    const runner = repo.listRemoteRunners(this.db).find(runner => runner.id === id)
    if (!runner) throw new Error(t('runners.notFound'))
    return runner
  }
  /** Installed and not known to be signed out. Older workers do not report sign-in. */
  supports(runner: RemoteRunner, agent: Agent): boolean {
    const name = runnerAgentName(agent.command)
    return runner.agents.some(item => item.name === name && !['missing', 'expired'].includes(authentication(item)))
  }

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
    const runner = repo.listRemoteRunners(this.db).find(candidate => matchesRunnerLabels(candidate, project) && this.online(candidate) && this.supports(candidate, agent) && (!auxiliary || this.supports(candidate, auxiliary)) &&
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
    const existing = this.workspace(taskId)
    return repo.listRemoteRunners(this.db).some(runner => (existing ? runner.id === existing.runnerId : matchesRunnerLabels(runner, project)) && this.online(runner) && this.supports(runner, agent) &&
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
      // Older workers treat this legacy field as confirmed URLs. Never send candidates there.
      review: { baseline: repo.getTaskReviewBase(this.db, taskId), evidence: { ...repo.reviewEvidence(this.db, taskId), pullRequests: [] },
        windows: runs.map(run => ({ from: run.startedAt, to: run.endedAt })),
        recorded: repo.getReviewSnapshot(this.db, taskId)?.snapshot.commits.map(commit => commit.sha) ?? [] }, ...input })
    const result = (await this.wait(id, 120_000)).result
    if (result?.reviewProofs && repo.getTask(this.db, taskId)) {
      repo.recordObservedCommits(this.db, taskId, result.reviewProofs.commits)
      for (const proof of result.reviewProofs.pullRequests) repo.recordVerifiedPullRequest(this.db, taskId, proof)
    }
    return result?.value
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
      const labels = input.labels ?? []
      const connectionChanged = !this.online(runner) || JSON.stringify(runner.agents) !== JSON.stringify(input.agents) || JSON.stringify(runner.labels ?? []) !== JSON.stringify(labels)
      if (connectionChanged || Date.now() - Date.parse(runner.lastSeen) >= 5000) {
        repo.saveRemoteRunner(this.db, { ...runner, agents: input.agents, labels, lastSeen: nowIso() })
      }
      const reply: RunnerReply = { jobs: [], cancel: [], acknowledgements: [], credentials: {} }
      const login = this.logins.get(runner.id)
      if (login && input.installed?.includes(login.id)) {
        this.logins.delete(runner.id)
        this.changed()
      } else if (login?.state === 'delivering' && login.credential) {
        reply.logins = [{ id: login.id, agent: login.agent, credential: login.credential }]
      }
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
            // A child can exit before its supervisor handles SIGTERM. The accepted
            // cancellation is already durable here and must survive that race.
            job.result = { ...update.result, canceled: job.cancelRequested || update.result.canceled }
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

function authentication(agent: RunnerAgent): NonNullable<RunnerAgent['auth']> | 'unknown' {
  return agent.auth ?? (agent.signedIn === undefined ? 'unknown' : agent.signedIn ? 'unverified' : 'missing')
}

/** One command that starts a paired Runner with Quuu's values filled in; the PIN is single-use. */
export function runnerLaunchCommand(url: string, fingerprint: string, pin: string, suffix = randomBytes(2).toString('hex')): string {
  const name = `quuu-runner-${suffix}`
  return [`docker run -d --name ${name} --restart unless-stopped`,
    `-e QUUU_CONTROLLER_URL=${url}`, `-e QUUU_CONTROLLER_FINGERPRINT=${fingerprint}`,
    `-e QUUU_RUNNER_PIN=${pin}`, `-e QUUU_RUNNER_NAME=${name}`,
    `--mount type=volume,source=${name}-data,target=/var/lib/quuu-runner`,
    `--mount type=volume,source=${name}-codex,target=/home/node/.codex`,
    `--mount type=volume,source=${name}-claude,target=/home/node/.claude`,
    `--mount type=volume,source=${name}-cursor,target=/home/node/.config/cursor`,
    '--tmpfs /run/quuu-runner:uid=1000,gid=1000,mode=0700',
    'quuu-runner-agents:local'].join(' \\\n  ')
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
