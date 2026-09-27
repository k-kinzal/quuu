import { auxiliaryMessages } from '../session/auxiliary.js'
import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { adapterFor } from '../agent-adapters/registry.js'
import { orderAgents, type Agent } from '../agents/types.js'
import { runExitPath, runLogPath } from '../appPaths.js'
import { afterCommit, inTransaction, type Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { Run } from '../execution/types.js'
import { t } from '../i18n/index.js'
import { cleanupGitHubAuth, prepareGitHubAuthEnvironment } from '../platform/githubAuth.js'
import { isProcessAlive, killProcessGroup, readExitCode, readLogTail } from '../platform/runProcess.js'
import { resolveLoginPath } from '../platform/shellEnv.js'
import { commitIdentityEnv, resolveCommitIdentity } from '../settings/commitIdentity.js'
import type { Task } from '../tasks/types.js'
import { newId, newSessionId, nowIso } from '../util.js'
import { resolveHooks } from './config.js'
import type { HookEvent, HookRun } from './types.js'
import type { StoredHookRun } from './stored.js'

const ACTIVE = new Set(['queued', 'starting', 'running'])
// The pid file closes the spawn/persistence gap on a restart; ambiguous starts are never replayed.
const WRAPPER = 'printf %s "$$" > "$QUUU_HOOK_PID_FILE"; "$@"; __quuu_code=$?; printf %s "$__quuu_code" > "$QUUU_EXIT_FILE"; exit $__quuu_code'

export class HookOperations {
  private timer: NodeJS.Timeout | null = null
  private stopped = false
  private ticking = false
  private report: ((taskId: string) => Promise<void>) | null = null
  setReportHook(report: (taskId: string) => Promise<void>): void { this.report = report }
  constructor(private db: Db, private changed: () => void, private workspace: (id: string) => string | null) {
    repo.setLifecycleRecorder(db, (task, event, run) => { this.record(task, event, run) })
  }

  record(task: Task, event: HookEvent, source?: Run): string[] {
    const project = repo.getProject(this.db, task.projectId)
    if (!project) return []
    const settings = repo.getAppSettings(this.db)
    if (event === 'review' && this.report && settings.reportEnabled && project.reportEnabled) {
      repo.queueHookReport(this.db, task.id)
      afterCommit(this.db, () => this.kick())
    }
    const definitions = resolveHooks(settings.taskHooks, project.taskHooks)
      .filter(hook => hook.enabled && hook.events.includes(event))
    const ids: string[] = []
    for (const definition of definitions) {
      const id = newId('hook')
      const cwd = event === 'deleted' ? project.path : this.workspace(task.id) ?? source?.cwd ?? project.path
      const run: StoredHookRun = {
        id, taskId: task.id, taskTitle: task.title, projectId: task.projectId,
        hookId: definition.id, name: definition.name || definition.id, event, kind: definition.kind,
        status: 'queued', cwd, input: definition.kind === 'agent' ? definition.prompt : definition.command,
        agentId: null, createdAt: nowIso(), startedAt: null, endedAt: null, exitCode: null, error: '',
        logPath: runLogPath(id), exitPath: runExitPath(id), pid: null, authDir: null,
        sessionId: newSessionId(), logAdapter: null, limitPatterns: [], definition, project
      }
      repo.saveHookRun(this.db, run)
      ids.push(id)
    }
    if (ids.length) afterCommit(this.db, () => { this.changed(); this.kick() })
    return ids
  }

  start(): void {
    this.stopped = false
    this.kick()
    this.timer = setInterval(() => this.kick(), 1000)
    this.timer.unref?.()
  }
  stop(): void {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    repo.setLifecycleRecorder(this.db, null)
  }
  private kick(): void {
    if (this.stopped) return
    void this.tick().catch(error => console.error('Hook processing failed', error))
  }

  resolve(projectId?: string) {
    return resolveHooks(repo.getAppSettings(this.db).taskHooks, projectId ? repo.getProject(this.db, projectId)?.taskHooks ?? [] : [])
  }

  list(query: { taskId?: string; projectId?: string; limit?: number }): HookRun[] {
    return repo.listHookRuns(this.db, query).map(publicRun)
  }
  log(id: string) {
    const run = this.requireRun(id)
    const output = readLogTail(run.logPath)
    return { run: publicRun(run), output, messages: auxiliaryMessages(run.logAdapter, run.cwd, run.sessionId, output) }
  }
  cancel(id: string): void {
    const run = this.requireRun(id)
    if (!ACTIVE.has(run.status)) return
    const pid = run.pid ?? readExitCode(run.exitPath + '.pid')
    if (pid) killProcessGroup(pid, 'SIGKILL')
    this.finish(run, 'canceled', null, t('hooks.canceled'))
  }
  retry(id: string): HookRun {
    const previous = this.requireRun(id)
    if (ACTIVE.has(previous.status)) throw new Error(t('hooks.busy'))
    const nextId = newId('hook')
    const run: StoredHookRun = { ...previous, id: nextId, status: 'queued', pid: null, authDir: null,
      createdAt: nowIso(), startedAt: null, endedAt: null, exitCode: null, error: '', agentId: null,
      sessionId: newSessionId(), logPath: runLogPath(nextId), exitPath: runExitPath(nextId) }
    repo.saveHookRun(this.db, run)
    this.changed()
    this.kick()
    return publicRun(run)
  }

  async beforeComplete(task: Task): Promise<void> {
    const ids = inTransaction(this.db, () => this.record(task, 'beforeComplete'))
    // Earlier stop/review hooks finish first, so completion never removes a checkout in use.
    await this.waitFor(() => repo.listHookRuns(this.db, { projectId: task.projectId, active: true }))
    for (const id of ids) {
      const run = this.requireRun(id)
      if (run.status !== 'succeeded') throw new Error(t('hooks.completionFailed', { name: run.name, reason: run.error }))
    }
  }
  async beforeDelete(taskId: string): Promise<void> {
    const active = repo.listHookRuns(this.db, { taskId, active: true })
    for (const run of active) this.cancel(run.id)
    const deadline = Date.now() + 15_000
    while (active.some(run => run.pid && isProcessAlive(run.pid))) {
      if (Date.now() > deadline) throw new Error(t('hooks.busy'))
      await delay(50)
      if (this.stopped) throw new Error(t('hooks.interrupted'))
    }
  }
  private async waitFor(read: () => StoredHookRun[]): Promise<void> {
    while (read().some(run => ACTIVE.has(run.status))) {
      if (this.stopped || !this.db.isOpen) throw new Error(t('hooks.interrupted'))
      this.kick()
      await delay(100)
    }
  }

  async tick(): Promise<void> {
    if (this.stopped || this.ticking || !this.db.isOpen) return
    this.ticking = true
    try {
      const active = repo.listHookRuns(this.db, { active: true, limit: 10000 })
      for (const run of active.filter(run => run.status !== 'queued')) this.observe(run)
      const busy = new Set<string>()
      for (const run of repo.listHookRuns(this.db, { active: true, limit: 10000 })) {
        if (busy.has(run.projectId)) continue
        busy.add(run.projectId)
        if (run.status !== 'queued') continue
        // Start hooks deliberately observe an active agent. Other hooks wait until work is quiet.
        if (run.event !== 'started' && repo.countActiveRunsByProject(this.db, run.projectId) > 0) continue
        await this.launch(run)
        if (this.stopped) return
      }
      if (this.report) for (const taskId of repo.pendingHookReports(this.db)) {
        const task = repo.getTask(this.db, taskId)
        if (task && repo.hasPendingHooks(this.db, task.projectId)) continue
        if (task?.status === 'review') await this.report(taskId)
        if (this.stopped || !this.db.isOpen) return
        repo.removeHookReport(this.db, taskId)
      }
    } finally { this.ticking = false }
  }

  private observe(run: StoredHookRun): void {
    if (run.logAdapter) {
      const sessionId = adapterFor(run.logAdapter).sessionIdInStdout?.(run.logPath)
      if (sessionId && sessionId !== run.sessionId) { run = { ...run, sessionId }; repo.saveHookRun(this.db, run) }
    }
    const pid = run.pid ?? readExitCode(run.exitPath + '.pid')
    const code = readExitCode(run.exitPath)
    const alive = pid !== null && isProcessAlive(pid)
    if (alive && run.startedAt && Date.now() - Date.parse(run.startedAt) >= run.definition.timeoutSeconds * 1000) {
      killProcessGroup(pid, 'SIGKILL')
      this.finish(run, 'failed', code, t('hooks.timeout'))
    } else if (!alive) {
      const result = run.logAdapter && code !== null ? adapterFor(run.logAdapter).classify({
        exitCode: code, signal: null, output: readLogTail(run.logPath), limitPatterns: run.limitPatterns,
        timedOut: false, canceled: false
      }) : null
      const success = code === 0 && !result?.kind
      this.finish(run, success ? 'succeeded' : 'failed', code,
        success ? '' : result?.message || (code === null ? t('hooks.interrupted') : t('hooks.exit', { code })))
    } else if (run.pid !== pid || run.status === 'starting') {
      repo.saveHookRun(this.db, { ...run, pid, status: 'running' })
    }
  }

  private async launch(run: StoredHookRun): Promise<void> {
    let authDir: string | null = null
    try {
      if (!run.input.trim()) throw new Error(t('hooks.emptyInput'))
      const path = await resolveLoginPath()
      if (this.stopped || this.requireRun(run.id).status !== 'queued') return
      const agent = run.kind === 'agent' ? this.chooseAgent(run) : null
      if (run.kind === 'agent' && !agent) return
      const settings = repo.getAppSettings(this.db)
      const baseEnv = { ...process.env, ...agent?.env, ...commitIdentityEnv(settings, run.project), PATH: path }
      const auth = prepareGitHubAuthEnvironment(resolveCommitIdentity(settings, run.project), run.cwd, path, baseEnv)
      authDir = auth.dir
      let command = '/bin/sh'
      let args = ['-c', run.input]
      if (agent) {
        const invocation = adapterFor(agent.logAdapter).invoke({ command: agent.command, template: agent.argsTemplate,
          vars: { prompt: run.input, title: run.taskTitle, sessionId: run.sessionId, projectPath: run.cwd,
            projectName: run.project.name, taskId: run.taskId, runId: run.id } })
        command = invocation.command
        args = invocation.args
      }
      const launch = auth.launch ? [...auth.launch, command, ...args] : [command, ...args]
      const started: StoredHookRun = { ...run, status: 'starting', startedAt: nowIso(), agentId: agent?.id ?? null, logAdapter: agent?.logAdapter ?? null, limitPatterns: agent?.limitPatterns ?? [], authDir }
      repo.saveHookRun(this.db, started)
      const fd = openSync(run.logPath, 'a')
      try {
        const child = spawn('/bin/sh', ['-c', WRAPPER, 'Quuu hook', ...launch], {
          cwd: run.cwd, detached: true, stdio: ['ignore', fd, fd],
          env: { ...baseEnv, ...auth.env, ELECTRON_RUN_AS_NODE: undefined, NODE_OPTIONS: undefined,
            QUUU_TASK_ID: run.taskId, QUUU_PROJECT: run.project.name, QUUU_RUN_ID: run.id,
            QUUU_HOOK_ID: run.hookId, QUUU_HOOK_EVENT: run.event,
            QUUU_EXIT_FILE: run.exitPath, QUUU_HOOK_PID_FILE: run.exitPath + '.pid' }
        })
        child.on('error', error => {
          if (!this.stopped && this.db.isOpen && ACTIVE.has(this.requireRun(run.id).status)) this.finish(started, 'failed', null, error.message)
        })
        child.unref()
        repo.saveHookRun(this.db, { ...started, status: 'running', pid: child.pid ?? null })
      } finally { closeSync(fd) }
      if (agent && run.definition.targetKind === 'group') repo.advanceGroupRotation(this.db, run.definition.targetId, agent.id)
      this.changed()
    } catch (error) {
      cleanupGitHubAuth(authDir)
      if (!this.stopped && this.db.isOpen) this.finish(run, 'failed', null, error instanceof Error ? error.message : String(error))
    }
  }
  private chooseAgent(run: StoredHookRun): Agent | null {
    const definition = run.definition
    const group = definition.targetKind === 'group' ? repo.getGroup(this.db, definition.targetId) : null
    const members = group ? group.memberIds.map(id => repo.getAgent(this.db, id)).filter((agent): agent is Agent => agent !== null) : []
    const candidates = definition.targetKind === 'agent' ? [repo.getAgent(this.db, definition.targetId)] :
      group ? orderAgents(group.strategy, members, new Map(members.map(a => [a.id, repo.countActiveRunsByAgent(this.db, a.id)])), repo.groupRotation(this.db, group.id)) : []
    const enabled = candidates.filter((agent): agent is Agent => agent?.enabled === true)
    if (enabled.length === 0) throw new Error(t('hooks.noAgent'))
    return enabled.find(agent => !repo.isCoolingDown(this.db, agent.id) &&
      repo.countActiveRunsByAgent(this.db, agent.id) < agent.concurrency) ?? null
  }
  private finish(run: StoredHookRun, status: 'succeeded' | 'failed' | 'canceled', exitCode: number | null, error: string): void {
    cleanupGitHubAuth(run.authDir)
    repo.saveHookRun(this.db, { ...run, status, exitCode, error, endedAt: nowIso() })
    this.changed()
  }
  private requireRun(id: string): StoredHookRun {
    const run = repo.getHookRun(this.db, id)
    if (!run) throw new Error(t('hooks.notFound'))
    return run
  }
}

function publicRun(run: StoredHookRun): HookRun {
  const { definition: _definition, project: _project, pid: _pid, exitPath: _exitPath, authDir: _authDir, sessionId: _sessionId, logAdapter: _logAdapter, limitPatterns: _limitPatterns, ...result } = run
  return result
}
