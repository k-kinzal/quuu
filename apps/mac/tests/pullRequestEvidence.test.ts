import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CodexSessionParser } from '../src/main/agent-adapters/codex/parser.js'
import * as repo from '../src/main/db/repo.js'
import { command, git } from '../src/main/review/command.js'
import { extractReviewEvidence } from '../src/main/review/evidence.js'
import { resultStrings } from '../src/main/review/output.js'
import { reconcilePullRequests } from '../src/main/review/reconcilePullRequests.js'
import type { ObservedCommit, ReviewEvidence, VerifiedPullRequest } from '../src/main/review/types.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

vi.mock('../src/main/review/command.js', () => ({ command: vi.fn(), git: vi.fn() }))
const url = 'https://github.com/example/project/pull/584'
const head = 'a'.repeat(40)
const observed: ObservedCommit[] = [{ repository: 'example/project', sha: head }]
const fixture = readFileSync(new URL('./fixtures/sessions/codex-async-pr.jsonl', import.meta.url), 'utf8').trim().split('\n')

it('recovers the observed mixed-call and asynchronous wait incident for every ingestion boundary', () => {
  for (let split = 0; split <= fixture.length; split++) {
    const parser = new CodexSessionParser()
    parser.pushLines(fixture.slice(0, split))
    parser.pushLines(fixture.slice(split))
    const result = extractReviewEvidence(parser.messages)
    expect(result).toEqual({ commits: [], pullRequestCandidates: [url] })
    // Persisting/replaying messages, or deriving them one at a time, must not
    // require mutable execution metadata from a previous page or app lifetime.
    const copied = JSON.parse(JSON.stringify(parser.messages)) as typeof parser.messages
    expect(extractReviewEvidence(copied)).toEqual(result)
    expect([...new Set(copied.flatMap(message => extractReviewEvidence([message]).pullRequestCandidates))]).toEqual([url])
  }
})

it('decodes successful JSON, JSONL, arrays and nested result envelopes without scanning metadata', () => {
  const noise = 'https://github.com/other/repo/pull/99'
  const wrappers: Array<(value: string) => string> = [
    value => value,
    value => JSON.stringify({ output: value }),
    value => JSON.stringify([{ status: 'fulfilled', value: { exit_code: 0, output: value } }]),
    value => JSON.stringify({ content: [{ type: 'text', text: value }], input: noise, body: noise }),
    value => JSON.stringify({ output: '' }) + '\n' + JSON.stringify({ stdout: value })
  ]
  for (const outer of wrappers) for (const inner of wrappers) {
    expect(resultStrings(outer(inner(url)), true).filter(text => text === url)).toEqual([url])
    expect(resultStrings(outer(inner(url)), true)).not.toContain(noise)
  }
  expect(resultStrings([
    JSON.stringify({ status: 'rejected', value: { output: noise } }),
    JSON.stringify({ exit_code: 1, output: noise }),
    JSON.stringify({ isError: true, content: [{ text: noise }] }),
    JSON.stringify({ exit_code: 0, output: url }),
    '{"output":"' + noise
  ].join('\n'), true).filter(text => /^https:/.test(text))).toEqual([url])
})

let db: ReturnType<typeof memoryDb>
let taskId: string
let projectId: string
beforeEach(() => {
  db = memoryDb()
  projectId = makeProject(db, { name: 'Fixture', targetId: makeAgent(db, { name: 'Fixture' }), commitIdentityMode: 'off' })
  taskId = makeTask(db, projectId, 'Fixture')
  vi.mocked(git).mockResolvedValue({ code: 0, stdout: '', stderr: '' })
})
afterEach(() => { db.close(); vi.restoreAllMocks(); vi.resetAllMocks() })

function restPull(number = 584, sha = head, source = 'example/project', base = 'example/project') {
  return { number, html_url: `https://github.com/${base}/pull/${number}`, head: { sha, repo: { full_name: source } }, base: { repo: { full_name: base } } }
}
function mockGitHub(discovered: unknown[][]): void {
  vi.mocked(command).mockImplementation((_executable, args) => {
    const path = args.at(-1) ?? ''
    const value = args[0] === 'pr'
      ? { number: 584, title: 'Feedback', headRefOid: head, headRefName: 'fix/feedback', state: 'OPEN' }
      : path.includes('/commits/') ? discovered : path.includes('/files?') ? [[]] : restPull()
    return Promise.resolve({ code: 0, stderr: '', stdout: JSON.stringify(value) })
  })
}
async function reconcile(evidence: ReviewEvidence = { commits: [], pullRequestCandidates: [] }, commits = observed, verify?: (proof: VerifiedPullRequest) => void) {
  return reconcilePullRequests('/tmp', repo.getProject(db, projectId)!, DEFAULT_SETTINGS, '2026-10-03T00:00:00Z', evidence, commits, verify)
}

it('discovers a PR without any log receipt and requires the exact owned head repository and SHA', async () => {
  mockGitHub([
    [restPull(1, 'b'.repeat(40)), restPull(2, head, 'someone/fork')],
    [restPull(), restPull()]
  ])
  const verified = vi.fn()
  const result = await reconcile(undefined, observed, verified)
  expect(result.items.map(pr => pr.url)).toEqual([url])
  expect(result.notice).toBeUndefined()
  expect(verified).toHaveBeenCalledTimes(1)
  expect(verified).toHaveBeenCalledWith({ url, repository: 'example/project', headSha: head })
  expect(vi.mocked(command).mock.calls[0][1]).toEqual(['api', '--paginate', '--slurp', `repos/example/project/commits/${head}/pulls?per_page=100`])
})

it('does not attach a referenced PR or a stacked descendant that merely contains task commits', async () => {
  mockGitHub([[restPull(584, 'b'.repeat(40)), restPull(585, head, 'other/repo')]])
  const result = await reconcile({ commits: [], pullRequestCandidates: [url] })
  expect(result.items).toEqual([])
  expect(result.notice).toBeUndefined()
})

it('does not promote command text, commit prose or a fallback Git range into ownership', async () => {
  mockGitHub([[restPull()]])
  const result = await reconcile({ commits: [head], pullRequestCandidates: [url] }, [])
  expect(result.items).toEqual([])
  expect(result.notice).toBeTruthy()
  expect(command).not.toHaveBeenCalled()
})

it('can confirm an upstream fork candidate missing from commit discovery', async () => {
  mockGitHub([])
  const upstream = 'https://github.com/upstream/project/pull/584'
  const implementation = vi.mocked(command).getMockImplementation()!
  vi.mocked(command).mockImplementation((executable, args, options) => args.at(-1) === 'repos/upstream/project/pulls/584'
    ? Promise.resolve({ code: 0, stderr: '', stdout: JSON.stringify(restPull(584, head, 'example/project', 'upstream/project')) })
    : implementation(executable, args, options))
  const result = await reconcile({ commits: [], pullRequestCandidates: [upstream] })
  expect(result.items.map(pr => pr.url)).toEqual([upstream])
  expect(vi.mocked(command).mock.calls.some(call => call[1].at(-1) === 'repos/upstream/project/pulls/584')).toBe(true)
})

it.each(['failure', 'malformed', 'wrong identity'])('reports incomplete verification for %s instead of an authoritative empty answer', async kind => {
  vi.mocked(command).mockResolvedValue({ code: kind === 'failure' ? 1 : 0, stderr: 'offline',
    stdout: kind === 'malformed' ? '{}' : JSON.stringify([[{ ...restPull(), html_url: 'https://github.com/unrelated/repo/pull/584' }]]) })
  const result = await reconcile()
  expect(result.items).toEqual([])
  expect(result.notice).toBeTruthy()
})

it('persists proof separately from candidates and preserves a verified PR after log loss and GitHub failure', async () => {
  mockGitHub([[restPull()]])
  repo.recordObservedCommits(db, taskId, observed)
  await reconcile(undefined, observed, proof => repo.recordVerifiedPullRequest(db, taskId, proof))
  repo.recordReviewEvidence(db, taskId, 'pull-request', 'https://github.com/other/repo/pull/99')
  repo.clearReviewEvidence(db, taskId, 'pull-request')
  const evidence = repo.reviewEvidence(db, taskId)
  expect(evidence.pullRequestCandidates).toEqual([])
  expect(evidence.verifiedPullRequests).toEqual([{ url, repository: 'example/project', headSha: head }])
  vi.mocked(command).mockResolvedValue({ code: 1, stdout: '', stderr: 'offline' })
  const result = await reconcile(evidence, evidence.observedCommits)
  expect(result.items.map(pr => pr.url)).toEqual([url])
  expect(result.notice).toBe('offline')
})

it('bounds discovery scheduling and reports unfinished work without claiming an empty verified result', async () => {
  let now = 0
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  vi.mocked(command).mockImplementation(() => {
    now = 21_000
    return Promise.resolve({ code: 0, stdout: '[]', stderr: '' })
  })
  const commits = Array.from({ length: 5 }, (_, i) => ({ repository: 'example/project', sha: (i + 1).toString(16).repeat(40) }))
  const result = await reconcile(undefined, commits)
  expect(command).toHaveBeenCalledTimes(4)
  expect(result.items).toEqual([])
  expect(result.notice).toBeTruthy()
})

it('never derives review evidence from a user message even when it carries tool-shaped content', () => {
  const parser = new CodexSessionParser()
  parser.pushLines(fixture)
  expect(extractReviewEvidence(parser.messages.map(message => ({ ...message, role: 'user' })))).toEqual({ commits: [], pullRequestCandidates: [] })
})
