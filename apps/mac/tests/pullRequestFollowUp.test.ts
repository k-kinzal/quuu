import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { MAX_PULL_REQUEST_ROUNDS, PullRequestFollowUp, pullRequestTrouble } from '../src/main/automation/pullRequestFollowUp.js'
import type { ReviewPullRequest, ReviewSnapshot } from '../src/main/review/types.js'
import { DEFAULT_SETTINGS, type AppSettings } from '../src/main/settings/types.js'
import type { ToastPayload } from '../src/main/snapshot.js'
import { nowIso } from '../src/main/util.js'
import { makeAgent, makeProject, makeTask, memoryDb, occupy, reviewed } from './helpers.js'

/**
 * A run ends and the Pull Request it left is not in order. When the person has said what to
 * do about that, the task goes back to its agent with those words instead of waiting in review.
 *
 * The decision is made on a fresh look at GitHub and only for a task that is waiting after a
 * run that ended normally: a task a person canceled, marked done, or sent elsewhere is theirs.
 */

function pull(over: Partial<ReviewPullRequest>): ReviewPullRequest {
  return { number: 1, title: 'PR', url: 'https://github.com/owner/repo/pull/1', headRefName: 'feature', baseRefName: 'main',
    headSha: 'a'.repeat(40), draft: false, updatedAt: '', check: 'neutral', mergeState: 'unknown', state: 'open', files: [], ...over }
}
function snapshot(pullRequests: ReviewPullRequest[], notice?: string): ReviewSnapshot {
  return { cwd: '/tmp', branch: 'main', repository: 'owner/repo', tree: [], changes: [], stagedChanges: [], stagedRevision: null, localChanges: [],
    revision: null, localRevision: null, commits: [], pullRequests, coverage: null, projectTasks: [], ...(notice ? { pullRequestNotice: notice } : {}) }
}

let db: ReturnType<typeof memoryDb>
let agentId: string
let projectId: string
let settings: AppSettings
let send: ReturnType<typeof vi.fn<(taskId: string, message: string) => { ok: boolean; reason?: string }>>
let followUp: PullRequestFollowUp
let toasts: ToastPayload[]

beforeEach(() => {
  db = memoryDb()
  agentId = makeAgent(db, { name: 'Fixture' })
  projectId = makeProject(db, { name: 'Fixture', targetId: agentId })
  settings = { ...DEFAULT_SETTINGS, pullRequestFailurePrompt: 'CI is red. Read the log and fix it.',
    pullRequestPendingPrompt: 'Wait for CI with gh pr checks --watch.', pullRequestConflictPrompt: 'Rebase onto the base branch.' }
  send = vi.fn<(taskId: string, message: string) => { ok: boolean; reason?: string }>().mockReturnValue({ ok: true })
  toasts = []
  followUp = new PullRequestFollowUp(db, () => settings, () => Promise.reject(new Error('not used')), send)
  followUp.on('notify', (toast: ToastPayload) => toasts.push(toast))
})
afterEach(() => db.close())

it('names the worst state first: a conflict over a failed check, a failed check over one still running', () => {
  expect(pullRequestTrouble([])).toBeNull()
  expect(pullRequestTrouble([pull({ check: 'success', mergeState: 'clean' })])).toBeNull()
  expect(pullRequestTrouble([pull({ check: 'pending' }), pull({ number: 2, url: 'u2', check: 'failure' })])).toEqual({ kind: 'failure', urls: ['u2'] })
  expect(pullRequestTrouble([pull({ check: 'failure' }), pull({ number: 2, url: 'u2', check: 'success', mergeState: 'conflicting' })])).toEqual({ kind: 'conflict', urls: ['u2'] })
  expect(pullRequestTrouble([pull({ check: 'pending' })])).toEqual({ kind: 'pending', urls: ['https://github.com/owner/repo/pull/1'] })
  // Merged and closed Pull Requests are over, whatever their last check said
  expect(pullRequestTrouble([pull({ check: 'failure', state: 'merged' }), pull({ mergeState: 'conflicting', state: 'closed' })])).toBeNull()
})

it('sends the task back with the prompt for its PR state and the PRs it is about, then a toast that says so', () => {
  const taskId = reviewed(db, projectId, 'Ship it', agentId)
  expect(followUp.onProjected(taskId, snapshot([pull({ check: 'failure' })]))).toBe('sent')
  expect(send).toHaveBeenCalledWith(taskId, 'CI is red. Read the log and fix it.\n\nhttps://github.com/owner/repo/pull/1')
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatchObject({ level: 'info', taskId })
  expect(toasts[0].message).toContain('Ship it')
})

it('leaves the task in review when nothing was written for that state, and when the project opted out', () => {
  const taskId = reviewed(db, projectId, 'Ship it', agentId)
  settings = { ...settings, pullRequestPendingPrompt: '' }
  expect(followUp.onProjected(taskId, snapshot([pull({ check: 'pending' })]))).toBe('left')
  repo.updateProject(db, projectId, { pullRequestPromptMode: 'off' })
  expect(followUp.onProjected(taskId, snapshot([pull({ check: 'failure' })]))).toBe('left')
  expect(send).not.toHaveBeenCalled()
})

it('uses the project\'s own words when it has them', () => {
  const taskId = reviewed(db, projectId, 'Ship it', agentId)
  repo.updateProject(db, projectId, { pullRequestPromptMode: 'custom', pullRequestConflictPrompt: 'Merge main into the branch.', pullRequestFailurePrompt: '' })
  expect(followUp.onProjected(taskId, snapshot([pull({ mergeState: 'conflicting' })]))).toBe('sent')
  expect(send).toHaveBeenCalledWith(taskId, 'Merge main into the branch.\n\nhttps://github.com/owner/repo/pull/1')
  // The app's failure prompt does not fill in for the project's empty one
  send.mockClear()
  expect(followUp.onProjected(reviewed(db, projectId, 'Again', agentId), snapshot([pull({ check: 'failure' })]))).toBe('left')
  expect(send).not.toHaveBeenCalled()
})

it('does not touch a task that is running, was canceled, is archived, or whose last fetch failed', () => {
  const running = makeTask(db, projectId, 'Running')
  occupy(db, running, agentId)
  expect(followUp.onProjected(running, snapshot([pull({ check: 'failure' })]))).toBe('left')

  const canceled = makeTask(db, projectId, 'Canceled')
  const runId = occupy(db, canceled, agentId)
  repo.updateRun(db, runId, { status: 'canceled', endedAt: nowIso() })
  repo.setTaskStatus(db, canceled, 'review', { currentRunId: runId })
  expect(followUp.onProjected(canceled, snapshot([pull({ check: 'failure' })]))).toBe('left')

  const archived = reviewed(db, projectId, 'Archived', agentId)
  repo.setTaskArchived(db, archived, true)
  expect(followUp.onProjected(archived, snapshot([pull({ check: 'failure' })]))).toBe('left')

  const offline = reviewed(db, projectId, 'Offline', agentId)
  expect(followUp.onProjected(offline, snapshot([pull({ check: 'failure' })], 'offline'))).toBe('left')
  expect(send).not.toHaveBeenCalled()
})

it('stops after a bounded number of rounds, says so once, and starts over once the PR is in order', () => {
  const taskId = reviewed(db, projectId, 'Ship it', agentId)
  const red = snapshot([pull({ check: 'failure' })])
  for (let round = 0; round < MAX_PULL_REQUEST_ROUNDS; round += 1) {
    // Each round, the run ends normally again and the task is back in review
    repo.setTaskStatus(db, taskId, 'review')
    expect(followUp.onProjected(taskId, red)).toBe('sent')
  }
  repo.setTaskStatus(db, taskId, 'review')
  expect(followUp.onProjected(taskId, red)).toBe('left')
  expect(followUp.onProjected(taskId, red)).toBe('left')
  expect(send).toHaveBeenCalledTimes(MAX_PULL_REQUEST_ROUNDS)
  expect(toasts.filter(toast => toast.level === 'warn')).toHaveLength(1)

  expect(followUp.onProjected(taskId, snapshot([pull({ check: 'success' })]))).toBe('clean')
  expect(followUp.onProjected(taskId, red)).toBe('sent')
})

it('asks GitHub afresh when a task reaches review and survives the ask failing', async () => {
  const refresh = vi.fn<(taskId: string) => Promise<ReviewSnapshot>>().mockRejectedValue(new Error('offline'))
  const quiet = new PullRequestFollowUp(db, () => settings, refresh, send)
  await expect(quiet.onReview('tsk')).resolves.toBeUndefined()
  expect(refresh).toHaveBeenCalledWith('tsk')
})
