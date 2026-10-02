import type { RunnerOperations } from '../runners/operations.js'
import { EventEmitter } from 'node:events'
import type { Db } from '../db/database.js'
import { REVIEW_HISTORY_SINCE } from '../db/database.js'
import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'
import type { Project } from '../projects/types.js'
import type { AppSettings } from '../settings/types.js'
import type { ReviewService } from './service.js'
import { git } from './command.js'
import type { ProjectFiles, ProjectPullRequest, ReviewActionResult, ReviewCommentInput, ReviewFile, ReviewFileRequest, ReviewHistoryPoint, ReviewPullRequest, ReviewSnapshot } from './types.js'

/**
 * How often a Pull Request whose checks are still running is looked at again.
 *
 * CI is what the person is waiting on once the agent has pushed, and nothing on this machine
 * says when it ends. A minute is the grain GitHub's own page refreshes at; one `gh pr view`
 * per open Pull Request per minute is nothing against the rate limit.
 */
export const PULL_REQUEST_WATCH_MS = 60_000

/**
 * How many looks a still-running check gets before the watch lets go.
 *
 * A required check that never reports (`EXPECTED` forever, a workflow that was deleted) would
 * otherwise be polled until the app quits. Two hours covers every CI run this project has seen;
 * a push after that starts a fresh count, and pressing refresh always asks again.
 */
export const PULL_REQUEST_WATCH_LIMIT = 120

/** The fields older projections were saved without. */
type SavedPullRequest = Omit<ReviewPullRequest, 'mergeState' | 'state'> & Partial<Pick<ReviewPullRequest, 'mergeState' | 'state'>>
function completePullRequest(pr: SavedPullRequest): ReviewPullRequest {
  return { ...pr, mergeState: pr.mergeState ?? 'unknown', state: pr.state ?? 'open' }
}

/** The heads whose checks are still running - a push changes the head, so it starts the watch over. */
function pendingHeads(snapshot: ReviewSnapshot): string {
  return snapshot.pullRequests
    .filter(pr => pr.state === 'open' && pr.check === 'pending')
    .map(pr => `${pr.url}@${pr.headSha}`).sort().join('\n')
}

/**
 * Emits `projected` (taskId, snapshot) each time a task's review is fully observed - Git and
 * GitHub both answered - so what follows from the state of its Pull Requests can be decided on
 * a fresh look, never on the retained copy a failed fetch leaves behind.
 */
export class ReviewOperations extends EventEmitter {
  constructor(private db: Db, private getSettings: () => AppSettings, private review: ReviewService, private workbenchPlace: (taskId: string) => { dir: string; project: Project }, private remote?: RunnerOperations) { super() }



  private pending = new Set<string>()
  private active: Promise<void> | null = null
  private timer: NodeJS.Timeout | null = null
  private stopped = false
  private activeTask: string | null = null
  private refreshedAt = new Map<string, number>()
  private watches = new Map<string, { timer: NodeJS.Timeout; heads: string; looks: number }>()

  /**
   * Reads only materialized data. Git and GitHub belong to the refresh queue.
   *
   * The saved projection is the task's, wherever it was computed. `materialize` computes it in the
   * place the agent worked - the worktree it moved into - while a run only records where it was
   * launched. Holding one against the other discarded every projection of a task whose agent had
   * entered a worktree, and the pane read zero changes, commits and PRs while refreshing forever.
   * Measured: one task in seven that had run three times or more. A place that moves is caught
   * up by the next refresh.
   */
  reviewSnapshot(taskId: string): ReviewSnapshot {
    const task = repo.getTask(this.db, taskId)
    if (!task) throw new Error(t('tasks.notFound'))
    const saved = repo.getReviewSnapshot(this.db, taskId)?.snapshot
    if (saved) {
      if (Array.isArray(saved.localChanges) && Array.isArray(saved.stagedChanges)) {
        return { ...saved, pullRequests: saved.pullRequests.map(completePullRequest) }
      }
      // Older projections combine index and working changes. Refresh instead of relabeling that data.
      if (this.activeTask !== taskId) this.requestRefresh(taskId)
      return { ...this.empty(saved.cwd), ...saved, localChanges: [], localRevision: null,
        stagedChanges: [], stagedRevision: null, preparing: !saved.error }
    }
    if (this.activeTask !== taskId) this.requestRefresh(taskId)
    return this.empty(this.launchDir(taskId), true)
  }

  /** An unchanged projection costs only a token read, including over IPC and satellite links. */
  pollSnapshot(taskId: string, knownVersion?: string): { version: string | null; snapshot: ReviewSnapshot | null } {
    if (!repo.getTask(this.db, taskId)) throw new Error(t('tasks.notFound'))
    const version = repo.reviewSnapshotVersion(this.db, taskId)
    return { version, snapshot: version !== null && version === knownVersion ? null : this.reviewSnapshot(taskId) }
  }

  /** Only a placeholder's label until the first projection names the place the work is in. */
  private launchDir(taskId: string): string {
    const task = repo.getTask(this.db, taskId)
    return repo.listRunsByTask(this.db, taskId)[0]?.cwd || (task && repo.getProject(this.db, task.projectId)?.path) || ''
  }

  requestRefresh(taskId: string): void {
    if (this.stopped) return
    this.pending.add(taskId)
    if (this.active || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.active = this.drain().finally(() => { this.active = null })
    }, 250)
    this.timer.unref?.()
  }

  async refresh(taskId: string): Promise<ReviewSnapshot> {
    this.refreshedAt.delete(taskId)
    this.requestRefresh(taskId)
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (!this.active) this.active = this.drain().finally(() => { this.active = null })
    await this.active
    return this.reviewSnapshot(taskId)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.pending.clear()
    for (const watch of this.watches.values()) clearTimeout(watch.timer)
    this.watches.clear()
  }

  /**
   * Every Pull Request the project's tasks keep in their reviews, one entry per Pull Request.
   *
   * Only what is saved is read. The CI of an open one is already looked at again every minute
   * while it runs (`watch`), so the project's list stays as current as each task's own tab
   * without asking GitHub once per task on every read. Where two tasks kept the same one, the
   * copy GitHub updated last is the one shown.
   */
  projectPullRequests(projectId: string): ProjectPullRequest[] {
    const byUrl = new Map<string, ProjectPullRequest>()
    for (const row of repo.listProjectPullRequests(this.db, projectId)) {
      let saved: SavedPullRequest
      try { saved = JSON.parse(row.pullRequest) as SavedPullRequest } catch { continue }
      if (!saved.url) continue
      const { files: _files, ...pullRequest } = completePullRequest(saved)
      const task = { id: row.taskId, title: row.title }
      const known = byUrl.get(pullRequest.url)
      if (!known) byUrl.set(pullRequest.url, { ...pullRequest, tasks: [task] })
      else {
        const tasks = known.tasks.some(entry => entry.id === task.id) ? known.tasks : [...known.tasks, task]
        byUrl.set(pullRequest.url, pullRequest.updatedAt > known.updatedAt ? { ...pullRequest, tasks } : { ...known, tasks })
      }
    }
    return [...byUrl.values()]
  }

  /**
   * Look again at the tasks whose Pull Requests are still open, and answer once they were.
   * Merged and closed ones do not change, so they cost nothing.
   */
  async refreshProjectPullRequests(projectId: string): Promise<ProjectPullRequest[]> {
    const tasks = new Set(this.projectPullRequests(projectId).filter(pr => pr.state === 'open').flatMap(pr => pr.tasks.map(task => task.id)))
    if (tasks.size > 0) {
      for (const taskId of tasks) {
        this.refreshedAt.delete(taskId)
        this.requestRefresh(taskId)
      }
      if (this.timer) { clearTimeout(this.timer); this.timer = null }
      if (!this.active) this.active = this.drain().finally(() => { this.active = null })
      await this.active
    }
    return this.projectPullRequests(projectId)
  }

  /**
   * The project directory as it is now, read on demand. Nothing is saved: unlike a task's review,
   * there is no earlier point of the project to keep, and the next look is the fresh one.
   */
  async projectFiles(projectId: string): Promise<ProjectFiles> {
    return this.review.projectFiles(this.projectDir(projectId))
  }

  /** Only the working copy: a request names a path in the project, never a revision or a source. */
  async projectFile(projectId: string, path: string, previousPath?: string): Promise<ReviewFile> {
    const project = repo.getProject(this.db, projectId)
    if (!project) throw new Error(t('tasks.projectNotFound'))
    return this.review.file(project.path, project, this.getSettings(), { source: 'working', path, previousPath })
  }

  private projectDir(projectId: string): string {
    const project = repo.getProject(this.db, projectId)
    if (!project) throw new Error(t('tasks.projectNotFound'))
    return project.path
  }

  /** The tasks whose Pull Request checks are being looked at again on their own. */
  watching(): string[] {
    return [...this.watches.keys()]
  }

  /**
   * Keep looking while a check is running; let go the moment none is.
   *
   * The count restarts when the set of running heads changes: that is a new push, and its CI
   * deserves its own two hours. The same heads still running keep counting down.
   */
  private watch(taskId: string, snapshot: ReviewSnapshot): void {
    const current = this.watches.get(taskId)
    if (current) { clearTimeout(current.timer); this.watches.delete(taskId) }
    const heads = pendingHeads(snapshot)
    if (this.stopped || !heads) return
    const looks = current && current.heads === heads ? current.looks + 1 : 1
    if (looks > PULL_REQUEST_WATCH_LIMIT) return
    const timer = setTimeout(() => {
      this.watches.delete(taskId)
      // The watch is the only caller that keeps the entry; re-adding it below is what continues it.
      this.watches.set(taskId, { timer, heads, looks })
      this.refreshedAt.delete(taskId)
      this.requestRefresh(taskId)
    }, PULL_REQUEST_WATCH_MS)
    timer.unref?.()
    this.watches.set(taskId, { timer, heads, looks })
  }

  private empty(cwd: string, preparing = false): ReviewSnapshot {
    return { cwd, branch: '', repository: null, tree: [], changes: [], stagedChanges: [], stagedRevision: null, localChanges: [],
      revision: null, localRevision: null, commits: [], pullRequests: [], coverage: null,
      projectTasks: [], preparing }
  }

  private async drain(): Promise<void> {
    while (!this.stopped && this.pending.size) {
      const now = Date.now()
      const taskId = [...this.pending].find(id => now - (this.refreshedAt.get(id) ?? 0) >= 15_000)
      if (!taskId) {
        const delay = Math.max(1, Math.min(...[...this.pending].map(id => (this.refreshedAt.get(id) ?? 0) + 15_000 - now)))
        this.timer = setTimeout(() => {
          this.timer = null
          this.active = this.drain().finally(() => { this.active = null })
        }, delay)
        this.timer.unref?.()
        break
      }
      this.pending.delete(taskId)
      if (!repo.getTask(this.db, taskId)) continue
      this.activeTask = taskId
      this.refreshedAt.set(taskId, now)
      try { await this.materialize(taskId) }
      catch (error) {
        if (this.stopped || !repo.getTask(this.db, taskId)) continue
        // A failed look keeps what was last seen; the error is shown beside it, not instead of it.
        const saved = repo.getReviewSnapshot(this.db, taskId)?.snapshot
        repo.saveReviewSnapshot(this.db, taskId, { ...this.empty(this.launchDir(taskId)), ...saved, preparing: false,
          error: error instanceof Error ? error.message : String(error) })
        // A look that failed does not schedule the next one; the refresh button asks again.
        const watch = this.watches.get(taskId)
        if (watch) { clearTimeout(watch.timer); this.watches.delete(taskId) }
        console.warn('Review materialization failed', error)
      } finally { this.activeTask = null }
    }
  }

  private async materialize(taskId: string): Promise<void> {
    const lookedAt = new Date().toISOString()
    if (this.remote?.workspace(taskId)) {
      const snapshot = await this.remote.inspect(taskId, 'snapshot') as ReviewSnapshot
      if (this.stopped || !repo.getTask(this.db, taskId)) return
      repo.saveReviewSnapshot(this.db, taskId, snapshot)
      // The runner's checkout is not here, so its trees cannot be pinned from this side.
      await this.recordRunEnd(taskId, snapshot, lookedAt, false)
      this.watch(taskId, snapshot)
      this.emit('projected', taskId, snapshot)
      return
    }
    const place = this.workbenchPlace(taskId)
    const runs = repo.listRunsByTask(this.db, taskId)
    const firstRun = runs.at(-1)
    const savedBase = repo.getTaskReviewBase(this.db, taskId)
    const baseline = firstRun
      ? savedBase?.cwd === place.dir && savedBase.baseTree ? savedBase : await this.review.inferBaseline(place.dir, firstRun.startedAt)
      : null
    if (this.stopped || !repo.getTask(this.db, taskId)) return
    if (!savedBase && baseline) repo.insertTaskReviewBase(this.db, { taskId, cwd: place.dir, ...baseline })
    const previous = repo.getReviewSnapshot(this.db, taskId)?.snapshot
    const save = (snapshot: ReviewSnapshot): void => {
      if (!this.stopped && repo.getTask(this.db, taskId)) repo.saveReviewSnapshot(this.db, taskId, snapshot)
    }
    /*
     * The service decides which commits are the task's; it needs when the runs were, and which
     * commits the last projection named so one that only left the range (the checkout moved to
     * another branch) is not forgotten - and one that turned out to be other work is.
     */
    const work = {
      windows: runs.map(run => ({ from: run.startedAt, to: run.endedAt })),
      recorded: previous?.cwd === place.dir ? previous.commits.map(commit => commit.sha) : []
    }
    const snapshot = await this.review.snapshot(place.dir, place.project, this.getSettings(), baseline,
      repo.reviewEvidence(this.db, taskId), async local => {
        if (this.stopped) return
        await this.review.retain(taskId, local)
        save({ ...local, pullRequests: previous?.pullRequests ?? [] })
      }, work)
    // A transient GitHub failure must not erase already recorded PRs.
    if (snapshot.pullRequestNotice && previous?.cwd === place.dir) {
      const prs = new Map(previous.pullRequests.map(pr => [pr.url, pr]))
      for (const pr of snapshot.pullRequests) {
        if (pr.headSha && pr.files.length || !prs.has(pr.url)) prs.set(pr.url, pr)
      }
      snapshot.pullRequests = [...prs.values()]
    }
    save(snapshot)
    if (this.stopped || !repo.getTask(this.db, taskId)) return
    await this.recordRunEnd(taskId, snapshot, lookedAt, true)
    this.watch(taskId, snapshot)
    this.emit('projected', taskId, snapshot)
  }

  /**
   * Keep this projection as what the task's latest run left, the first time one can say so.
   *
   * Only a look that **began after** that run ended, and only while no later run has started:
   * before, the checkout was still being worked; after, it carries the next run's work too. A run
   * that ended before history was kept (`REVIEW_HISTORY_SINCE`) is not filed at all - today's
   * checkout is not what it left. The file list and the project's commands describe the checkout,
   * not the result, and are the bulk of a projection, so they are not kept.
   */
  private async recordRunEnd(taskId: string, snapshot: ReviewSnapshot, lookedAt: string, local: boolean): Promise<void> {
    if (snapshot.error || snapshot.preparing) return
    const latest = repo.listRunsByTask(this.db, taskId)[0]
    if (!latest?.endedAt || latest.endedAt > lookedAt || repo.hasReviewHistory(this.db, latest.id)) return
    const since = repo.getMeta(this.db, REVIEW_HISTORY_SINCE)
    if (since && latest.endedAt < since) return
    const kept: ReviewSnapshot = { ...snapshot, tree: [], projectTasks: [] }
    if (local) {
      // The current refs move with every projection; the run's own keep its trees readable after GC.
      try { await this.review.retain(taskId, kept, latest.id) }
      catch (error) { console.warn('Cannot retain the revisions of a run', error) }
    }
    if (this.stopped || !repo.getTask(this.db, taskId)) return
    repo.recordReviewHistory(this.db, latest.id, taskId, kept)
  }

  /** The runs whose review was kept as they left it, newest first. */
  reviewHistory(taskId: string): ReviewHistoryPoint[] {
    const runs = new Map(repo.listRunsByTask(this.db, taskId).map(run => [run.id, run]))
    return repo.listReviewHistory(this.db, taskId).map(entry => ({
      runId: entry.runId,
      recordedAt: entry.recordedAt,
      endedAt: runs.get(entry.runId)?.endedAt ?? entry.recordedAt
    }))
  }

  /** The review as that run left it. Read from the record only; nothing is looked at again. */
  reviewHistorySnapshot(taskId: string, runId: string): ReviewSnapshot {
    const snapshot = repo.getReviewHistory(this.db, taskId, runId)
    if (!snapshot) throw new Error(t('review.historyNotFound'))
    return { ...snapshot, pullRequests: snapshot.pullRequests.map(completePullRequest) }
  }

  /** Forget runs recorded more than `days` days ago, with the refs that kept their trees. 0 keeps all. */
  async prune(days: number, now = new Date()): Promise<number> {
    if (!(days > 0)) return 0
    const before = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
    const expired = repo.expiredReviewHistory(this.db, before)
    for (const entry of expired) {
      if (this.stopped) break
      const prefix = this.review.retainedPrefix(entry.taskId, entry.runId)
      try {
        const refs = await git(entry.cwd, ['for-each-ref', '--format=%(refname)', prefix])
        for (const ref of refs.code === 0 ? refs.stdout.split('\n').filter(Boolean) : []) await git(entry.cwd, ['update-ref', '-d', ref])
      } catch { /* A checkout that is gone has no refs left to hold anything. */ }
      repo.deleteReviewHistory(this.db, entry.runId)
    }
    return expired.length
  }


  async reviewFile(taskId: string, request: ReviewFileRequest): Promise<ReviewFile> {
    if (this.remote?.workspace(taskId)) return await this.remote.inspect(taskId, 'file', { file: request }) as ReviewFile
    const place = this.workbenchPlace(taskId)
    return this.review.file(place.dir, place.project, this.getSettings(), request)
  }



  async reviewComment(
    taskId: string,
    input: ReviewCommentInput
  ): Promise<ReviewActionResult> {
    if (this.remote?.workspace(taskId)) return await this.remote.inspect(taskId, 'comment', { comment: input }) as ReviewActionResult
    const place = this.workbenchPlace(taskId)
    return this.review.comment(place.dir, place.project, this.getSettings(), input)
  }
}
