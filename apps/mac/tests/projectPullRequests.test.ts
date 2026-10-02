import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { ReviewOperations } from '../src/main/review/operations.js'
import { ReviewService } from '../src/main/review/service.js'
import type { ReviewPullRequest, ReviewSnapshot } from '../src/main/review/types.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { ProjectPullRequest } from '../src/api/schemas/review.js'
import { countByState, DEFAULT_STATE_FILTER, groupProjectPullRequests } from '../src/renderer/src/model/projectPullRequests.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

function pull(number: number, over: Partial<ReviewPullRequest> = {}): ReviewPullRequest {
  return { number, title: `PR ${String(number)}`, url: `https://github.com/owner/repo/pull/${String(number)}`,
    headRefName: `branch-${String(number)}`, baseRefName: 'main', headSha: 'a'.repeat(40), draft: false,
    updatedAt: '2026-09-01T00:00:00Z', check: 'success', mergeState: 'clean', state: 'open',
    files: [{ path: 'src/index.ts', change: 'modified' }], ...over }
}
function snapshot(pullRequests: ReviewPullRequest[]): ReviewSnapshot {
  return { cwd: '/tmp', branch: 'main', repository: 'owner/repo', tree: [], changes: [], stagedChanges: [], stagedRevision: null,
    localChanges: [], revision: null, localRevision: null, commits: [], pullRequests, coverage: null, projectTasks: [] }
}

describe('a project’s Pull Requests', () => {
  let db: Db
  let operations: ReviewOperations
  let projectId: string
  let otherProjectId: string
  beforeEach(() => {
    db = memoryDb()
    const agentId = makeAgent(db, { name: 'Fixture' })
    projectId = makeProject(db, { name: 'Fixture', targetId: agentId })
    otherProjectId = makeProject(db, { name: 'Other', targetId: agentId })
    operations = new ReviewOperations(db, () => DEFAULT_SETTINGS, new ReviewService(), () => ({ dir: '/tmp', project: repo.getProject(db, projectId)! }))
  })
  afterEach(() => { operations.stop(); db.close(); vi.restoreAllMocks() })

  it('gathers what the tasks’ saved reviews keep, once per Pull Request, naming every task and leaving out the files', () => {
    const first = makeTask(db, projectId, 'Write the parser')
    const second = makeTask(db, projectId, 'Fix the parser CI')
    const archived = makeTask(db, projectId, 'Archived work')
    const elsewhere = makeTask(db, otherProjectId, 'Other project')
    repo.saveReviewSnapshot(db, first, snapshot([pull(1, { check: 'pending' }), pull(2, { state: 'merged' })]))
    // The task that looked later saw CI finish; its copy is the one shown.
    repo.saveReviewSnapshot(db, second, snapshot([pull(1, { check: 'failure', updatedAt: '2026-09-02T00:00:00Z' })]))
    repo.saveReviewSnapshot(db, archived, snapshot([pull(3)]))
    repo.setTaskArchived(db, archived, true)
    repo.saveReviewSnapshot(db, elsewhere, snapshot([pull(4)]))

    const listed = operations.projectPullRequests(projectId)
    expect(listed.map(pr => pr.number).sort()).toEqual([1, 2])
    const shared = listed.find(pr => pr.number === 1)!
    expect(shared).toMatchObject({ check: 'failure', updatedAt: '2026-09-02T00:00:00Z',
      tasks: [{ id: first, title: 'Write the parser' }, { id: second, title: 'Fix the parser CI' }] })
    expect(shared).not.toHaveProperty('files')
  })

  it('reads projections saved before merge and close states were kept as open with an unknown merge state', () => {
    const task = makeTask(db, projectId, 'Old projection')
    const { mergeState: _mergeState, state: _state, ...old } = pull(5)
    repo.saveReviewSnapshot(db, task, snapshot([old as ReviewPullRequest]))
    expect(operations.projectPullRequests(projectId)).toMatchObject([{ number: 5, state: 'open', mergeState: 'unknown' }])
  })

  it('looks again only at tasks whose Pull Requests are still open', async () => {
    const open = makeTask(db, projectId, 'Open')
    const merged = makeTask(db, projectId, 'Merged')
    repo.saveReviewSnapshot(db, open, snapshot([pull(1)]))
    repo.saveReviewSnapshot(db, merged, snapshot([pull(2, { state: 'merged' })]))
    const requested = vi.spyOn(operations, 'requestRefresh').mockImplementation(() => undefined)
    const listed = await operations.refreshProjectPullRequests(projectId)
    expect(requested.mock.calls).toEqual([[open]])
    expect(listed).toHaveLength(2)
  })
})

describe('the project’s Pull Request list', () => {
  const entry = (number: number, state: ProjectPullRequest['state'], updatedAt: string, task = 'Task'): ProjectPullRequest => {
    const { files: _files, ...rest } = pull(number, { state, updatedAt })
    return { ...rest, tasks: [{ id: `t${String(number)}`, title: task }] }
  }

  it('puts open ones first, then merged, then closed, the latest update first within each and no empty heading', () => {
    const groups = groupProjectPullRequests([
      entry(1, 'closed', '2026-09-05'), entry(2, 'open', '2026-09-01'), entry(3, 'merged', '2026-09-03'), entry(4, 'open', '2026-09-04')
    ])
    expect(groups.map(group => [group.state, group.pullRequests.map(pr => pr.number)])).toEqual([
      ['open', [4, 2]], ['merged', [3]], ['closed', [1]]
    ])
    expect(groupProjectPullRequests([entry(1, 'merged', '2026-09-01')]).map(group => group.state)).toEqual(['merged'])
  })

  it('starts on open ones alone, shows only the picked state, and counts each state for the filter', () => {
    const list = [entry(1, 'open', '2026-09-01'), entry(2, 'merged', '2026-09-02'), entry(3, 'closed', '2026-09-03'), entry(4, 'open', '2026-09-04')]
    expect(DEFAULT_STATE_FILTER).toBe('open')
    const shown = (filter: Parameters<typeof groupProjectPullRequests>[2]): number[] =>
      groupProjectPullRequests(list, '', filter).flatMap(group => group.pullRequests.map(pr => pr.number))
    expect(shown('open')).toEqual([4, 1])
    expect(shown('merged')).toEqual([2])
    expect(shown('closed')).toEqual([3])
    expect(shown('all')).toEqual([4, 1, 2, 3])
    expect(countByState(list)).toEqual({ open: 2, merged: 1, closed: 1, all: 4 })
  })

  it('finds a Pull Request by its number, title, branch or the task that made it', () => {
    const list = [entry(12, 'open', '2026-09-01', 'Parser rewrite'), entry(34, 'open', '2026-09-02', 'Docs')]
    const numbers = (query: string): number[] => groupProjectPullRequests(list, query).flatMap(group => group.pullRequests.map(pr => pr.number))
    expect(numbers('#12')).toEqual([12])
    expect(numbers('pr 34')).toEqual([34])
    expect(numbers('branch-12')).toEqual([12])
    expect(numbers('parser')).toEqual([12])
    expect(numbers('nothing')).toEqual([])
  })
})
