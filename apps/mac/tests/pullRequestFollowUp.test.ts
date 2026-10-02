import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { MAX_PULL_REQUEST_ROUNDS, REVIEW_PULL_REQUEST_WATCH_MS, PullRequestFollowUp, pullRequestTrouble, type PullRequestFollowUpPorts } from '../src/main/automation/pullRequestFollowUp.js'
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
 * run that ended normally. Review tasks keep watching for conflicts; later CI changes alone
 * do not send them back. Canceled runs and tasks moved elsewhere stay untouched.
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
afterEach(() => {
  followUp.stop()
  vi.useRealTimers()
  db.close()
})

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
  expect(toasts[0]).toMatchObject({ level: 'info', taskId, notificationKind: 'pullRequest' })
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

it('leaves active runs, later CI failures in review, canceled runs, archives and failed fetches alone', () => {
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

it('sends a review conflict through the normal follow-up port only once', () => {
  const taskId = reviewed(db, projectId, 'Awaiting review', agentId)
  settings.pullRequestConflictPrompt = 'Resolve {{url}} against {{base}}.'
  ports.sendBack.mockImplementation(id => {
    repo.setTaskStatus(db, id, 'queued')
    return true
  })
  const conflicting = snapshot([pull({ mergeState: 'conflicting', check: 'success' })])
  expect(followUp.onProjected(taskId, conflicting)).toBe('sent')
  expect(followUp.onProjected(taskId, conflicting)).toBe('left')
  expect(ports.sendBack).toHaveBeenCalledTimes(1)
  expect(ports.sendBack).toHaveBeenCalledWith(taskId, 'Resolve https://github.com/owner/repo/pull/1 against main.')
  expect(ports.conclude).not.toHaveBeenCalled()
  expect(toasts).toHaveLength(1)
})

it('keeps review conflict retries bounded across polling and resets after a clean observation', async () => {
  vi.useFakeTimers()
  const taskId = reviewed(db, projectId, 'Unresolved conflict', agentId)
  const conflicting = snapshot([pull({ mergeState: 'conflicting' })])
  repo.saveReviewSnapshot(db, taskId, conflicting)
  ports.refresh.mockImplementation(id => {
    followUp.onProjected(id, conflicting)
    return Promise.resolve(conflicting)
  })
  followUp.start()
  await vi.advanceTimersByTimeAsync(REVIEW_PULL_REQUEST_WATCH_MS * (MAX_PULL_REQUEST_ROUNDS + 2))
  expect(ports.sendBack).toHaveBeenCalledTimes(MAX_PULL_REQUEST_ROUNDS)
  expect(toasts.filter(toast => toast.level === 'warn')).toHaveLength(1)
  expect(followUp.onProjected(taskId, snapshot([pull({ mergeState: 'unknown' })]))).toBe('left')
  expect(followUp.onProjected(taskId, conflicting)).toBe('left')
  expect(followUp.onProjected(taskId, snapshot([pull({ mergeState: 'clean', check: 'success' })]))).toBe('clean')
  expect(followUp.onProjected(taskId, conflicting)).toBe('sent')
})

it.each(['done', 'held', 'queued', 'draft', 'failed', 'archived', 'canceled', 'active'] as const)(
  'does not send a review conflict after the task becomes %s', state => {
    const taskId = reviewed(db, projectId, 'Moved elsewhere', agentId)
    if (state === 'archived') repo.setTaskArchived(db, taskId, true)
    else if (state === 'canceled' || state === 'active') {
      repo.updateRun(db, repo.getTask(db, taskId)!.currentRunId!, { status: state === 'active' ? 'running' : 'canceled' })
    } else repo.setTaskStatus(db, taskId, state)
    expect(followUp.onProjected(taskId, snapshot([pull({ mergeState: 'conflicting' })]))).toBe('left')
    expect(ports.sendBack).not.toHaveBeenCalled()
  })

it('does not act on retained, incomplete, unknown, merged or closed review PRs', () => {
  const taskId = reviewed(db, projectId, 'Awaiting review', agentId)
  const conflicting = snapshot([pull({ mergeState: 'conflicting' })])
  for (const stale of [{ ...conflicting, pullRequestNotice: 'offline' }, { ...conflicting, error: 'failed' }, { ...conflicting, preparing: true }]) {
    expect(followUp.onProjected(taskId, stale)).toBe('left')
  }
  for (const pr of [pull({ mergeState: 'unknown' }), pull({ state: 'closed', mergeState: 'conflicting' }), pull({ state: 'merged', mergeState: 'conflicting' }), pull({ check: 'pending' })]) {
    followUp.onProjected(taskId, snapshot([pr]))
  }
  expect(ports.sendBack).not.toHaveBeenCalled()
})

it('checks saved review PRs at startup and every minute even after CI passed, until a conflict queues the task', async () => {
  vi.useFakeTimers()
  const taskId = reviewed(db, projectId, 'Awaiting review', agentId)
  const clean = snapshot([pull({ check: 'success', mergeState: 'clean' })])
  repo.saveReviewSnapshot(db, taskId, clean)
  let observed = clean
  ports.refresh.mockImplementation(id => {
    followUp.onProjected(id, observed)
    return Promise.resolve(observed)
  })
  ports.sendBack.mockImplementation(id => {
    repo.setTaskStatus(db, id, 'queued')
    return true
  })
  followUp.start()
  followUp.start()
  await vi.advanceTimersByTimeAsync(0)
  expect(ports.refresh).toHaveBeenCalledTimes(1)
  expect(ports.refresh).toHaveBeenCalledWith(taskId)
  expect(ports.sendBack).not.toHaveBeenCalled()
  observed = snapshot([pull({ check: 'success', mergeState: 'conflicting' })])
  await vi.advanceTimersByTimeAsync(REVIEW_PULL_REQUEST_WATCH_MS)
  expect(ports.sendBack).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(REVIEW_PULL_REQUEST_WATCH_MS * 2)
  expect(ports.refresh).toHaveBeenCalledTimes(2)
})

it('polls open PRs and unobserved receipts, but not completed PRs or tasks without PRs', async () => {
  vi.useFakeTimers()
  reviewed(db, projectId, 'No PR', agentId)
  const closed = reviewed(db, projectId, 'Closed PR', agentId)
  repo.saveReviewSnapshot(db, closed, snapshot([pull({ state: 'closed' })]))
  repo.recordReviewEvidence(db, closed, 'pull-request', pull({}).url)
  const merged = reviewed(db, projectId, 'Merged PR', agentId)
  repo.saveReviewSnapshot(db, merged, snapshot([pull({ state: 'merged' })]))
  const receipt = reviewed(db, projectId, 'New receipt', agentId)
  repo.recordReviewEvidence(db, receipt, 'pull-request', pull({}).url)
  const open = reviewed(db, projectId, 'Open PR', agentId)
  repo.saveReviewSnapshot(db, open, snapshot([pull({})]))
  const archived = reviewed(db, projectId, 'Archived', agentId)
  repo.saveReviewSnapshot(db, archived, snapshot([pull({})]))
  repo.setTaskArchived(db, archived, true)
  followUp.start()
  await vi.advanceTimersByTimeAsync(0)
  expect(ports.refresh.mock.calls.map(([id]) => id).sort()).toEqual([receipt, open].sort())
  repo.saveReviewSnapshot(db, open, snapshot([pull({ state: 'merged' })]))
  repo.saveReviewSnapshot(db, receipt, snapshot([pull({ state: 'closed' })]))
  await vi.advanceTimersByTimeAsync(REVIEW_PULL_REQUEST_WATCH_MS)
  expect(ports.refresh).toHaveBeenCalledTimes(2)
})

it('follows current global and project conflict settings without restarting the watch', async () => {
  vi.useFakeTimers()
  const taskId = reviewed(db, projectId, 'Awaiting review', agentId)
  const conflicting = snapshot([pull({ mergeState: 'conflicting' })])
  repo.saveReviewSnapshot(db, taskId, conflicting)
  settings.pullRequestConflictEnabled = false
  followUp.start()
  await vi.advanceTimersByTimeAsync(REVIEW_PULL_REQUEST_WATCH_MS)
  expect(ports.refresh).not.toHaveBeenCalled()
  expect(followUp.onProjected(taskId, conflicting)).toBe('left')
  settings.pullRequestConflictEnabled = true
  repo.updateProject(db, projectId, { pullRequestPromptMode: 'off' })
  await vi.advanceTimersByTimeAsync(REVIEW_PULL_REQUEST_WATCH_MS)
  expect(ports.refresh).not.toHaveBeenCalled()
  repo.updateProject(db, projectId, { pullRequestPromptMode: 'custom', pullRequestConflictEnabled: true, pullRequestConflictPrompt: 'Merge {{base}}.' })
  ports.refresh.mockImplementation(id => {
    followUp.onProjected(id, conflicting)
    return Promise.resolve(conflicting)
  })
  await vi.advanceTimersByTimeAsync(REVIEW_PULL_REQUEST_WATCH_MS)
  expect(ports.sendBack).toHaveBeenCalledTimes(1)
  expect(ports.sendBack).toHaveBeenCalledWith(taskId, 'Merge main.')
})

it('retries failed reads on the next minute and continues watching other tasks', async () => {
  vi.useFakeTimers()
  const first = reviewed(db, projectId, 'Offline', agentId)
  const second = reviewed(db, projectId, 'Online', agentId)
  for (const id of [first, second]) repo.saveReviewSnapshot(db, id, snapshot([pull({})]))
  ports.refresh.mockRejectedValueOnce(new Error('offline'))
  followUp.start()
  await vi.advanceTimersByTimeAsync(0)
  expect(ports.refresh).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(REVIEW_PULL_REQUEST_WATCH_MS)
  expect(ports.refresh).toHaveBeenCalledTimes(4)
  expect(ports.sendBack).not.toHaveBeenCalled()
})

it('does not overlap slow polls or act on an in-flight result after shutdown', async () => {
  vi.useFakeTimers()
  const first = reviewed(db, projectId, 'Slow PR', agentId)
  const second = reviewed(db, projectId, 'Next PR', agentId)
  for (const id of [first, second]) repo.saveReviewSnapshot(db, id, snapshot([pull({})]))
  let finish!: (value: ReviewSnapshot) => void
  ports.refresh.mockImplementationOnce(id => new Promise<ReviewSnapshot>(resolve => { finish = resolve }).then(value => {
    followUp.onProjected(id, value)
    return value
  }))
  followUp.start()
  await vi.advanceTimersByTimeAsync(REVIEW_PULL_REQUEST_WATCH_MS * 3)
  expect(ports.refresh).toHaveBeenCalledTimes(1)
  followUp.stop()
  finish(snapshot([pull({ mergeState: 'conflicting' })]))
  await vi.advanceTimersByTimeAsync(REVIEW_PULL_REQUEST_WATCH_MS)
  expect(ports.refresh).toHaveBeenCalledTimes(1)
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
