import { EventEmitter } from 'node:events'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'
import type { ReviewPullRequest, ReviewSnapshot } from '../review/types.js'
import { hasPullRequestPrompt, renderPullRequestPrompt, resolvePullRequestPrompts, type PullRequestPrompts } from '../settings/pullRequestPrompts.js'
import type { AppSettings } from '../settings/types.js'
import type { ToastPayload } from '../snapshot.js'
import { truncate } from '../util.js'

/**
 * How many times in a row a task is sent back over its Pull Request before it lands in review
 * anyway.
 *
 * Each round is an agent run. A check that fails for a reason the agent cannot reach - a
 * secret missing from CI, a flaky runner - would otherwise be "fixed" forever, one run per
 * round, and the person would find a task that had been busy all night with nothing to show.
 * The count starts over the moment the Pull Requests are in order.
 */
export const MAX_PULL_REQUEST_ROUNDS = 5

export type PullRequestTrouble = keyof PullRequestPrompts

/**
 * What, if anything, is wrong with the task's Pull Requests, and which ones.
 *
 * A conflict comes first: a red check on a branch that no longer merges is often the conflict
 * itself, and CI cannot say anything true until the branch is brought up to date. A failure
 * comes before a run still in progress for the same reason - the failed check is already an
 * answer. Merged and closed Pull Requests are over, whatever their last check said.
 */
export function pullRequestTrouble(pullRequests: ReviewPullRequest[]): { kind: PullRequestTrouble; pullRequests: ReviewPullRequest[] } | null {
  const open = pullRequests.filter(pr => pr.state === 'open')
  const conflicting = open.filter(pr => pr.mergeState === 'conflicting')
  if (conflicting.length) return { kind: 'conflict', pullRequests: conflicting }
  const failed = open.filter(pr => pr.check === 'failure')
  if (failed.length) return { kind: 'failure', pullRequests: failed }
  const running = open.filter(pr => pr.check === 'pending')
  if (running.length) return { kind: 'pending', pullRequests: running }
  return null
}

/** What the automation needs from the rest of the app. Each is one call into the owning feature. */
export interface PullRequestFollowUpPorts {
  /** Resolves once the conversation of the task's latest run is indexed, so its PR receipts are filed. */
  indexed(taskId: string): Promise<void>
  /** A full look at Git and GitHub for the task. The projection it produces is what decides. */
  refresh(taskId: string): Promise<ReviewSnapshot>
  /** Send the task, still running, straight back to its agent with this message. Says whether it went. */
  sendBack(taskId: string, message: string): boolean
  /** The look is over: a task not sent back lands in review, and the slot it kept goes. */
  conclude(taskId: string): void
}

/**
 * Sends a task back to its agent when the Pull Request it produced is not in order.
 *
 * **It happens before the task reaches review.** A task whose run ended normally stays running,
 * and keeps the run's slot, from the moment the run ends (`shouldHold`, asked by the scheduler
 * inside the transition) until the decision is made (`onCheck`); a task sent back is a follow-up,
 * first in line, so it takes that same slot and carries on. Landing in review first and being
 * pulled back out read as a finished task coming back to life, and deciding after the slot was
 * free let another task start in between.
 *
 * Every decision is made on a fresh look at GitHub (`ReviewOperations` emits one per full
 * projection), never on the copy a failed fetch leaves behind. The task has to be still running
 * on a run that ended normally - that is, being looked at. A task already in review is left
 * there, whatever its checks say later, and one a person canceled, marked done or sent elsewhere
 * is theirs, not this automation's. The prompt is sent exactly as the person wrote it.
 */
export class PullRequestFollowUp extends EventEmitter {
  private rounds = new Map<string, number>()

  constructor(
    private db: Db,
    private getSettings: () => AppSettings,
    private ports: PullRequestFollowUpPorts
  ) { super() }

  /**
   * Should a task whose run just ended normally stay running, keeping its slot, while this looks
   * at its Pull Request? Only where some state would send it back: everywhere else it goes to
   * review at once and the queue must not wait for GitHub.
   */
  shouldHold(taskId: string): boolean {
    const task = repo.getTask(this.db, taskId)
    const project = task ? repo.getProject(this.db, task.projectId) : null
    return project !== null && hasPullRequestPrompt(resolvePullRequestPrompts(this.getSettings(), project))
  }

  /**
   * A task's run ended and it is being looked at. Wait for the run's conversation to be indexed -
   * that is where the Pull Request it opened is read from - then ask GitHub now rather than
   * reading what the last projection saw: the run that just ended is what pushed. The projection
   * that comes back decides (`onProjected`); the look ends whatever happened.
   */
  async onCheck(taskId: string): Promise<void> {
    try {
      await this.ports.indexed(taskId)
    } catch (error) {
      console.warn('The finished run was not indexed before its Pull Request was read', taskId, error)
    }
    try {
      await this.ports.refresh(taskId)
    } catch (error) {
      console.warn('Pull Request state could not be read after the run', taskId, error)
    } finally {
      this.ports.conclude(taskId)
    }
  }

  /** A full projection landed for the task. Decides, and says what it did. */
  onProjected(taskId: string, snapshot: ReviewSnapshot): 'sent' | 'clean' | 'left' {
    const task = repo.getTask(this.db, taskId)
    if (!task || task.status !== 'running' || task.archived) return 'left'
    const run = task.currentRunId ? repo.getRun(this.db, task.currentRunId) : null
    if (run?.status !== 'succeeded') return 'left'
    // The retained copy after a fetch that failed says nothing about now.
    if (snapshot.pullRequestNotice) return 'left'
    const project = repo.getProject(this.db, task.projectId)
    if (!project) return 'left'
    const trouble = pullRequestTrouble(snapshot.pullRequests)
    if (!trouble) {
      this.rounds.delete(taskId)
      return 'clean'
    }
    const prompt = resolvePullRequestPrompts(this.getSettings(), project)[trouble.kind]
    if (!prompt) return 'left'
    const round = this.rounds.get(taskId) ?? 0
    if (round >= MAX_PULL_REQUEST_ROUNDS) {
      if (round === MAX_PULL_REQUEST_ROUNDS) {
        this.rounds.set(taskId, round + 1)
        this.notify({ id: `pull-request-rounds-${taskId}`, level: 'warn', taskId,
          message: t('pullRequestFollowUp.roundsExhausted', { title: truncate(task.title, 50), count: MAX_PULL_REQUEST_ROUNDS }) })
      }
      return 'left'
    }
    if (!this.ports.sendBack(taskId, renderPullRequestPrompt(prompt, trouble.pullRequests))) {
      console.warn('Pull Request follow-up was not sent', taskId)
      return 'left'
    }
    this.rounds.set(taskId, round + 1)
    this.notify({ id: `pull-request-${trouble.kind}-${taskId}-${String(round)}`, level: 'info', taskId,
      message: t(`pullRequestFollowUp.${trouble.kind}`, { title: truncate(task.title, 50) }) })
    return 'sent'
  }

  private notify(toast: ToastPayload): void {
    this.emit('notify', { ...toast, notificationKind: 'pullRequest' } satisfies ToastPayload)
  }
}
