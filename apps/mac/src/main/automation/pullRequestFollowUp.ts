import { EventEmitter } from 'node:events'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'
import type { RunNowResult } from '../ipc/types.js'
import type { ReviewPullRequest, ReviewSnapshot } from '../review/types.js'
import { resolvePullRequestPrompts, type PullRequestPrompts } from '../settings/pullRequestPrompts.js'
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
export function pullRequestTrouble(pullRequests: ReviewPullRequest[]): { kind: PullRequestTrouble; urls: string[] } | null {
  const open = pullRequests.filter(pr => pr.state === 'open')
  const conflicting = open.filter(pr => pr.mergeState === 'conflicting')
  if (conflicting.length) return { kind: 'conflict', urls: conflicting.map(pr => pr.url) }
  const failed = open.filter(pr => pr.check === 'failure')
  if (failed.length) return { kind: 'failure', urls: failed.map(pr => pr.url) }
  const running = open.filter(pr => pr.check === 'pending')
  if (running.length) return { kind: 'pending', urls: running.map(pr => pr.url) }
  return null
}

/** The instruction as the agent reads it: the person's words, then which Pull Requests they are about. */
export function followUpMessage(prompt: string, urls: string[]): string {
  return [prompt.trim(), ...urls].join('\n\n')
}

/**
 * Sends a task back to its agent when the Pull Request it produced is not in order.
 *
 * Every decision is made on a fresh look at GitHub (`ReviewOperations` emits one per full
 * projection), never on the copy a failed fetch leaves behind. The task has to be waiting in
 * review after a run that ended normally: a task a person canceled, marked done or sent
 * elsewhere is theirs, not this automation's. What is sent goes through the same entry a
 * person's follow-up does, so the agent that opened the session is the one that continues it.
 */
export class PullRequestFollowUp extends EventEmitter {
  private rounds = new Map<string, number>()

  constructor(
    private db: Db,
    private getSettings: () => AppSettings,
    private refresh: (taskId: string) => Promise<ReviewSnapshot>,
    private send: (taskId: string, message: string) => RunNowResult
  ) { super() }

  /**
   * A task reached review. Ask GitHub now rather than reading what the last projection saw:
   * the run that just ended is what pushed, and the checks it started are what matter.
   * The projection that comes back decides (`onProjected`).
   */
  async onReview(taskId: string): Promise<void> {
    try {
      await this.refresh(taskId)
    } catch (error) {
      console.warn('Pull Request state could not be read after review', taskId, error)
    }
  }

  /** A full projection landed for the task. Decides, and says what it did. */
  onProjected(taskId: string, snapshot: ReviewSnapshot): 'sent' | 'clean' | 'left' {
    const task = repo.getTask(this.db, taskId)
    if (!task || task.status !== 'review' || task.archived) return 'left'
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
    const result = this.send(taskId, followUpMessage(prompt, trouble.urls))
    if (!result.ok) {
      console.warn('Pull Request follow-up was not sent', taskId, result.reason)
      return 'left'
    }
    this.rounds.set(taskId, round + 1)
    this.notify({ id: `pull-request-${trouble.kind}-${taskId}-${String(round)}`, level: 'info', taskId,
      message: t(`pullRequestFollowUp.${trouble.kind}`, { title: truncate(task.title, 50) }) })
    return 'sent'
  }

  private notify(toast: ToastPayload): void {
    this.emit('notify', toast)
  }
}
