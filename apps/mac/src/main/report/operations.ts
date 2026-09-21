import { EventEmitter } from 'node:events'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { reportDir, reportRoot } from '../appPaths.js'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { expandArgs } from '../execution/templating.js'
import { t } from '../i18n/index.js'
import { isProcessAlive, killProcessGroup, readExitCode, readLogTail } from '../platform/runProcess.js'
import { resolveLoginPath } from '../platform/shellEnv.js'
import type { Project } from '../projects/types.js'
import { changesBetween, commitsSince, inferReviewBaseline, readCommits, snapshotWorktree } from '../review/git.js'
import type { ReviewChange, ReviewCommit } from '../review/types.js'
import type { AppSettings } from '../settings/types.js'
import type { ToastPayload } from '../snapshot.js'
import { newId, newSessionId, nowIso, truncate } from '../util.js'
import { settleReport, spawnReport } from './generator.js'
import { REPORT_ASSETS, writeReportAssets } from './assets.js'
import type { ReportRequest } from './prompt.js'
import { reportPrompt } from './prompt.js'
import type { StoredReport, TaskReport } from './types.js'
import type { ReportWriter } from './writer.js'
import { chooseWriter } from './writer.js'

/** How often a running generation is looked at. It stats two files, so it costs nothing. */
const POLL_MS = 2000

/**
 * How long a generation may run before it is taken down.
 *
 * A report is a side artifact: one that never ends would sit as "generating" forever, and after
 * a reboot a recycled pid can look alive indefinitely. The bound is what makes the state
 * eventually true again either way.
 */
const TIMEOUT_MS = 20 * 60 * 1000

/**
 * Generating the change report for a task.
 *
 * **It never touches task state.** A report is an aid to the person deciding, not a step in the
 * work: it cannot move a task to done, cannot fail one, and a generation that goes wrong is
 * allowed to end as "no report" without anybody being asked (the same rule the normal path
 * follows). It also holds no execution slot — the queue must not wait on a report.
 */
export class ReportOperations extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private stopped = false
  private starting = new Set<string>()

  constructor(
    private db: Db,
    private getSettings: () => AppSettings,
    private place: (taskId: string) => { dir: string; project: Project }
  ) { super() }

  /** Begin settling generations, including any that outlived the last launch. */
  start(): void {
    this.stopped = false
    this.sweep()
    this.settle()
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => this.settle(), POLL_MS)
    this.timer.unref?.()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  report(taskId: string): TaskReport | null {
    const stored = repo.getTaskReport(this.db, taskId)
    return stored ? visible(stored) : null
  }

  /**
   * A task reached review.
   *
   * Automatic, so it stays quiet: a project with reports turned off, or a setting not filled in
   * yet, is not a failure anybody needs to hear about at the moment a task lands.
   *
   * **Only when there is something new to describe.** A task comes back to review as often as
   * it is sent back, and a round that changed nothing in the worktree — a question answered, a
   * run that gave up — would otherwise replace a report with the same report, at the cost of an
   * agent run. Asked for by hand (`generate`) is different: the person pressing "write again"
   * has already decided one is worth having.
   *
   * Resolves once the decision is made and never rejects; what stopped it goes to the log.
   */
  async requestReport(taskId: string): Promise<void> {
    try {
      await this.begin(taskId, 'automatic')
    } catch (error) {
      console.warn('Report generation did not start', taskId, error)
    }
  }

  /** Asked for by hand, from the report surface. The reason for not starting is returned. */
  async generate(taskId: string): Promise<{ ok: boolean; reason?: string }> {
    try {
      await this.begin(taskId, 'requested')
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * Who writes this task's report, or why nobody does.
   *
   * Who is decided here rather than read off the setting, because the setting may name a group,
   * and which member takes it depends on what the rest of them are doing right now
   * (`report/writer.ts`).
   */
  private writer(taskId: string): { ok: true; value: ReportWriter } | { ok: false; reason: string } {
    const settings = this.getSettings()
    if (!settings.reportEnabled) return { ok: false, reason: t('report.turnedOff') }
    const chosen = chooseWriter(this.db, settings)
    if (!chosen.ok) {
      return { ok: false, reason: chosen.reason === 'cooling' ? t('report.allCooling') : t('report.noAgent') }
    }
    if (!repo.getTask(this.db, taskId)) return { ok: false, reason: t('tasks.notFound') }
    return chosen
  }

  /**
   * `automatic` writes only for a worktree no ready report describes yet; `requested` always
   * writes. Returns without starting when there is nothing to do.
   */
  private async begin(taskId: string, trigger: 'automatic' | 'requested'): Promise<void> {
    const writer = this.writer(taskId)
    if (!writer.ok) throw new Error(writer.reason)
    const settings = this.getSettings()
    const agent = writer.value.agent
    const place = this.place(taskId)
    if (!place.project.reportEnabled) throw new Error(t('report.projectTurnedOff'))
    if (!existsSync(place.dir)) throw new Error(t('report.dirMissing', { path: place.dir }))

    // Resolve whatever is outstanding first, so "the previous page" below is the settled one and
    // a generator that already finished does not get its page orphaned by the row being replaced
    this.settle()
    const running = repo.getTaskReport(this.db, taskId)
    if (running?.status === 'generating' && running.pid !== null && isProcessAlive(running.pid)) return
    // Two review transitions can land within the same await, and a second generator would write
    // over the first one's page mid-flight.
    if (this.starting.has(taskId)) return
    this.starting.add(taskId)
    try {
      const task = repo.getTask(this.db, taskId)
      if (!task) throw new Error(t('tasks.notFound'))
      const worktree = await snapshotWorktree(place.dir)
      const previous = repo.getTaskReport(this.db, taskId)
      if (trigger === 'automatic' && alreadyReported(previous, worktree?.tree)) return
      const [path, material] = await Promise.all([resolveLoginPath(), this.material(taskId, place.dir, worktree)])
      if (this.stopped || !repo.getTask(this.db, taskId)) return

      const id = newId('rpt')
      const dir = reportDir(taskId)
      /*
       * The stylesheet, the drawing library and its setup, ready beside the reports. Refreshed
       * here rather than at startup so a report asked for right after an update opens in the
       * design that shipped with it.
       */
      writeReportAssets()
      const page = join(dir, `${id}.html`)
      const log = join(dir, `${id}.log`)
      const exitPath = join(dir, `${id}.exit`)
      const prompt = reportPrompt({
        cwd: place.dir,
        title: task.title,
        prompt: task.prompt || task.title,
        ...material,
        page,
        instructions: settings.reportInstructions
      })
      const args = expandArgs(agent.argsTemplate, {
        prompt,
        title: task.title,
        sessionId: newSessionId(),
        projectPath: place.project.path,
        projectName: place.project.name,
        taskId,
        runId: id
      })
      // Taken before the launch, so the window starts no later than the session the CLI opens in it
      const startedAt = nowIso()
      const pid = spawnReport({
        command: agent.command,
        args,
        cwd: place.dir,
        log,
        exitPath,
        env: {
          ...process.env,
          ...agent.env,
          PATH: path,
          // Do not leak to the child that it was launched from Electron
          ELECTRON_RUN_AS_NODE: undefined,
          NODE_OPTIONS: undefined,
          QUUU_TASK_ID: taskId,
          QUUU_EXIT_FILE: exitPath
        }
      })
      /*
       * Put on record that one of ours is working here, kept where the next report cannot erase it.
       *
       * The row below is the task's current report and is replaced the next time one is written;
       * this is the fact import needs long after that - otherwise regenerating a report hands the
       * previous generator's session to import, which reads it as work somebody did.
       */
      /*
       * A group's rotation counts this launch. The report went to the group, not to the member
       * that happened to be first, so the next one to be handed anything is somebody else.
       */
      if (writer.value.groupId) repo.advanceGroupRotation(this.db, writer.value.groupId, agent.id)
      repo.openReportSession(this.db, place.dir, startedAt, isoAfter(startedAt, TIMEOUT_MS))
      repo.saveTaskReport(this.db, {
        taskId,
        status: 'generating',
        cwd: place.dir,
        revision: worktree?.tree ?? '',
        // Whatever was readable before stays on screen until the new page exists
        path: previous?.path ?? '',
        logPath: log,
        error: '',
        startedAt,
        endedAt: null,
        pid,
        pending: page,
        exitPath
      })
    } finally {
      this.starting.delete(taskId)
    }
  }

  /**
   * What the work left behind, as facts rather than instructions to go and find them.
   *
   * Review refreshes asynchronously and can still describe the previous run. Recompute the
   * cumulative Git material against the very tree used for this report's revision, keeping the
   * first run's baseline. Recorded commits and PRs supplement it across branch changes.
   */
  private async material(
    taskId: string,
    cwd: string,
    worktree: Awaited<ReturnType<typeof snapshotWorktree>>
  ): Promise<Pick<ReportRequest, 'changes' | 'commits' | 'pullRequests' | 'runs' | 'revision'>> {
    const saved = repo.getReviewSnapshot(this.db, taskId)?.snapshot
    const snapshot = saved?.cwd === cwd ? saved : null
    const evidence = repo.reviewEvidence(this.db, taskId)
    const runs = repo.listRunsByTask(this.db, taskId).reverse()
    const savedBase = repo.getTaskReviewBase(this.db, taskId)
    const baseline = savedBase?.cwd === cwd && savedBase.baseTree
      ? savedBase
      : worktree && runs[0] ? await inferReviewBaseline(cwd, runs[0].startedAt) : null
    const revision = baseline?.baseTree && worktree
      ? { base: baseline.baseTree, head: worktree.tree, inferred: baseline !== savedBase }
      : null
    const [changes, commits]: [ReviewChange[], ReviewCommit[]] = await Promise.all([
      revision ? changesBetween(cwd, revision.base, revision.head) : [],
      baseline?.baseTree && worktree?.head ? commitsSince(cwd, baseline.baseHead, worktree.head) : []
    ])
    const unseen = [...(snapshot?.commits ?? []).map(commit => commit.sha), ...evidence.commits].filter(
      sha => !commits.some(known => known.sha.startsWith(sha) || sha.startsWith(known.sha))
    )
    /*
     * Read through the repository the report is being written in, rather than handed over as
     * written down. A receipt is a string a CLI printed: a commit made in another checkout, and
     * the odd `[Run 31947246760]` that looks like one, both survive as far as here. Named to a
     * writer standing in this repository they are a line it cannot look up - or, worse, a short
     * id that resolves to a different commit - and the page ends up describing other work.
     */
    for (const commit of await readCommits(cwd, unseen)) {
      commits.push(commit)
    }
    const pullRequests = [
      ...new Set([...(snapshot?.pullRequests ?? []).map((pr) => pr.url), ...evidence.pullRequests])
    ]
    return {
      revision,
      changes: changes.map((file) => ({
        path: file.previousPath ? `${file.previousPath} -> ${file.path}` : file.path,
        mark: file.change === 'added' || file.change === 'untracked'
          ? '+'
          : file.change === 'deleted'
            ? '-'
            : '+-'
      })),
      commits: commits.sort((a, b) => b.committedAt.localeCompare(a.committedAt))
        .map(commit => `${commit.shortSha} ${commit.subject}`),
      pullRequests,
      runs: runs.map(({ id, kind, status, cwd, startedAt, endedAt, promptPreview, sessionId, sessionLogPath, stdoutLogPath }) =>
        ({ id, kind, status, cwd, startedAt, endedAt, promptPreview, sessionId, sessionLogPath, stdoutLogPath }))
    }
  }

  /**
   * Turn finished generations into their result.
   *
   * Restart-safe by construction: it reads the pid, the exit file and the page rather than
   * listening for an event, so a generation that ended while Quuu was gone settles the same way
   * as one that ends while it is running.
   */
  settle(): void {
    if (this.stopped) return
    for (const row of repo.listGeneratingReports(this.db)) {
      const timedOut = Date.now() - Date.parse(row.startedAt) > TIMEOUT_MS
      const result = settleReport({
        alive: row.pid !== null && isProcessAlive(row.pid),
        exitCode: readExitCode(row.exitPath),
        pageExists: row.pending.length > 0 && existsSync(row.pending),
        timedOut
      })
      if (!result) continue
      // Take the whole group down, so anything the generator started goes with it
      if (timedOut && row.pid !== null) killProcessGroup(row.pid, 'SIGTERM')

      const ready = result.status === 'ready'
      const superseded = ready && row.path.length > 0 && row.path !== row.pending ? row.path : null
      /*
       * What the generator said, not what we can infer from an exit code. "It ended with 1" sends
       * a person to the log; "you must acknowledge the model's data policy" is the answer itself.
       */
      const said = ready ? '' : readLogTail(row.logPath, 600).trim()
      const why = said || reason(result.reason, result.exitCode)
      const endedAt = nowIso()
      // Nothing of ours is working there any more, so stop hiding what starts there next
      repo.closeReportSession(this.db, row.cwd, row.startedAt, endedAt)
      repo.saveTaskReport(this.db, {
        ...row,
        status: result.status,
        path: ready ? row.pending : row.path,
        error: ready ? reason(result.reason, result.exitCode) : why,
        endedAt,
        pid: null,
        pending: ''
      })
      if (superseded) rmSync(superseded, { force: true })
      if (!ready) this.told(row.taskId, why)
    }
  }

  /**
   * Say a generation failed, through the channel every other failure uses.
   *
   * **A failure is an event.** Left as a label on a row it becomes something a person has to
   * notice and then go and ask about, and the reason — the part that says what to do — ends up
   * in a tooltip nobody opens.
   */
  private told(taskId: string, detail: string): void {
    const task = repo.getTask(this.db, taskId)
    this.emit('notify', {
      id: `report-${taskId}`,
      level: 'error',
      message: t('report.failedToast', { title: truncate(task?.title ?? '', 50) }),
      detail: truncate(detail, 400),
      taskId
    } satisfies ToastPayload)
  }

  /**
   * Drop report directories whose task is gone. Deleting a task should not leave pages behind.
   *
   * **The shared assets are not one of them.** They sit at the same level and belong to no task,
   * so a sweep that only asks "is this a task?" takes the stylesheet and the drawing library with
   * it — and every report on the machine opens undressed and undrawn. That actually happened.
   */
  private sweep(): void {
    const root = reportRoot()
    if (!existsSync(root)) return
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === REPORT_ASSETS) continue
        if (repo.getTask(this.db, entry.name)) continue
        rmSync(join(root, entry.name), { recursive: true, force: true })
      }
    } catch (error) {
      // Leftover files are not worth failing a launch over
      console.warn('Could not sweep reports', error)
    }
  }
}

/**
 * Whether the worktree is the one the last report already describes.
 *
 * A report is defined by the tree it was written for (`TaskReport.revision`), so the same tree
 * would get the same report. Only a page that exists counts: a generation that failed for this
 * tree is worth trying again, and a tree Git could not read (empty) matches nothing, because
 * "unknown" must not be mistaken for "unchanged".
 */
export function alreadyReported(previous: StoredReport | null, tree: string | null | undefined): boolean {
  return (
    previous !== null &&
    previous.status === 'ready' &&
    previous.revision.length > 0 &&
    previous.revision === tree
  )
}

/** The same instant, `ms` later. */
function isoAfter(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString()
}

/** What a report failure or oddity says. Empty when there is nothing to add. */
function reason(kind: 'timeout' | 'exit' | 'no-page' | '', exitCode: number | null): string {
  if (kind === 'timeout') return t('report.timedOut', { minutes: Math.round(TIMEOUT_MS / 60000) })
  if (kind === 'exit') return t('report.oddExit', { code: exitCode ?? 0 })
  if (kind === 'no-page') {
    return exitCode === null || exitCode === 0 ? t('report.noPage') : t('report.failedExit', { code: exitCode })
  }
  return ''
}

function visible(stored: StoredReport): TaskReport {
  return {
    taskId: stored.taskId,
    status: stored.status,
    revision: stored.revision,
    path: stored.path,
    logPath: stored.logPath,
    error: stored.error,
    startedAt: stored.startedAt,
    endedAt: stored.endedAt
  }
}
