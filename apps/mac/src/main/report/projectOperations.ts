import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { adapterFor } from '../agent-adapters/registry.js'
import { reportDir } from '../appPaths.js'
import type { Db } from '../db/database.js'
import { inTransaction } from '../db/database.js'
import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'
import { isProcessAlive, killProcessGroup, readExitCode, readLogTail } from '../platform/runProcess.js'
import { withPath } from '../platform/processEnv.js'
import { resolveLoginPath } from '../platform/shellEnv.js'
import type { AppSettings } from '../settings/types.js'
import type { ToastPayload } from '../snapshot.js'
import { newId, newSessionId, nowIso, truncate } from '../util.js'
import { writeReportAssets } from './assets.js'
import { settleReport, spawnReport } from './generator.js'
import { projectReportPrompt } from './prompt.js'
import { projectRevision } from './projectRevision.js'
import { reportHistory } from './history.js'
import type { ProjectReport, ReportHistoryEntry } from './types.js'
import { chooseWriter } from './writer.js'

const TIMEOUT_MS = 20 * 60_000

/** The Mac's calendar day, matching the app's other daily schedules. */
export function projectReportDue(checkedAt: string | undefined, now = new Date()): boolean {
  return !checkedAt || new Date(checkedAt).toDateString() !== now.toDateString()
}

/** Daily project assessments share the report writer, assets and detached process lifecycle. */
export class ProjectReportOperations extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private stopped = false
  private checking = false
  private starting = new Set<string>()
  private nextCheck = 0

  constructor(private db: Db, private getSettings: () => AppSettings) { super() }

  start(): void {
    this.stopped = false
    this.settle()
    void this.checkDaily()
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => {
      this.settle()
      if (Date.now() >= this.nextCheck) void this.checkDaily()
    }, 2000)
    this.timer.unref?.()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Every assessment the project has had, newest first, the one shown now marked. */
  history(projectId: string): ReportHistoryEntry[] {
    return reportHistory(this.db, { projectId }, repo.getProjectReport(this.db, projectId)?.path ?? '')
  }

  /** The page to show: an earlier one by its history entry, or the current one. */
  page(projectId: string, historyId?: string): string {
    if (historyId === undefined) return repo.getProjectReport(this.db, projectId)?.path ?? ''
    const entry = repo.getReportHistory(this.db, { projectId }, historyId)
    if (!entry) throw new Error(t('report.historyNotFound'))
    return entry.path
  }

  report(projectId: string): ProjectReport | null {
    const row = repo.getProjectReport(this.db, projectId)
    if (!row) return null
    const { status, revision, path, logPath, error, startedAt, endedAt } = row
    return { projectId, status, revision, path, logPath, error, startedAt, endedAt }
  }

  /** Read-only checks run at most once a day per project; unavailable writers are retried later. */
  async checkDaily(): Promise<void> {
    if (this.stopped || this.checking) return
    this.checking = true
    this.nextCheck = Date.now() + 60_000
    try {
      if (!this.getSettings().reportEnabled) return
      for (const project of repo.listProjects(this.db)) {
        if (this.stopped) break
        if (!project.reportEnabled || project.deletedAt) continue
        try { await this.begin(project.id, false) }
        catch (error) { console.warn('Project report did not start', project.id, error) }
      }
    } finally { this.checking = false }
  }

  async generate(projectId: string): Promise<{ ok: boolean; reason?: string }> {
    try {
      await this.begin(projectId, true)
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  private async begin(projectId: string, requested: boolean): Promise<void> {
    const settings = this.getSettings()
    if (!settings.reportEnabled) throw new Error(t('report.turnedOff'))
    const project = repo.getProject(this.db, projectId)
    if (!project || project.deletedAt) throw new Error(t('tasks.projectNotFound'))
    if (!project.reportEnabled) throw new Error(t('report.projectTurnedOff'))
    this.settle()
    const previous = repo.getProjectReport(this.db, projectId)
    if (previous?.status === 'generating' || this.starting.has(projectId)) return
    if (!requested && !projectReportDue(previous?.checkedAt)) return
    let writer = chooseWriter(this.db, settings)
    if (!writer.ok) {
      if (!requested) return
      throw new Error(t(writer.reason === 'cooling' ? 'report.allCooling' : 'report.noAgent'))
    }
    this.starting.add(projectId)
    try {
      if (!existsSync(project.path)) throw new Error(t('report.dirMissing', { path: project.path }))
      const revision = await projectRevision(project.path, settings.projectReportInstructions)
      if (this.stopped) return
      const current = repo.getProject(this.db, projectId)
      const latest = this.getSettings()
      // Settings or the project may have changed while Git was being read.
      if (!current || current.deletedAt || !current.reportEnabled || current.path !== project.path ||
        !latest.reportEnabled || latest.projectReportInstructions !== settings.projectReportInstructions) return
      if (!requested && previous?.revision === revision && previous.path && existsSync(previous.path)) {
        repo.markProjectReportChecked(this.db, projectId, nowIso())
        return
      }
      const path = await resolveLoginPath()
      if (this.stopped) return
      const beforeLaunch = repo.getProject(this.db, projectId)
      const launchSettings = this.getSettings()
      if (!beforeLaunch || beforeLaunch.deletedAt || !beforeLaunch.reportEnabled || beforeLaunch.path !== project.path ||
        !launchSettings.reportEnabled || launchSettings.projectReportInstructions !== settings.projectReportInstructions) return
      writer = chooseWriter(this.db, launchSettings)
      if (!writer.ok) {
        if (!requested) return
        throw new Error(t(writer.reason === 'cooling' ? 'report.allCooling' : 'report.noAgent'))
      }
      const agent = writer.value.agent
      const id = newId('rpt')
      const dir = reportDir(projectId)
      writeReportAssets()
      const page = join(dir, `${id}.html`)
      const log = join(dir, `${id}.log`)
      const exitPath = join(dir, `${id}.exit`)
      const prompt = projectReportPrompt({ cwd: project.path, title: project.name, page, instructions: settings.projectReportInstructions })
      const { args } = adapterFor(agent.logAdapter).invoke({
        command: agent.command, template: agent.argsTemplate,
        vars: { prompt, title: project.name, sessionId: newSessionId(), projectPath: project.path,
          projectName: project.name, taskId: '', runId: id }
      })
      const startedAt = nowIso()
      const pid = spawnReport({ command: agent.command, args, cwd: project.path, log, exitPath,
        env: { ...withPath({ ...process.env, ...agent.env }, path), ELECTRON_RUN_AS_NODE: undefined,
          NODE_OPTIONS: undefined, QUUU_TASK_ID: undefined, QUUU_EXIT_FILE: exitPath } })
      if (writer.value.groupId) repo.advanceGroupRotation(this.db, writer.value.groupId, agent.id)
      repo.openReportSession(this.db, project.path, startedAt, new Date(Date.parse(startedAt) + TIMEOUT_MS).toISOString())
      repo.saveProjectReport(this.db, {
        projectId, status: 'generating', cwd: project.path, revision: previous?.revision ?? '',
        pendingRevision: revision, checkedAt: startedAt, path: previous?.path ?? '', pending: page,
        logPath: log, exitPath, error: '', pid, startedAt, endedAt: null
      })
    } finally { this.starting.delete(projectId) }
  }

  /** Settle from durable evidence, including work completed while the app was closed. */
  settle(): void {
    if (this.stopped) return
    for (const row of repo.listGeneratingProjectReports(this.db)) {
      const timedOut = Date.now() - Date.parse(row.startedAt) > TIMEOUT_MS
      const result = settleReport({ alive: row.pid !== null && isProcessAlive(row.pid),
        exitCode: readExitCode(row.exitPath), pageExists: !!row.pending && existsSync(row.pending), timedOut })
      if (!result) continue
      if (timedOut && row.pid !== null) killProcessGroup(row.pid, 'SIGTERM')
      const ready = result.status === 'ready'
      const error = ready ? (result.reason === 'exit' ? t('report.oddExit', { code: result.exitCode }) : '')
        : readLogTail(row.logPath, 600).trim() || (timedOut
          ? t('report.timedOut', { minutes: TIMEOUT_MS / 60_000 }) : t('report.noPage'))
      const endedAt = nowIso()
      repo.closeReportSession(this.db, row.cwd, row.startedAt, endedAt)
      inTransaction(this.db, () => {
        repo.saveProjectReport(this.db, { ...row, status: result.status,
          revision: ready ? row.pendingRevision : row.revision, pendingRevision: '',
          path: ready ? row.pending : row.path, pending: '', error, endedAt, pid: null })
        // The page it replaces stays on disk and in the history; only retention removes one.
        if (ready) repo.addReportHistory(this.db, { projectId: row.projectId }, { path: row.pending, revision: row.pendingRevision, generatedAt: endedAt })
      })
      if (!ready) this.emit('notify', {
        id: `project-report-${row.projectId}`, level: 'error', notificationKind: 'reportFailure', projectId: row.projectId,
        message: t('report.failedToast', { title: repo.getProject(this.db, row.projectId)?.name ?? '' }),
        detail: truncate(error, 400)
      } satisfies ToastPayload)
    }
  }
}
