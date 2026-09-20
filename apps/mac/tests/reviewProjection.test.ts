import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { extractReviewEvidence } from '../src/main/review/evidence.js'
import { ReviewOperations } from '../src/main/review/operations.js'
import { ReviewService } from '../src/main/review/service.js'
import type { ReviewSnapshot } from '../src/main/review/types.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { SessionMessage } from '../src/main/session/types.js'
import { makeAgent, makeProject, makeTask, memoryDb, occupy } from './helpers.js'

function snapshot(): ReviewSnapshot {
  return { cwd: '/tmp', branch: 'main', repository: 'owner/repo', tree: [], changes: [], stagedChanges: [], stagedRevision: null, localChanges: [], revision: null, localRevision: null, commits: [], pullRequests: [], coverage: null, projectTasks: [] }
}
function tool(result: string | null, name = 'Bash', input: unknown = { command: 'git commit -m finished' }): SessionMessage {
  return { id: 'tool', role: 'assistant', isSidechain: false, timestamp: null, model: null,
    blocks: [{ kind: 'tool', tool: { id: 'call', name, input, target: null, result, isError: false, images: [] } }] }
}

it('extracts successful git and PR receipts from wrapped command output, excluding prompts and proposed commands', () => {
  expect(extractReviewEvidence([
    tool(null), tool('fatal: nothing to commit'),
    tool(JSON.stringify({ output: '[detached HEAD abcdef123] finished\n 1 file changed' })),
    tool('[main (root-commit) 1234567] first'),
    tool('https://github.com/owner/repo/pull/42', 'exec', { cmd: 'gh pr create' }),
    { ...tool('[main badcafe] example'), role: 'user' },
    tool('[main deadbee] fixture text', 'Read', { file_path: 'test.txt' }),
    { ...tool(null), blocks: [{ kind: 'thinking', text: 'I could open https://github.com/owner/repo/pull/99' }] }
  ])).toEqual({ commits: ['abcdef123', '1234567'], pullRequests: ['https://github.com/owner/repo/pull/42'] })
})

it('does not turn fixture URLs read through shell tools or quoted in conversation into PRs', () => {
  const url = 'https://github.com/openai/quuu/pull/42'
  const source = `pullRequests: [{ number: 42, url: '${url}' }]`
  expect(extractReviewEvidence([
    tool(source, 'exec_command', { cmd: 'cat apps/mac/tests/workbenchUi.test.tsx' }),
    tool(JSON.stringify({ i: 1, result: { status: 'fulfilled', value: { code: 0, output: source } } }),
      'exec_command', 'text(await tools.exec_command({cmd: "cat apps/mac/tests/workbenchUi.test.tsx"}))'),
    tool(url, 'Bash', { command: 'cat README.md' }),
    tool(url, 'Read', { file_path: 'gh pr create.txt' }),
    { ...tool(null), blocks: [{ kind: 'text', text: `Example: ${url}\n\n\`\`\`ts\n${source}\n\`\`\`` }] }
  ]).pullRequests).toEqual([])
})

it('keeps plain, nested JSON and API creation receipts without counting PR bodies or failed results', () => {
  const url = 'https://github.com/upstream/repo/pull/42'
  const sample = 'https://github.com/example/repo/pull/99'
  const failed = tool(url, 'Bash', { command: 'gh pr create' })
  const block = failed.blocks[0]
  if (block.kind === 'tool') block.tool.isError = true
  expect(extractReviewEvidence([
    tool(`Creating pull request\n${url}\n`, 'Bash', { command: 'gh pr create' }),
    tool(JSON.stringify({ value: { exit_code: 0, output: JSON.stringify({ url, body: sample }) } }),
      'exec_command', 'text(await tools.exec_command({cmd: "gh pr view --json url,body"}))'),
    tool(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ html_url: url, body: sample }) }] }),
      'mcp__codex_apps__github_create_pull_request', {}),
    tool(JSON.stringify({ exit_code: 1, output: sample }), 'exec_command', { cmd: 'gh pr view' }),
    tool(JSON.stringify({ isError: true, content: [{ text: sample }] }), 'create_pull_request', {}),
    failed
  ]).pullRequests).toEqual([url])
})

/**
 * Reading a Pull Request is not producing one.
 *
 * `gh pr view <url>` is how an agent goes and looks at somebody else's Pull Request - the
 * upstream issue behind a dependency, another project of the same person - and it prints the URL
 * straight back, which is the same shape as the receipt `gh pr create` leaves. Taken as a
 * receipt, that Pull Request becomes the task's own work: it opens as a tab on the task and the
 * change report is told this is what the work produced.
 */
it('does not take a Pull Request the command went to look at as the work of this task', () => {
  const foreign = 'https://github.com/other/project/pull/7'
  const own = 'https://github.com/owner/repo/pull/42'
  expect(extractReviewEvidence([
    tool(foreign, 'Bash', { command: `gh pr view ${foreign}` }),
    tool(JSON.stringify({ value: { exit_code: 0, output: foreign } }), 'exec_command',
      `text(await tools.exec_command({cmd: "gh pr view ${foreign}/files --json url"}))`),
    tool(foreign, 'Bash', { command: 'gh pr view 7 --repo other/project' }),
    // The branch the run is standing on names nothing, and acting on one is doing it
    tool(own, 'Bash', { command: 'gh pr view --json url' })
  ]).pullRequests).toEqual([own])
})

it('keeps a Pull Request the run acted on even when the command named it', () => {
  const url = 'https://github.com/owner/repo/pull/39'
  expect(extractReviewEvidence([
    tool(`Merging pull request\n${url}\n`, 'Bash', { command: `gh pr merge ${url} --squash` })
  ]).pullRequests).toEqual([url])
})

let db: ReturnType<typeof memoryDb>
let service: ReviewService
let operations: ReviewOperations
let taskId: string
let projectId: string
beforeEach(() => {
  db = memoryDb()
  const agentId = makeAgent(db, { name: 'Fixture' })
  projectId = makeProject(db, { name: 'Fixture', targetId: agentId })
  taskId = makeTask(db, projectId, 'Fixture')
  occupy(db, taskId, agentId)
  repo.insertTaskReviewBase(db, { taskId, cwd: '/tmp', startedAt: new Date().toISOString(), baseHead: 'a'.repeat(40), baseTree: 'b'.repeat(40) })
  service = new ReviewService()
  vi.spyOn(service, 'retain').mockResolvedValue(undefined)
  operations = new ReviewOperations(db, () => DEFAULT_SETTINGS, service, () => ({ dir: '/tmp', project: repo.getProject(db, projectId)! }))
})
afterEach(() => { operations.stop(); db.close(); vi.restoreAllMocks() })

it('returns a saved review after restart without executing Git or GitHub', () => {
  repo.saveReviewSnapshot(db, taskId, snapshot())
  const compute = vi.spyOn(service, 'snapshot')
  const infer = vi.spyOn(service, 'inferBaseline')
  expect(operations.reviewSnapshot(taskId)).toEqual(snapshot())
  expect(compute).not.toHaveBeenCalled()
  expect(infer).not.toHaveBeenCalled()
})

it('refreshes legacy combined changes while preserving saved commits during the upgrade', async () => {
  const legacy = { ...snapshot(), uncommittedChanges: [{ path: 'result.ts', change: 'modified' }],
    uncommittedRevision: { base: 'a'.repeat(40), head: 'b'.repeat(40) } }
  legacy.commits = [{ sha: 'a'.repeat(40), shortSha: 'aaaaaaa', subject: 'Saved commit', author: 'Fixture', committedAt: '', files: [] }]
  for (const key of ['localChanges', 'localRevision', 'stagedChanges', 'stagedRevision']) Reflect.deleteProperty(legacy, key)
  repo.saveReviewSnapshot(db, taskId, legacy)
  vi.spyOn(service, 'snapshot').mockResolvedValue(snapshot())
  const preparing = operations.reviewSnapshot(taskId)
  expect(preparing.preparing).toBe(true)
  expect(preparing.localChanges).toEqual([])
  expect(preparing.stagedChanges).toEqual([])
  expect(preparing.commits).toEqual(legacy.commits)
  const refreshed = await operations.refresh(taskId)
  expect(refreshed.preparing).not.toBe(true)
  expect(refreshed.commits).toEqual(legacy.commits)
})

it('publishes local review data while GitHub is still pending and coalesces simultaneous refreshes', async () => {
  let finish!: (value: ReviewSnapshot) => void
  let localReady!: () => void
  const observed = new Promise<void>(resolve => { localReady = resolve })
  const compute = vi.spyOn(service, 'snapshot').mockImplementation(async (_cwd, _project, _settings, _baseline, _evidence, local) => {
    await local?.({ ...snapshot(), changes: [{ path: 'result.ts', change: 'added' }] })
    localReady()
    return new Promise(resolve => { finish = resolve })
  })
  expect(operations.reviewSnapshot(taskId).preparing).toBe(true)
  const refresh = operations.refresh(taskId)
  await observed
  expect(operations.reviewSnapshot(taskId).changes).toEqual([{ path: 'result.ts', change: 'added' }])
  expect(compute).toHaveBeenCalledTimes(1)
  finish(snapshot())
  await refresh
  expect(compute).toHaveBeenCalledTimes(1)
})

it('retains recorded commits and PRs when HEAD changes and GitHub is temporarily unavailable', async () => {
  const old = snapshot()
  old.commits = [{ sha: 'a'.repeat(40), shortSha: 'aaaaaaa', subject: 'Created in this session', author: 'Fixture', committedAt: '2026-09-09T00:00:00Z', files: [] }]
  old.pullRequests = [{ number: 42, title: 'Created in this session', url: 'https://github.com/owner/repo/pull/42', headRefName: 'feature', baseRefName: 'main', headSha: 'a'.repeat(40), draft: false, updatedAt: '', check: 'neutral', files: [] }]
  repo.saveReviewSnapshot(db, taskId, old)
  vi.spyOn(service, 'snapshot').mockResolvedValue({ ...snapshot(), pullRequestNotice: 'offline' })
  const saved = await operations.refresh(taskId)
  expect(saved.commits).toEqual(old.commits)
  expect(saved.pullRequests).toEqual(old.pullRequests)
  expect(saved.pullRequestNotice).toBe('offline')
})

it('does not resurrect a task deleted while its review is being computed', async () => {
  let finish!: (value: ReviewSnapshot) => void
  vi.spyOn(service, 'snapshot').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const work = operations.refresh(taskId)
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  repo.deleteTask(db, taskId)
  operations.stop()
  finish(snapshot())
  await expect(work).rejects.toThrow('Task not found')
  expect(repo.getReviewSnapshot(db, taskId)).toBeNull()
})
