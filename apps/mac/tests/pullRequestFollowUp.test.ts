import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { MAX_PULL_REQUEST_ROUNDS, PullRequestFollowUp, pullRequestTrouble, type PullRequestFollowUpPorts } from '../src/main/automation/pullRequestFollowUp.js'
import type { ReviewPullRequest, ReviewSnapshot } from '../src/main/review/types.js'
import { DEFAULT_SETTINGS, type AppSettings } from '../src/main/settings/types.js'
import type { ToastPayload } from '../src/main/snapshot.js'
import { nowIso } from '../src/main/util.js'
import { makeAgent, makeProject, makeTask, memoryDb, occupy, reviewed } from './helpers.js'

/**
 * A run ends and the Pull Request it left is not in order. When the person switched on a prompt
 * for that state, the task goes back to its agent with those words - exactly those words -
 * instead of waiting in review.
 *
 * The decision is made on a fresh look at GitHub and only while the task is still running on a
 * run that ended normally - before it ever reaches review. A task already in review, or one a
 * person canceled, marked done, or sent elsewhere, is theirs.
 */

function pull(over: Partial<ReviewPullRequest>): ReviewPullRequest {
  return { number: 1, title: 'PR', url: 'https://github.com/owner/repo/pull/1', headRefName: 'feature', baseRefName: 'main',
    headSha: 'a'.repeat(40), draft: false, updatedAt: '', check: 'neutral', mergeState: 'unknown', state: 'open', files: [], ...over }
}
/** A task whose run ended normally and that is still running while its Pull Request is looked at. */
function checking(db: ReturnType<typeof memoryDb>, projectId: string, title: string, agentId: string): string {
  const taskId = makeTask(db, projectId, title)
  const runId = occupy(db, taskId, agentId)
  repo.updateRun(db, runId, { status: 'succeeded', endedAt: nowIso() })
  repo.setTaskStatus(db, taskId, 'running', { currentRunId: runId })
  return taskId
}
function snapshot(pullRequests: ReviewPullRequest[], notice?: string): ReviewSnapshot {
  return { cwd: '/tmp', branch: 'main', repository: 'owner/repo', tree: [], changes: [], stagedChanges: [], stagedRevision: null, localChanges: [],
    revision: null, localRevision: null, commits: [], pullRequests, coverage: null, projectTasks: [], ...(notice ? { pullRequestNotice: notice } : {}) }
}

let db: ReturnType<typeof memoryDb>
let agentId: string
let projectId: string
let settings: AppSettings
let ports: { [K in keyof PullRequestFollowUpPorts]: ReturnType<typeof vi.fn<PullRequestFollowUpPorts[K]>> }
let followUp: PullRequestFollowUp
let toasts: ToastPayload[]

beforeEach(() => {
  db = memoryDb()
  agentId = makeAgent(db, { name: 'Fixture' })
  projectId = makeProject(db, { name: 'Fixture', targetId: agentId })
  settings = { ...DEFAULT_SETTINGS,
    pullRequestFailurePrompt: 'CI is red. Read the log and fix it.', pullRequestFailureEnabled: true,
    pullRequestPendingPrompt: 'Wait for CI with gh pr checks --watch.', pullRequestPendingEnabled: true,
    pullRequestConflictPrompt: 'Rebase onto the base branch.', pullRequestConflictEnabled: true }
  ports = {
    indexed: vi.fn<PullRequestFollowUpPorts['indexed']>().mockResolvedValue(undefined),
    refresh: vi.fn<PullRequestFollowUpPorts['refresh']>().mockResolvedValue(snapshot([])),
    sendBack: vi.fn<PullRequestFollowUpPorts['sendBack']>().mockReturnValue(true),
    conclude: vi.fn<PullRequestFollowUpPorts['conclude']>()
  }
  toasts = []
  followUp = new PullRequestFollowUp(db, () => settings, ports)
  followUp.on('notify', (toast: ToastPayload) => toasts.push(toast))
})
afterEach(() => db.close())

it('names the worst state first: a conflict over a failed check, a failed check over one still running', () => {
  const second = pull({ number: 2, url: 'u2', check: 'failure' })
  expect(pullRequestTrouble([])).toBeNull()
  expect(pullRequestTrouble([pull({ check: 'success', mergeState: 'clean' })])).toBeNull()
  expect(pullRequestTrouble([pull({ check: 'pending' }), second])).toEqual({ kind: 'failure', pullRequests: [second] })
  const conflicting = pull({ number: 2, url: 'u2', check: 'success', mergeState: 'conflicting' })
  expect(pullRequestTrouble([pull({ check: 'failure' }), conflicting])).toEqual({ kind: 'conflict', pullRequests: [conflicting] })
  expect(pullRequestTrouble([pull({ check: 'pending' })])?.kind).toBe('pending')
  // Merged and closed Pull Requests are over, whatever their last check said
  expect(pullRequestTrouble([pull({ check: 'failure', state: 'merged' }), pull({ mergeState: 'conflicting', state: 'closed' })])).toBeNull()
})

it('sends the prompt exactly as written - nothing appended - and a toast that says so', () => {
  const taskId = checking(db, projectId, 'Ship it', agentId)
  expect(followUp.onProjected(taskId, snapshot([pull({ check: 'failure' })]))).toBe('sent')
  expect(ports.sendBack).toHaveBeenCalledWith(taskId, 'CI is red. Read the log and fix it.')
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatchObject({ level: 'info', taskId })
  expect(toasts[0].message).toContain('Ship it')
})

it('fills in only the names it knows, for every PR in that state', () => {
  const taskId = checking(db, projectId, 'Ship it', agentId)
  settings = { ...settings, pullRequestFailurePrompt: 'Fix {{ url }} (#{{number}} {{branch}} -> {{base}}), not {{unknown}}.' }
  followUp.onProjected(taskId, snapshot([pull({ check: 'failure' })]))
  expect(ports.sendBack).toHaveBeenCalledWith(taskId, 'Fix https://github.com/owner/repo/pull/1 (#1 feature -> main), not {{unknown}}.')
})

it('sends nothing for a state whose prompt is switched off, even with its text still written', () => {
  const taskId = checking(db, projectId, 'Ship it', agentId)
  settings = { ...settings, pullRequestPendingEnabled: false }
  expect(followUp.onProjected(taskId, snapshot([pull({ check: 'pending' })]))).toBe('left')
  // Another state, still on, is unaffected
  expect(followUp.onProjected(taskId, snapshot([pull({ check: 'failure' })]))).toBe('sent')
  expect(ports.sendBack).toHaveBeenCalledTimes(1)
})

it('leaves the task alone when the project opted out, and uses the project\'s own switches when it has them', () => {
  const taskId = checking(db, projectId, 'Ship it', agentId)
  repo.updateProject(db, projectId, { pullRequestPromptMode: 'off' })
  expect(followUp.onProjected(taskId, snapshot([pull({ check: 'failure' })]))).toBe('left')

  repo.updateProject(db, projectId, { pullRequestPromptMode: 'custom', pullRequestConflictPrompt: 'Merge main into the branch.',
    pullRequestConflictEnabled: true, pullRequestFailurePrompt: 'Project failure prompt', pullRequestFailureEnabled: false })
  expect(followUp.onProjected(taskId, snapshot([pull({ check: 'failure' })]))).toBe('left')
  expect(followUp.onProjected(taskId, snapshot([pull({ mergeState: 'conflicting' })]))).toBe('sent')
  expect(ports.sendBack).toHaveBeenCalledWith(taskId, 'Merge main into the branch.')
  expect(ports.sendBack).toHaveBeenCalledTimes(1)
})

it('does not touch a task whose run is still going, that already reached review, was canceled, is archived, or whose last fetch failed', () => {
  const running = makeTask(db, projectId, 'Running')
  occupy(db, running, agentId)
  expect(followUp.onProjected(running, snapshot([pull({ check: 'failure' })]))).toBe('left')

  // Once in review it stays there: a check that turns red later does not pull it back out
  const inReview = reviewed(db, projectId, 'In review', agentId)
  expect(followUp.onProjected(inReview, snapshot([pull({ check: 'failure' })]))).toBe('left')

  const canceled = makeTask(db, projectId, 'Canceled')
  const runId = occupy(db, canceled, agentId)
  repo.updateRun(db, runId, { status: 'canceled', endedAt: nowIso() })
  repo.setTaskStatus(db, canceled, 'review', { currentRunId: runId })
  expect(followUp.onProjected(canceled, snapshot([pull({ check: 'failure' })]))).toBe('left')

  const archived = checking(db, projectId, 'Archived', agentId)
  repo.setTaskArchived(db, archived, true)
  expect(followUp.onProjected(archived, snapshot([pull({ check: 'failure' })]))).toBe('left')

  const offline = checking(db, projectId, 'Offline', agentId)
  expect(followUp.onProjected(offline, snapshot([pull({ check: 'failure' })], 'offline'))).toBe('left')
  expect(ports.sendBack).not.toHaveBeenCalled()
})

it('stops after a bounded number of rounds, says so once, and starts over once the PR is in order', () => {
  const taskId = checking(db, projectId, 'Ship it', agentId)
  const red = snapshot([pull({ check: 'failure' })])
  for (let round = 0; round < MAX_PULL_REQUEST_ROUNDS; round += 1) {
    // Each round, the run ends normally again and the task is being looked at once more
    repo.setTaskStatus(db, taskId, 'running')
    expect(followUp.onProjected(taskId, red)).toBe('sent')
  }
  repo.setTaskStatus(db, taskId, 'running')
  expect(followUp.onProjected(taskId, red)).toBe('left')
  expect(followUp.onProjected(taskId, red)).toBe('left')
  expect(ports.sendBack).toHaveBeenCalledTimes(MAX_PULL_REQUEST_ROUNDS)
  expect(toasts.filter(toast => toast.level === 'warn')).toHaveLength(1)

  expect(followUp.onProjected(taskId, snapshot([pull({ check: 'success' })]))).toBe('clean')
  expect(followUp.onProjected(taskId, red)).toBe('sent')
})

/**
 * The task stays running only where a prompt could send it back; everywhere else the queue must
 * not wait for GitHub. However the look goes - indexing fails, GitHub fails - it ends.
 */
it('holds the task only where a prompt is on, waits for indexing before asking GitHub, and always concludes', async () => {
  const taskId = checking(db, projectId, 'Ship it', agentId)
  expect(followUp.shouldHold(taskId)).toBe(true)
  settings = { ...settings, pullRequestFailureEnabled: false, pullRequestPendingEnabled: false, pullRequestConflictEnabled: false }
  expect(followUp.shouldHold(taskId)).toBe(false)

  const order: string[] = []
  ports.indexed.mockImplementation(() => { order.push('indexed'); return Promise.reject(new Error('index failed')) })
  ports.refresh.mockImplementation(() => { order.push('refresh'); return Promise.reject(new Error('offline')) })
  ports.conclude.mockImplementation(() => { order.push('conclude') })
  await expect(followUp.onCheck(taskId)).resolves.toBeUndefined()
  expect(order).toEqual(['indexed', 'refresh', 'conclude'])
  expect(ports.conclude).toHaveBeenCalledWith(taskId)
})
