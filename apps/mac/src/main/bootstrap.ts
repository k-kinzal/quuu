import { EventEmitter } from 'node:events'
import { AgentOperations } from './agents/operations.js'
import { sessionOptions } from './agents/sessionOptions.js'
import { AutomationOperations } from './automation/operations.js'
import type { Db } from './db/database.js'
import { afterCommit, openDatabase } from './db/database.js'
import * as repo from './db/repo.js'
import { Runner } from './execution/runner.js'
import { Scheduler } from './execution/scheduler.js'
import { t } from './i18n/index.js'
import { SessionImporter } from './import/importer.js'
import { MobileSync } from './mobile-sync/mobileSync.js'
import { primeProcessPath } from './platform/shellEnv.js'
import { ProjectOperations } from './projects/operations.js'
import { ReportOperations } from './report/operations.js'
import { WorkspaceOperations } from './projects/workspace.js'
import { ReviewOperations } from './review/operations.js'
import { ReviewService } from './review/service.js'
import { offerNewAgents, seedIfEmpty } from './seed.js'
import { attachActiveRuns } from './session/sessionAttach.js'
import { SessionView } from './session/view.js'
import { SessionIndex } from './session/index.js'
import { recordSessionEvidence } from './review/evidence.js'
import { SettingsOperations } from './settings/operations.js'
import type { AppSettings } from './settings/types.js'
import type { AppSnapshot, MobileSyncStatus, ToastPayload } from './snapshot.js'
import { TaskOperations } from './tasks/operations.js'
import { TerminalOperations } from './terminal/operations.js'
import { TerminalService } from './terminal/service.js'

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
export class QuuuApp extends EventEmitter {
  readonly db: Db
  readonly runner: Runner
  readonly scheduler: Scheduler
  readonly importer: SessionImporter
  readonly mobile: MobileSync
  readonly reviews: ReviewOperations
  readonly reports: ReportOperations
  readonly terminal: TerminalOperations
  readonly review: ReviewService
  readonly terminals: TerminalService
  private initialImport: NodeJS.Timeout | null = null
  private importTimer: NodeJS.Timeout | null = null
  private livenessTimer: NodeJS.Timeout | null = null
  readonly tasks: TaskOperations
  readonly projects: ProjectOperations
  readonly automation: AutomationOperations
  readonly agents: AgentOperations
  readonly workspace: WorkspaceOperations
  readonly settings: SettingsOperations
  private sessionViews = new Set<SessionView>()
  readonly sessions: SessionIndex
  private projectionTimer: NodeJS.Timeout | null = null
  private projectionRuns = new Map<string, string>()
  private historicalProbeAt = 0
  constructor(dbPath?: string) {
    super()
    this.db = openDatabase(dbPath)
    this.runner = new Runner(this.db)
    this.scheduler = new Scheduler(this.db, this.runner)
    this.importer = new SessionImporter(this.db)
    this.review = new ReviewService()
    this.terminals = new TerminalService()
    this.settings = new SettingsOperations(this.db)
    this.tasks = new TaskOperations(this.db, () => this.changed(), () => afterCommit(this.db, () => this.scheduler.kick()), (id) => this.scheduler.runNow(id), (id) => this.runner.cancel(id), (toast) => this.emit('notify', toast))
    this.projects = new ProjectOperations(this.db, () => this.changed(), () => afterCommit(this.db, () => this.scheduler.kick()))
    this.automation = new AutomationOperations(this.db, () => this.changed(), () => afterCommit(this.db, () => this.scheduler.kick()))
    this.agents = new AgentOperations(this.db, () => this.changed(), () => afterCommit(this.db, () => this.scheduler.kick()))
    this.workspace = new WorkspaceOperations(this.db, () => this.settings.getSettings())
    this.reviews = new ReviewOperations(this.db, () => this.settings.getSettings(), this.review, id => this.workspace.workbenchPlace(id))
    this.reports = new ReportOperations(this.db, () => this.settings.getSettings(), id => this.workspace.workbenchPlace(id))
    this.sessions = new SessionIndex(this.db, (run, messages) => recordSessionEvidence(this.db, run.taskId, messages))
    this.sessions.on('indexed', (_key: string, taskId: string) => this.reviews.requestRefresh(taskId))
    this.terminal = new TerminalOperations(this.terminals, id => this.workspace.workbenchPlace(id))
    this.settings.on('changed', (settings: AppSettings, patch: Partial<AppSettings>) => {
      if (patch.tickIntervalMs !== undefined) this.scheduler.start(settings.tickIntervalMs)
      if (patch.importExternalSessions !== undefined || patch.importHistoryDays !== undefined || patch.importCreateProjects !== undefined) this.startImport()
      if (patch.mobileSyncEnabled !== undefined) this.mobile.configure(settings, this.scheduler.status().running)
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
        this.emit('notify', {
          id: `sync-${c.intentId}`,
          level: 'warn',
          message: t('mobileSync.intentFailed'),
          detail: c.reason,
          taskId: c.taskId
        } satisfies ToastPayload)
      }
    })

    this.scheduler.on('changed', () => this.emit('changed'))
    // Something is now waiting to be read, which is the moment a report is worth writing
    this.scheduler.on('review', (taskId: string) => { void this.reports.requestReport(taskId) })
    this.scheduler.on('status', () => {
      this.mobile.setSchedulerRunning(this.scheduler.status().running)
      this.emit('status', this.scheduler.status())
    })
    this.scheduler.on('notify', (t: ToastPayload) => this.emit('notify', t))
    this.reports.on('notify', (t: ToastPayload) => this.emit('notify', t))
    this.terminals.on('terminal', (event) => this.emit('terminal', event))
  }


  async bootstrap(): Promise<void> {
    await primeProcessPath()
    await seedIfEmpty(this.db)
    // A CLI supported after this database was made would otherwise never appear in settings
    await offerNewAgents(this.db)
    this.settings.load()
    this.scheduler.reconcile()
    // Right after startup, re-bind the logs of re-adopted Runs to their actual sessions
    this.attachSessions()
    // Right after startup, settle imports that were running when we last quit
    this.refreshImportedLiveness()
    if (!this.settings.getSettings().autoStartScheduler) this.scheduler.pause()
    this.scheduler.start(this.settings.getSettings().tickIntervalMs)
    this.startImport()
    this.mobile.configure(this.settings.getSettings(), this.scheduler.status().running)
    this.reports.start()
    this.refreshProjections()
    this.projectionTimer = setInterval(() => this.refreshProjections(), 5000)
    this.projectionTimer.unref?.()
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
    if (this.projectionTimer) clearInterval(this.projectionTimer)
    this.sessions.stop()
    this.reviews.stop()
    this.reports.stop()
    if (this.initialImport) clearTimeout(this.initialImport)
    if (this.importTimer) clearInterval(this.importTimer)
    if (this.livenessTimer) clearInterval(this.livenessTimer)
    this.mobile.shutdown()
    this.scheduler.stop()
    for (const view of this.sessionViews) view.closeSession()
    this.sessionViews.clear()
    this.terminals.shutdown()
    this.runner.shutdown()
  }


  // -------------------------------------------------------------------------
  // Snapshot
  // -------------------------------------------------------------------------

  snapshot(): AppSnapshot {
    const tasks = repo.listTasks(this.db)
    const runs = repo.listLatestRunPerTask(this.db)
    const agents = repo.listAgents(this.db)
    return {
      ...sessionOptions(tasks, runs, agents),
      projects: repo.listProjects(this.db),
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
  syncMobileNow(): MobileSyncStatus {
    this.mobile.importNow()
    this.mobile.exportNow()
    return this.mobile.status()
  }


  /**
   * Tell sync where the UI distributed to the iPhone lives (once at startup).
   * The location logic belongs to the side that knows Electron (`index.ts`).
   */
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
