import { RunnerOperations } from './runners/operations.js'
import { AssistantOperations } from './assistant/operations.js'
import { HookOperations } from './hooks/operations.js'
import { EventEmitter } from 'node:events'
import { dirname } from 'node:path'
import { dbPath as defaultDbPath } from './appPaths.js'
import type { AppInfo } from '../api/schemas/app.js'
import { AgentOperations } from './agents/operations.js'
import { sessionOptions } from './agents/sessionOptions.js'
import { AutomationOperations } from './automation/operations.js'
import type { Db } from './db/database.js'
import { afterCommit, openDatabase } from './db/database.js'
import * as repo from './db/repo.js'
import type { FinishedEvent } from './execution/runner.js'
import { Runner } from './execution/runner.js'
import { Scheduler } from './execution/scheduler.js'
import { t } from './i18n/index.js'
import { SessionImporter } from './import/importer.js'
import { MobileSync } from './mobile-sync/mobileSync.js'
import { primeProcessPath } from './platform/shellEnv.js'
import { ProjectOperations } from './projects/operations.js'
import { PullRequestFollowUp } from './automation/pullRequestFollowUp.js'
import { ProjectReportOperations } from './report/projectOperations.js'
import { ReportOperations } from './report/operations.js'
import { WorkspaceOperations } from './projects/workspace.js'
import { ReviewOperations } from './review/operations.js'
import { ReviewService } from './review/service.js'
import type { ReviewSnapshot } from './review/types.js'
import { offerNewAgents, seedIfEmpty } from './seed.js'
import { attachActiveRuns, sessionReadTarget } from './session/sessionAttach.js'
import { SessionView } from './session/view.js'
import { SessionIndex, sessionKey } from './session/index.js'
import { workplaceDerivation } from './session/workplace.js'
import { reviewEvidenceDerivation } from './review/evidence.js'
import { SettingsOperations } from './settings/operations.js'
import { NetworkOperations } from './settings/network.js'
import type { AppSettings } from './settings/types.js'
import type { AppSnapshot, MobileSyncStatus, ToastPayload } from './snapshot.js'
import { TaskOperations } from './tasks/operations.js'
import { TerminalOperations } from './terminal/operations.js'
import { TerminalService } from './terminal/service.js'
import { sweepGitHubAuth } from './platform/githubAuth.js'

/** What the app menu knows about the running Quuu, for clients without a window. */
export interface AppControls {
  info(): AppInfo
  checkForUpdates(): AppInfo
}

/** Full sync of imported sessions. Reads hundreds of logs, so it can't be shorter. */
const IMPORT_SYNC_MS = 60_000

/**
 * Interval for re-checking only the "running" imported sessions.
 *
 * It just stats the few running ones, so it runs on a shorter cycle than the
 * full sync. This decides how long a finished session lingers on screen as running.
 */
const LIVENESS_TICK_MS = 5_000


/** Assembles the features that live for the app's lifetime. Operations connect to each feature's public interface. */

/** Retention is a matter of days, so a few looks a day keep it within hours of the period. */
const RETENTION_CHECK_MS = 6 * 60 * 60 * 1000

export class QuuuApp extends EventEmitter {
  readonly db: Db
  readonly runners: RunnerOperations
  readonly runner: Runner
  readonly scheduler: Scheduler
  readonly importer: SessionImporter
  readonly mobile: MobileSync
  readonly reviews: ReviewOperations
  readonly hooks: HookOperations
  readonly reports: ReportOperations
  readonly projectReports: ProjectReportOperations
  readonly pullRequestFollowUp: PullRequestFollowUp
  readonly terminal: TerminalOperations
  readonly review: ReviewService
  readonly terminals: TerminalService
  private initialImport: NodeJS.Timeout | null = null
  private importTimer: NodeJS.Timeout | null = null
  private livenessTimer: NodeJS.Timeout | null = null
  readonly tasks: TaskOperations
  readonly assistant: AssistantOperations
  readonly projects: ProjectOperations
  readonly automation: AutomationOperations
  readonly agents: AgentOperations
  readonly workspace: WorkspaceOperations
  readonly settings: SettingsOperations
  readonly network: NetworkOperations
  private sessionViews = new Set<SessionView>()
  readonly sessions: SessionIndex
  private projectionTimer: NodeJS.Timeout | null = null
  private retentionTimer: NodeJS.Timeout | null = null
  private projectionRuns = new Map<string, string>()
  private historicalProbeAt = 0
  private builtInWorkspace: string | null = null
  private controls: AppControls | null = null
  constructor(dbPath?: string) {
    super()
    this.db = openDatabase(dbPath)
    this.runners = new RunnerOperations(this.db, () => this.changed())
    this.runner = new Runner(this.db, this.runners)
    this.scheduler = new Scheduler(this.db, this.runner)
    this.importer = new SessionImporter(this.db)
    this.review = new ReviewService()
    this.terminals = new TerminalService()
    this.settings = new SettingsOperations(this.db)
    // Beside the database it describes, so a verification instance never hosts as production
    this.network = new NetworkOperations(dirname(dbPath ?? defaultDbPath()))
    this.tasks = new TaskOperations(this.db, () => this.changed(), () => afterCommit(this.db, () => this.scheduler.kick()), (id) => this.scheduler.runNow(id), (id) => this.runner.cancel(id), (toast) => this.emit('notify', toast), { beforeComplete: task => this.hooks.beforeComplete(task), beforeDelete: id => this.hooks.beforeDelete(id) })
    this.assistant = new AssistantOperations(this.db, dirname(dbPath && dbPath !== ':memory:' ? dbPath : defaultDbPath()), this.tasks, () => this.changed(), id => { this.tasks.cancelTask(id) }, payload => this.notify(payload))
    this.scheduler.setIdleWork(() => this.assistant.prepareCheck())
    this.runner.setPromptContext((project, task) => project.builtIn ? this.assistant.promptContext(task.id) : '')
    this.projects = new ProjectOperations(this.db, () => this.changed(), () => afterCommit(this.db, () => this.scheduler.kick()), id => this.tasks.deleteTask(id))
    this.automation = new AutomationOperations(this.db, () => this.changed(), () => afterCommit(this.db, () => this.scheduler.kick()))
    this.agents = new AgentOperations(this.db, () => this.changed(), () => afterCommit(this.db, () => this.scheduler.kick()))
    this.workspace = new WorkspaceOperations(this.db, () => this.settings.getSettings())
    this.hooks = new HookOperations(this.db, () => this.changed(), id => this.workspace.workingDir({ kind: 'task', id })?.dir ?? null, this.runners)
    this.reviews = new ReviewOperations(this.db, () => this.settings.getSettings(), this.review, id => this.workspace.workbenchPlace(id), this.runners)
    this.projectReports = new ProjectReportOperations(this.db, () => this.settings.getSettings())
    this.reports = new ReportOperations(this.db, () => this.settings.getSettings(), id => this.workspace.workbenchPlace(id), this.runners)
    /*
     * A Pull Request that is not in order sends the task back through the same entry a person's
     * follow-up takes. It decides on full projections only, so a retained copy never speaks for
     * GitHub.
     */
    this.pullRequestFollowUp = new PullRequestFollowUp(this.db, () => this.settings.getSettings(), {
      indexed: id => this.indexedLatestRun(id),
      refresh: id => this.reviews.refresh(id),
      sendBack: (id, message) => {
        if (repo.getTask(this.db, id)?.status === 'review') {
          return this.tasks.send(id, message).ok
        }
        return this.scheduler.concludeCheck(id, message)
      },
      conclude: id => { this.scheduler.concludeCheck(id) }
    })
    this.reviews.on('projected', (taskId: string, snapshot: ReviewSnapshot) => { this.pullRequestFollowUp.onProjected(taskId, snapshot) })
    /*
     * Everything derived from a conversation is derived here, as its pages land: the commits and
     * Pull Requests the review shows, and the directory the agent worked in. Screens, reports and
     * the terminal read what was derived; none of them opens a session log.
     */
    this.sessions = new SessionIndex(this.db, [reviewEvidenceDerivation, workplaceDerivation])
    this.sessions.on('indexed', (_key: string, taskId: string) => {
      this.reviews.requestRefresh(taskId)
      const task = repo.getTask(this.db, taskId)
      if (task && repo.getProject(this.db, task.projectId)?.builtIn) this.changed()
    })
    /*
     * A run that just ended is what the human looks at next, and what the next run is decided
     * from: whether the instruction it carried already sits in the conversation is read off the
     * index. Left to the periodic sweep, a long log could still be catching up while the screen
     * marked a delivered instruction as unsent and the retry sent it a second time.
     */
    this.runner.on('finished', (event: FinishedEvent) => {
      try { this.sessions.request(event.run, undefined, true) }
      catch (error) { console.warn('Cannot schedule session indexing', error) }
    })
    this.terminal = new TerminalOperations(this.terminals, id => this.workspace.workbenchPlace(id))
    this.settings.on('changed', (settings: AppSettings, patch: Partial<AppSettings>) => {
      if (patch.tickIntervalMs !== undefined) this.scheduler.start(settings.tickIntervalMs)
      if (patch.importExternalSessions !== undefined || patch.importHistoryDays !== undefined || patch.importCreateProjects !== undefined) this.startImport()
      if (patch.mobileSyncEnabled !== undefined) this.mobile.configure(settings, this.scheduler.status().running)
      if (patch.retentionDays !== undefined) this.applyRetention()
      this.emit('settings', settings)
    })
    /*
     * Sync with the iPhone. Application goes **through the app's regular
     * operations** (we pass this). Writing the DB directly from here would skip
     * side effects — waking the scheduler, freeing a slot on completion — and
     * leave only tasks queued from the iPhone not working.
     */
    this.mobile = new MobileSync(this.db, this.tasks, ({ applied, conflicts }) => {
      if (applied > 0) this.changed()
      for (const c of conflicts) {
        this.notify({
          notificationKind: 'syncConflict',
          id: `sync-${c.intentId}`,
          level: 'warn',
          message: t('mobileSync.intentFailed'),
          detail: c.reason,
          taskId: c.taskId
        } satisfies ToastPayload)
      }
    })

    // A finished task stays running, keeping its slot, while its Pull Request decides whether it goes straight back
    this.scheduler.setReviewGate(id => this.pullRequestFollowUp.shouldHold(id))
    this.scheduler.on('changed', () => this.emit('changed'))
    // The built-in report waits for custom hooks; its durable request survives app restarts.
    this.hooks.setReportHook(taskId => this.reports.requestReport(taskId))
    // ...and the moment to ask GitHub whether the Pull Request it left is in order
    this.scheduler.on('check', (taskId: string) => { void this.pullRequestFollowUp.onCheck(taskId) })
    this.scheduler.on('status', () => {
      this.mobile.setSchedulerRunning(this.scheduler.status().running)
      this.emit('status', this.scheduler.status())
    })
    this.scheduler.on('notify', (t: ToastPayload) => {
      if (!t.taskId || !repo.isAssistantCheck(this.db, t.taskId)) this.notify(t)
    })
    this.projectReports.on('notify', (t: ToastPayload) => this.notify(t))
    this.reports.on('notify', (t: ToastPayload) => this.notify(t))
    this.pullRequestFollowUp.on('notify', (t: ToastPayload) => this.notify(t))
    this.terminals.on('terminal', (event) => this.emit('terminal', event))
  }


  private notify(payload: ToastPayload): void {
    const task = payload.taskId ? repo.getTask(this.db, payload.taskId) : null
    const projectId = payload.projectId ?? task?.projectId
    const project = projectId ? repo.getProject(this.db, projectId) : null
    this.emit('notify', { ...payload, taskTitle: task?.title, projectId, projectName: project?.name } satisfies ToastPayload)
  }

  /**
   * Resolves once the conversation of the task's latest run is in the index. Asking for it here
   * (first in line) is harmless when the finished-run hook already did; waiting on it is what
   * lets the Pull Request that run opened be read off its receipts.
   */
  private async indexedLatestRun(taskId: string): Promise<void> {
    const task = repo.getTask(this.db, taskId)
    const run = task?.currentRunId ? repo.getRun(this.db, task.currentRunId) : null
    if (!run) return
    const target = sessionReadTarget(this.db, run)
    this.sessions.request(run, target, true)
    await this.sessions.ready(sessionKey(target))
  }

  async bootstrap(): Promise<void> {
    await primeProcessPath()
    await seedIfEmpty(this.db)
    // A CLI supported after this database was made would otherwise never appear in settings
    await offerNewAgents(this.db)
    // After the seed, so a first launch hands QuuuAI the default group like any new project
    if (this.builtInWorkspace) this.projects.ensureBuiltIn(this.builtInWorkspace)
    this.settings.load()
    this.hooks.start()
    void this.runners.start()
    this.scheduler.reconcile()
    this.assistant.start()
    // GitHub App credentials whose supervisor was stopped by force while Quuu was away
    sweepGitHubAuth()
    // Right after startup, re-bind the logs of re-adopted Runs to their actual sessions
    this.attachSessions()
    // Right after startup, settle imports that were running when we last quit
    this.refreshImportedLiveness()
    if (!this.settings.getSettings().autoStartScheduler) this.scheduler.pause()
    this.scheduler.start(this.settings.getSettings().tickIntervalMs)
    this.startImport()
    this.mobile.configure(this.settings.getSettings(), this.scheduler.status().running)
    this.reports.start()
    this.projectReports.start()
    try { this.sessions.sweepRetired() }
    catch (error) { console.warn('Cannot drop retired session pages', error) }
    this.refreshProjections()
    this.pullRequestFollowUp.start()
    this.projectionTimer = setInterval(() => this.refreshProjections(), 5000)
    this.projectionTimer.unref?.()
    this.applyRetention()
    this.retentionTimer = setInterval(() => this.applyRetention(), RETENTION_CHECK_MS)
    this.retentionTimer.unref?.()
  }

  /**
   * Remove what is older than the kept period: conversation pages, the review as each run left
   * it, and replaced report pages. Nothing at all while the period is 0 (the default).
   */
  private applyRetention(): void {
    const days = this.settings.getSettings().retentionDays
    if (!(days > 0)) return
    try { this.sessions.prune(days) }
    catch (error) { console.warn('Cannot remove expired session pages', error) }
    try { this.reports.pruneHistory(days) }
    catch (error) { console.warn('Cannot remove expired report pages', error) }
    this.reviews.prune(days).catch((error: unknown) => { console.warn('Cannot remove expired review history', error) })
  }


  /**
   * Import of sessions launched directly (outside Quuu).
   * Runs in the background so it doesn't block startup, then keeps syncing
   * periodically to reconcile state.
   */
  private startImport(): void {
    if (this.initialImport) clearTimeout(this.initialImport)
    if (this.importTimer) clearInterval(this.importTimer)
    const run = (): void => {
      if (!this.settings.getSettings().importExternalSessions) return
      try {
        // Re-bind first, so sessions we launched ourselves are not picked up as external.
        this.attachSessions()
        const result = this.importer.sync(this.settings.getSettings())
        if (result.createdTasks > 0 || result.updated > 0) this.changed()
      } catch {
        // An import failure must not stop the app
      }
    }
    this.initialImport = setTimeout(run, 1200)
    this.initialImport.unref?.()
    this.importTimer = setInterval(run, IMPORT_SYNC_MS)
    this.importTimer.unref?.()

    if (this.livenessTimer) clearInterval(this.livenessTimer)
    // Even with import turned off, sessions stuck as running still need to be closed out, so this runs regardless of the setting
    this.livenessTimer = setInterval(() => {
      this.attachSessions()
      this.refreshImportedLiveness()
    }, LIVENESS_TICK_MS)
    this.livenessTimer.unref?.()
  }


  /**
   * Re-bind running Runs to the session logs actually being written.
   *
   * If the agent definition doesn't pass `--session-id`, the CLI picks its own
   * session ID. Left alone, the run ends with the conversation never visible,
   * and the import sync registers our own session again as external.
   */
  private attachSessions(): void {
    try {
      if (attachActiveRuns(this.db) > 0) this.changed()
    } catch {
      // Failing to re-bind must not stop the app
    }
  }


  /** Check whether running imports have finished. Cheap, so only this runs on the short cycle. */
  private refreshImportedLiveness(): void {
    try {
      if (this.importer.refreshRunning() > 0) this.changed()
    } catch {
      // Failing to check must not stop the app
    }
  }


  /** Run an import manually. */
  syncImport(): ReturnType<SessionImporter['sync']> {
    const result = this.importer.sync(this.settings.getSettings())
    this.changed()
    return result
  }


  shutdown(): void {
    this.assistant.stop()
    this.pullRequestFollowUp.stop()
    if (this.projectionTimer) clearInterval(this.projectionTimer)
    if (this.retentionTimer) clearInterval(this.retentionTimer)
    this.sessions.stop()
    this.reviews.stop()
    this.hooks.stop()
    this.reports.stop()
    this.projectReports.stop()
    if (this.initialImport) clearTimeout(this.initialImport)
    if (this.importTimer) clearInterval(this.importTimer)
    if (this.livenessTimer) clearInterval(this.livenessTimer)
    this.mobile.shutdown()
    this.scheduler.stop()
    for (const view of this.sessionViews) view.closeSession()
    this.sessionViews.clear()
    this.terminals.shutdown()
    this.runners.stop()
    this.runner.shutdown()
  }


  // -------------------------------------------------------------------------
  // Snapshot
  // -------------------------------------------------------------------------

  snapshot(): AppSnapshot {
    const tasks = repo.listTasks(this.db, false, false)
    const runs = repo.listLatestRunPerTask(this.db).filter(run => !repo.isAssistantCheck(this.db, run.taskId))
    const agents = repo.listAgents(this.db)
    return {
      ...sessionOptions(tasks, runs, agents),
      assistant: this.assistant.state(),
      projects: repo.listProjects(this.db),
      projectRecentRunCounts: repo.recentRunCountsByProject(this.db),
      tasks,
      rules: repo.listTaskRules(this.db),
      agents,
      groups: repo.listGroups(this.db),
      runs,
      scheduler: this.scheduler.status()
    }
  }


  queuePositions(): Map<string, number> {
    return repo.queuePositions(this.db)
  }


  // -------------------------------------------------------------------------

  /** State of iPhone sync (shown on the settings pane). */
  mobileSyncStatus(): MobileSyncStatus {
    return this.mobile.status()
  }


  /** Sync now (button on the settings pane). Runs one round trip of export and import. */
  async syncMobileNow(): Promise<MobileSyncStatus> {
    await this.mobile.importNow()
    this.mobile.exportNow()
    return this.mobile.status()
  }


  /**
   * Tell sync where the UI distributed to the iPhone lives (once at startup).
   * The location logic belongs to the side that knows Electron (`index.ts`).
   */
  /**
   * Where the built-in QuuuAI project runs (`projects/builtIn.ts`). Set by the app before
   * `bootstrap`; left unset (tests, fixtures) the project is not created.
   */
  setBuiltInWorkspace(dir: string): void {
    this.builtInWorkspace = dir
  }

  /** The app menu's commands (version, updates), handed in by the Electron entry. */
  setAppControls(controls: AppControls): void {
    this.controls = controls
  }

  appControls(): AppControls {
    if (!this.controls) throw new Error('App information is available only in the desktop app')
    return this.controls
  }

  setMobileWebRoot(root: string | null): void {
    this.mobile.setWebRoot(root)
  }


  private changed(): void {
    afterCommit(this.db, () => {
      this.emit('changed')
      // Pass state changes to the iPhone. Actual writes happen batched (debounced)
      this.mobile.notifyChanged()
    })
  }
  createSessionView(): SessionView {
    const view = new SessionView(this.db, this.sessions)
    this.sessionViews.add(view)
    return view
  }
  releaseSessionView(view: SessionView): void {
    view.closeSession()
    this.sessionViews.delete(view)
  }

  private refreshProjections(): void {
    const runs = repo.listRunsForProjection(this.db)
    const probeHistory = Date.now() >= this.historicalProbeAt
    if (probeHistory) this.historicalProbeAt = Date.now() + 60_000
    // Prioritize current work; historical logs are queued once and then only stat-ed.
    runs.sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || b.startedAt.localeCompare(a.startedAt))
    for (const run of runs) {
      const signature = `${run.status}:${run.sessionId}:${run.sessionLogPath}`
      if (!probeHistory && run.status !== 'running' && this.projectionRuns.get(run.id) === signature) continue
      this.projectionRuns.set(run.id, signature)
      try { this.sessions.request(run) }
      catch (error) { console.warn('Cannot schedule session indexing', error) }
    }
  }
}
