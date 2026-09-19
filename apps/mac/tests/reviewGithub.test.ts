import { afterEach, expect, it, vi } from 'vitest'
import { pullRequests } from '../src/main/review/github.js'
import { command, git } from '../src/main/review/command.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import * as repo from '../src/main/db/repo.js'
import { makeAgent, makeProject, memoryDb } from './helpers.js'

vi.mock('../src/main/review/command.js', () => ({ command: vi.fn(), git: vi.fn() }))
afterEach(() => vi.resetAllMocks())

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
      '2026-09-09T00:00:00Z', ['https://github.com/upstream/repo/pull/42', 'https://github.com/upstream/repo/pull/42', 'https://example.invalid/other/repo/pull/99'])
    expect(result.items).toHaveLength(1)
    expect(result.items[0].files).toHaveLength(101)
    expect(result.items[0].files.at(-1)).toEqual({ path: 'renamed.ts', previousPath: 'old.ts', change: 'renamed' })
    expect(vi.mocked(command).mock.calls.map(call => call[1])).toEqual([
      ['pr', 'view', 'https://github.com/upstream/repo/pull/42', '--json', 'number,title,url,headRefName,baseRefName,headRefOid,isDraft,updatedAt,statusCheckRollup'],
      ['api', '--paginate', '--slurp', 'repos/upstream/repo/pulls/42/files?per_page=100']
    ])
  } finally { db.close() }
})


it('keeps a creation receipt visible when GitHub rejects the first fetch', async () => {
  const db = memoryDb()
  try {
    const agent = makeAgent(db, { name: 'Fixture' })
    const project = makeProject(db, { name: 'Fixture', targetId: agent, commitIdentityMode: 'off' })
    vi.mocked(command).mockResolvedValue({ code: 1, stdout: '', stderr: 'offline' })
    const result = await pullRequests('/tmp', repo.getProject(db, project)!, DEFAULT_SETTINGS, '2026-09-09T00:00:00Z', ['https://github.com/upstream/repo/pull/42'])
    expect(result.items).toMatchObject([{ number: 42, url: 'https://github.com/upstream/repo/pull/42', files: [] }])
    expect(result.notice).toBe('offline')
  } finally { db.close() }
})
