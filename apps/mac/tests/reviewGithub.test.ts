import { afterEach, expect, it, vi } from 'vitest'
import { pullRequests } from '../src/main/review/github.js'
import { command, git } from '../src/main/review/command.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import * as repo from '../src/main/db/repo.js'
import { makeAgent, makeProject, memoryDb } from './helpers.js'

vi.mock('../src/main/review/command.js', () => ({ command: vi.fn(), git: vi.fn() }))
afterEach(() => vi.resetAllMocks())
const proof = (url: string) => ({ url, repository: 'owner/repo', headSha: 'a'.repeat(40) })

it('fetches recorded PRs from the upstream repository after a branch switch and includes every page of files', async () => {
  const db = memoryDb()
  try {
    const agent = makeAgent(db, { name: 'Fixture' })
    const projectId = makeProject(db, { name: 'Fixture', targetId: agent, commitIdentityMode: 'off' })
    vi.mocked(git).mockResolvedValue({ code: 0, stdout: 'git@github.com:owner/repo.git\n', stderr: '' })
    vi.mocked(command).mockImplementation((_executable, args) => {
      if (args[0] === 'pr') return Promise.resolve({ code: 0, stderr: '', stdout: JSON.stringify({ number: 42, title: 'Merged earlier', url: 'https://github.com/upstream/repo/pull/42', updatedAt: '2020-01-01T00:00:00Z', headRefName: 'deleted-branch', headRefOid: 'a'.repeat(40), statusCheckRollup: [] }) })
      return Promise.resolve({ code: 0, stderr: '', stdout: JSON.stringify([
        Array.from({ length: 100 }, (_, i) => ({ filename: `file-${i}.ts`, status: 'added' })),
        [{ filename: 'renamed.ts', previous_filename: 'old.ts', status: 'renamed' }]
      ]) })
    })
    const result = await pullRequests('/tmp', repo.getProject(db, projectId)!, DEFAULT_SETTINGS,
      '2026-09-09T00:00:00Z', ['https://github.com/upstream/repo/pull/42', 'https://github.com/upstream/repo/pull/42', 'https://example.invalid/other/repo/pull/99'].map(proof))
    expect(result.items).toHaveLength(1)
    expect(result.items[0].files).toHaveLength(101)
    expect(result.items[0].files.at(-1)).toEqual({ path: 'renamed.ts', previousPath: 'old.ts', change: 'renamed' })
    expect(vi.mocked(command).mock.calls.map(call => call[1])).toEqual([
      ['pr', 'view', 'https://github.com/upstream/repo/pull/42', '--json', 'number,title,url,headRefName,baseRefName,headRefOid,isDraft,updatedAt,statusCheckRollup,mergeable,mergeStateStatus,state'],
      ['api', '--paginate', '--slurp', 'repos/upstream/repo/pulls/42/files?per_page=100']
    ])
  } finally { db.close() }
})


it('keeps a verified association visible when GitHub rejects the first fetch', async () => {
  const db = memoryDb()
  try {
    const agent = makeAgent(db, { name: 'Fixture' })
    const project = makeProject(db, { name: 'Fixture', targetId: agent, commitIdentityMode: 'off' })
    vi.mocked(command).mockResolvedValue({ code: 1, stdout: '', stderr: 'offline' })
    const result = await pullRequests('/tmp', repo.getProject(db, project)!, DEFAULT_SETTINGS, '2026-09-09T00:00:00Z', [proof('https://github.com/upstream/repo/pull/42')])
    expect(result.items).toMatchObject([{ number: 42, url: 'https://github.com/upstream/repo/pull/42', files: [] }])
    expect(result.notice).toBe('offline')
  } finally { db.close() }
})


/**
 * Whether the branch still merges is a separate answer from CI. GitHub gives it twice
 * (`mergeable`, `mergeStateStatus`); either saying conflict is enough, and anything short of a
 * plain yes - not computed yet, base moved - is not a conflict the agent can resolve.
 */
it('reads the merge state and whether the PR is still open beside the CI rollup', async () => {
  const db = memoryDb()
  try {
    const agent = makeAgent(db, { name: 'Fixture' })
    const project = makeProject(db, { name: 'Fixture', targetId: agent, commitIdentityMode: 'off' })
    vi.mocked(git).mockResolvedValue({ code: 0, stdout: 'git@github.com:owner/repo.git\n', stderr: '' })
    const pr = (number: number, extra: Record<string, unknown>) => ({ number, title: `PR ${String(number)}`, url: `https://github.com/owner/repo/pull/${String(number)}`,
      updatedAt: '2026-09-10T00:00:00Z', headRefName: 'feature', baseRefName: 'main', headRefOid: 'a'.repeat(40), isDraft: false, files: [], ...extra })
    const pulls = [
      pr(1, { state: 'OPEN', mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY', statusCheckRollup: [{ status: 'IN_PROGRESS' }] }),
      pr(2, { state: 'OPEN', mergeable: 'MERGEABLE', mergeStateStatus: 'BLOCKED', statusCheckRollup: [{ conclusion: 'FAILURE' }] }),
      pr(3, { state: 'MERGED', mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN', statusCheckRollup: [{ conclusion: 'SUCCESS' }] }),
      pr(4, { state: 'CLOSED', mergeable: 'MERGEABLE', mergeStateStatus: 'DIRTY', statusCheckRollup: [] })
    ]
    vi.mocked(command).mockImplementation((_executable, args) => Promise.resolve({ code: 0, stderr: '', stdout: JSON.stringify(args[0] === 'pr' ? pulls.find(item => item.url === args[2]) : [[]]) }))
    const result = await pullRequests('/tmp', repo.getProject(db, project)!, DEFAULT_SETTINGS, '2026-09-09T00:00:00Z', pulls.map(item => proof(item.url)))
    expect(result.items.map(item => [item.number, item.check, item.mergeState, item.state])).toEqual([
      [1, 'pending', 'conflicting', 'open'],
      [2, 'failure', 'clean', 'open'],
      [3, 'success', 'unknown', 'merged'],
      [4, 'neutral', 'conflicting', 'closed']
    ])
    expect(vi.mocked(command).mock.calls[0]?.[1]).toContain('number,title,url,headRefName,baseRefName,headRefOid,isDraft,updatedAt,statusCheckRollup,mergeable,mergeStateStatus,state')
  } finally { db.close() }
})
