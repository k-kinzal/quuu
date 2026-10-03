import { appendFileSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { ClaudeSessionParser } from '../src/main/agent-adapters/claude/parser.js'
import { SessionIndex, SESSION_PAGE, SESSION_WINDOW, sessionKey } from '../src/main/session/index.js'
import { sessionReadTarget } from '../src/main/session/sessionAttach.js'
import { SessionView } from '../src/main/session/view.js'
import { recordSessionEvidence, reviewEvidenceDerivation } from '../src/main/review/evidence.js'
import { DERIVATION_VERSION } from '../src/main/session/derive.js'
import { isolateSessionDirs, makeAgent, makeProject, makeTask, memoryDb, occupy, releaseSessionDirs } from './helpers.js'

let dir: string
let db: ReturnType<typeof memoryDb>
let index: SessionIndex
let view: SessionView
let runId: string
let taskId: string
let logPath: string
const line = (value: unknown): string => JSON.stringify(value) + '\n'
const message = (id: number): string => line({ type: id % 2 ? 'assistant' : 'user', uuid: `m${id}`, message: { content: [{ type: 'text', text: `Message ${id} 日本語` }] } })
const history = (count: number): string => Array.from({ length: count }, (_, i) => message(i)).join('')

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-session-index-'))
  isolateSessionDirs(dir)
  db = memoryDb()
  const agentId = makeAgent(db, { name: 'Claude', logAdapter: 'claude' })
  const projectId = makeProject(db, { name: 'Fixture', path: dir, targetId: agentId })
  taskId = makeTask(db, projectId, 'Fixture')
  logPath = join(dir, 'session.jsonl')
  runId = occupy(db, taskId, agentId, { stdoutLogPath: join(dir, 'stdout.log') })
  repo.updateRun(db, runId, { sessionLogPath: logPath })
  index = new SessionIndex(db, [reviewEvidenceDerivation])
  view = new SessionView(db, index)
})
afterEach(async () => {
  view.closeSession()
  index.stop()
  await index.settled()
  db.close()
  releaseSessionDirs()
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

it('opens the latest bounded tail immediately and indexes history without monopolizing the event loop', async () => {
  writeFileSync(logPath, history(6000))
  const parse = vi.spyOn(ClaudeSessionParser.prototype, 'pushLines')
  const first = view.loadSession(runId)
  expect(first.messages).toHaveLength(SESSION_PAGE)
  expect(first.messages.at(-1)?.blocks).toEqual([{ kind: 'text', text: 'Message 5999 日本語' }])
  expect(first.hasMore).toBe(true)
  const parsedBytes = parse.mock.calls.flatMap(call => call[0]).join('\n').length
  expect(parsedBytes).toBeLessThan(256 * 1024)
  let turns = 0
  const timer = setInterval(() => { turns++ }, 0)
  await index.settled()
  clearInterval(timer)
  expect(turns).toBeGreaterThan(1)
  const ready = view.loadSession(runId)
  expect(ready.totalMessages).toBe(6000)
  expect(ready.messages.at(-1)?.id).toBe('m5999')
  expect(ready.indexing).toBe(false)
})

it('pages in both directions with a bounded window, no gaps, and a direct return to latest', async () => {
  writeFileSync(logPath, history(1037))
  view.loadSession(runId)
  await index.settled()
  let current = view.loadSession(runId)
  const seen = new Set(current.messages.map(item => item.id))
  while (current.hasMore) {
    current = await view.loadMoreSession(runId)
    expect(current.messages.length).toBeLessThanOrEqual(SESSION_WINDOW)
    current.messages.forEach(item => seen.add(item.id))
  }
  expect(seen.size).toBe(1037)
  expect(current.first).toBe(0)
  expect(current.hasNewer).toBe(true)
  while (current.hasNewer) {
    const previousLast = current.last!
    current = await view.loadMoreSession(runId, 'newer')
    expect(current.last).toBeGreaterThan(previousLast)
    expect(current.messages.length).toBeLessThanOrEqual(SESSION_WINDOW)
  }
  await view.loadMoreSession(runId, 'older')
  const latest = await view.loadMoreSession(runId, 'latest')
  expect(latest.messages).toHaveLength(SESSION_PAGE)
  expect(latest.messages.at(-1)?.id).toBe('m1036')
})

it('reopens durable pages and images without parsing the original log again', async () => {
  writeFileSync(logPath, line({ type: 'user', uuid: 'image', message: { content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } }] } }))
  view.loadSession(runId)
  await index.settled()
  view.closeSession()
  index.stop()
  index = new SessionIndex(db)
  view = new SessionView(db, index)
  const parse = vi.spyOn(ClaudeSessionParser.prototype, 'pushLines')
  const cached = view.loadSession(runId)
  const block = cached.messages[0].blocks[0]
  if (block.kind !== 'image') throw new Error('missing image')
  expect(view.sessionImage(block.image.id)).toBe('data:image/png;base64,aGVsbG8=')
  await index.settled()
  expect(parse).not.toHaveBeenCalled()
})

it.each([false, true])('rebuilds outdated PR evidence from bounded cached pages, even with a missing log (%s)', async missing => {
  const url = 'https://github.com/upstream/repo/pull/42'
  writeFileSync(logPath, history(300) +
    line({ type: 'assistant', uuid: 'pr', message: { content: [{ type: 'tool_use', id: 'create-pr', name: 'Bash', input: { command: 'cd /tmp/worktree\ngh pr create' } }] } }) +
    line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'create-pr', content: `${url}\nShell cwd was reset to /tmp/project` }] } }))
  view.loadSession(runId)
  await index.settled()
  const run = repo.getRun(db, runId)!
  const target = sessionReadTarget(db, run)
  const key = sessionKey(target)
  repo.finishSessionEvidence(db, key, 3)
  db.prepare("DELETE FROM task_review_evidence WHERE task_id = ? AND kind = 'pull-request'").run(taskId)
  if (missing) rmSync(logPath)
  view.closeSession()
  index.stop()
  const receive = vi.fn((source: typeof run, messages: Parameters<typeof recordSessionEvidence>[2]) => recordSessionEvidence(db, source.taskId, messages))
  index = new SessionIndex(db, [{ ...reviewEvidenceDerivation, apply: (_db, source, batch) => receive(source, batch.messages) }])
  const parse = vi.spyOn(ClaudeSessionParser.prototype, 'pushLines')
  const indexed = vi.fn()
  index.on('indexed', indexed)
  index.request(run, target)
  await index.settled()
  expect(parse).not.toHaveBeenCalled()
  expect(receive.mock.calls).toHaveLength(4)
  expect(receive.mock.calls.every(call => call[1].length <= SESSION_PAGE)).toBe(true)
  expect(repo.reviewEvidence(db, taskId).pullRequestCandidates).toEqual([url])
  expect(repo.getSessionIndex(db, key)?.evidenceVersion).toBe(DERIVATION_VERSION)
  expect(indexed).toHaveBeenCalledWith(key, taskId)
  receive.mockClear()
  index.request(run, target)
  await index.settled()
  expect(receive).not.toHaveBeenCalled()
})

/**
 * A corrected rule has to be able to take something away.
 *
 * What is filed against a task was recorded by the rule of the day, and re-reading that only ever
 * adds leaves the Pull Requests a later rule rejects sitting on the task forever. The task is the
 * unit, not the session: a task that ran twice must not have its second reading wipe what the
 * first one just re-derived.
 */
it('rebuilds candidates across every session without claiming ownership', async () => {
  const foreign = 'https://github.com/other/project/pull/7'
  const own = 'https://github.com/upstream/repo/pull/42'
  const followUp = 'https://github.com/upstream/repo/pull/43'
  const receipt = (id: string, command: string, url: string): string =>
    line({ type: 'assistant', uuid: id, message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } }) +
    line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: url }] } })
  writeFileSync(logPath, receipt('read', `gh pr view ${foreign}`, foreign) + receipt('made', 'gh pr create', own))
  const second = join(dir, 'follow-up.jsonl')
  const agentId = repo.getRun(db, runId)!.agentId
  const laterId = occupy(db, taskId, agentId, { stdoutLogPath: join(dir, 'follow-up.log'), kind: 'followup' })
  repo.updateRun(db, laterId, { sessionLogPath: second })
  writeFileSync(second, receipt('again', 'gh pr create', followUp))
  const runs = [repo.getRun(db, runId)!, repo.getRun(db, laterId)!]
  for (const run of runs) index.request(run, sessionReadTarget(db, run))
  await index.settled()
  expect(repo.reviewEvidence(db, taskId).pullRequestCandidates.sort()).toEqual([foreign, own, followUp].sort())

  // What the old rule left behind: the Pull Request the run only went to look at
  repo.recordReviewEvidence(db, taskId, 'pull-request', foreign)
  for (const run of runs) repo.finishSessionEvidence(db, sessionKey(sessionReadTarget(db, run)), 0)
  for (const run of runs) index.request(run, sessionReadTarget(db, run))
  await index.settled()
  expect(repo.reviewEvidence(db, taskId).pullRequestCandidates.sort()).toEqual([foreign, own, followUp].sort())
})

it('joins a late tool result across hundreds of messages and records its commit at ingestion', async () => {
  const call = line({ type: 'assistant', uuid: 'commit', message: { content: [{ type: 'tool_use', id: 'call', name: 'Bash', input: { command: 'git commit -m finished' } }] } })
  writeFileSync(logPath, call + history(800))
  view.loadSession(runId)
  await index.settled()
  const writes = vi.spyOn(repo, 'writeSessionMessages')
  appendFileSync(logPath, line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'call', content: '[main 123abcd] finished\n 1 file changed' }] } }))
  index.request(repo.getRun(db, runId)!)
  await index.settled()
  let page = view.loadSession(runId)
  while (page.hasMore) page = await view.loadMoreSession(runId)
  const tool = page.messages[0].blocks[0]
  expect(tool.kind === 'tool' && tool.tool.result).toContain('[main 123abcd]')
  expect(repo.reviewEvidence(db, taskId).commits).toEqual(['123abcd'])
  expect(writes.mock.calls.reduce((total, call) => total + call[4].length, 0)).toBe(1)
})

it('indexes an async PR wait across pages and rederives its candidate after restart without its source', async () => {
  const lines = readFileSync(new URL('./fixtures/sessions/codex-async-pr.jsonl', import.meta.url), 'utf8').trim().split('\n')
  const url = 'https://github.com/example/project/pull/584'
  const codex = makeAgent(db, { name: 'Codex', logAdapter: 'codex' })
  runId = occupy(db, taskId, codex, { stdoutLogPath: join(dir, 'codex-stdout.log') })
  repo.updateRun(db, runId, { sessionLogPath: logPath })
  const run = repo.getRun(db, runId)!
  writeFileSync(logPath, lines.slice(0, 2).join('\n') + '\n')
  index.request(run)
  await index.settled()
  expect(repo.reviewEvidence(db, taskId).pullRequestCandidates).toEqual([])
  appendFileSync(logPath, Array.from({ length: 300 }, (_, i) => line({ type: 'response_item', payload: {
    type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `Work ${i}` }]
  } })).join('') + lines.slice(2).join('\n') + '\n')
  index.request(run)
  await index.settled()
  expect(repo.reviewEvidence(db, taskId).pullRequestCandidates).toEqual([url])
  const target = sessionReadTarget(db, run)
  repo.finishSessionEvidence(db, sessionKey(target), 4)
  repo.clearReviewEvidence(db, taskId, 'pull-request')
  const proof = { url, repository: 'example/project', headSha: 'a'.repeat(40) }
  repo.recordVerifiedPullRequest(db, taskId, proof)
  rmSync(logPath)
  index.stop()
  index = new SessionIndex(db, [reviewEvidenceDerivation])
  index.request(run)
  await index.settled()
  expect(repo.reviewEvidence(db, taskId)).toMatchObject({ pullRequestCandidates: [url], verifiedPullRequests: [proof] })
})

it('replaces a truncated or rotated source without leaving stale messages', async () => {
  writeFileSync(logPath, history(300))
  view.loadSession(runId)
  await index.settled()
  writeFileSync(logPath, message(900))
  index.request(repo.getRun(db, runId)!)
  await index.settled()
  expect(view.loadSession(runId).messages.map(item => item.id)).toEqual(['m900'])
  writeFileSync(join(dir, 'replacement'), message(901))
  renameSync(join(dir, 'replacement'), logPath)
  index.request(repo.getRun(db, runId)!)
  await index.settled()
  expect(view.loadSession(runId).messages.map(item => item.id)).toEqual(['m901'])
})

it('keeps UTF-8 and incomplete JSON intact across appended writes', async () => {
  const bytes = Buffer.from(message(0))
  const cut = bytes.indexOf(Buffer.from('日本語')) + 1
  writeFileSync(logPath, bytes.subarray(0, cut))
  view.loadSession(runId)
  await index.settled()
  appendFileSync(logPath, bytes.subarray(cut))
  index.request(repo.getRun(db, runId)!)
  await index.settled()
  expect(view.loadSession(runId).messages[0].blocks).toEqual([{ kind: 'text', text: 'Message 0 日本語' }])
})


it('shows the new tail immediately when the log grew while the app was closed', async () => {
  writeFileSync(logPath, history(1000))
  view.loadSession(runId)
  await index.settled()
  view.closeSession()
  index.stop()
  appendFileSync(logPath, message(1000))
  index = new SessionIndex(db)
  view = new SessionView(db, index)
  const preview = view.loadSession(runId)
  expect(preview.messages.at(-1)?.blocks).toEqual([{ kind: 'text', text: 'Message 1000 日本語' }])
  expect(preview.indexing).toBe(true)
  await index.settled()
})

it('indexes raw output incrementally and patches only its unfinished page', async () => {
  const agentId = repo.getRun(db, runId)!.agentId
  repo.updateAgent(db, agentId, { logAdapter: 'stdout' })
  // Adapter selection is fixed at launch; create this raw-output run after configuring it.
  runId = occupy(db, taskId, agentId, { stdoutLogPath: join(dir, 'raw.log') })
  const run = repo.getRun(db, runId)!
  writeFileSync(run.stdoutLogPath, '# Quuu run test\n# start\n# cwd: /tmp\n# cmd: example\n\n' + Array.from({ length: 450 }, (_, i) => `line ${i}\n`).join('') + 'partial')
  view.loadSession(runId)
  await index.settled()
  const writes = vi.spyOn(repo, 'writeSessionMessages')
  appendFileSync(run.stdoutLogPath, ' result\n')
  index.request(repo.getRun(db, runId)!)
  await index.settled()
  const saved = view.loadSession(runId)
  expect(saved.totalMessages).toBe(3)
  const tail = saved.messages.at(-1)?.blocks[0]
  expect(tail?.kind === 'text' ? tail.text : '').toContain('partial result')
  expect(JSON.stringify(saved.messages)).not.toContain('# Quuu run')
  expect(writes.mock.calls.reduce((total, call) => total + call[4].length, 0)).toBe(1)
})

const retiredMessage = { id: 'old', role: 'user' as const, isSidechain: false, timestamp: null, blocks: [], model: null }

/**
 * A parser that learned to read something new gets a new version, and with it a new key. Where
 * the current key already holds the session, the pages under the old one are never opened again,
 * and a long session is tens of thousands of rows, so they go - and nothing under a current key
 * goes with them.
 */
it('drops pages under a retired parser version once the current version holds the session', async () => {
  writeFileSync(logPath, history(3))
  view.loadSession(runId)
  await index.settled()
  const current = sessionKey(sessionReadTarget(db, repo.getRun(db, runId)!))
  const retired = current.replace(/^v\d+:/, 'v0:')
  repo.finishSessionIndex(db, retired, { stamp: 's', generation: 'g', title: null, total: 1, evidenceVersion: 0, updatedAt: '2026-01-01T00:00:00.000Z' })
  repo.writeSessionMessages(db, retired, 'g', 0, [retiredMessage])
  repo.writeSessionImage(db, retired, 'img', 'data:image/png;base64,aGVsbG8=')
  repo.writeSessionWorkDirs(db, retired, 'g', 0, ['/old'])

  expect(index.sweepRetired()).toEqual({ carried: 0, dropped: 1 })
  expect(repo.getSessionIndex(db, retired)).toBeNull()
  expect(repo.readSessionMessages(db, retired, 'g', 0, 1)).toEqual([])
  expect(repo.readSessionImage(db, retired, 'img')).toBeNull()
  expect(repo.readSessionWorkDirs(db, retired, 'g')).toEqual([])
  expect(repo.getSessionIndex(db, current)?.total).toBe(3)
  expect(index.sweepRetired()).toEqual({ carried: 0, dropped: 0 })
})

/**
 * The CLIs delete their own old logs, and then the pages are the only copy of the conversation.
 * A parser bump used to drop them along with the rest of the retired version - and the
 * conversation was gone for good.
 */
it('carries the pages of a session whose log is gone onto the current version, and keeps showing them', async () => {
  const current = sessionKey(sessionReadTarget(db, repo.getRun(db, runId)!))
  const retired = current.replace(/^v\d+:/, 'v0:')
  repo.finishSessionIndex(db, retired, { stamp: 's', generation: 'g', title: 'Kept', total: 1, evidenceVersion: DERIVATION_VERSION, updatedAt: '2026-01-01T00:00:00.000Z' })
  repo.writeSessionMessages(db, retired, 'g', 0, [retiredMessage])
  repo.writeSessionImage(db, retired, 'img', 'data:image/png;base64,aGVsbG8=')
  repo.writeSessionWorkDirs(db, retired, 'g', 0, ['/old'])

  expect(index.sweepRetired()).toEqual({ carried: 1, dropped: 0 })
  expect(repo.getSessionIndex(db, retired)).toBeNull()
  expect(repo.readSessionImage(db, current, 'img')).toBe('data:image/png;base64,aGVsbG8=')
  expect(repo.readSessionWorkDirs(db, current, 'g')).toEqual(['/old'])
  const shown = view.loadSession(runId)
  await index.settled()
  expect(shown.messages.map(item => item.id)).toEqual(['old'])
  expect(view.loadSession(runId).messages.map(item => item.id)).toEqual(['old'])
})

it('reads a carried session again under the current parser while its log still exists', async () => {
  writeFileSync(logPath, history(3))
  const current = sessionKey(sessionReadTarget(db, repo.getRun(db, runId)!))
  const retired = current.replace(/^v\d+:/, 'v0:')
  repo.finishSessionIndex(db, retired, { stamp: 's', generation: 'g', title: null, total: 1, evidenceVersion: DERIVATION_VERSION, updatedAt: '2026-01-01T00:00:00.000Z' })
  repo.writeSessionMessages(db, retired, 'g', 0, [retiredMessage])

  expect(index.sweepRetired()).toEqual({ carried: 1, dropped: 0 })
  view.loadSession(runId)
  await index.settled()
  const read = view.loadSession(runId)
  expect(read.totalMessages).toBe(3)
  expect(read.messages.map(item => item.id)).toEqual(['m0', 'm1', 'm2'])
})

/**
 * Retention removes the conversation of a session that has not changed within the period, and
 * nothing while the period is 0. The row stays marked, so an unchanged log is not read straight
 * back in and the screen can say why the pane is empty; what the pages filed against the task
 * stays on the task.
 */
it('removes conversations past the retention period without reading an unchanged log back in', async () => {
  writeFileSync(logPath, line({ type: 'assistant', uuid: 'receipt', message: { content: [
    { type: 'tool_use', id: 'commit', name: 'Bash', input: { command: 'git commit -m done' } }] } }) +
    line({ type: 'user', uuid: 'result', message: { content: [{ type: 'tool_result', tool_use_id: 'commit', content: '[main abcdef1] done' }] } }))
  view.loadSession(runId)
  await index.settled()
  const key = sessionKey(sessionReadTarget(db, repo.getRun(db, runId)!))
  expect(repo.getSessionIndex(db, key)?.updatedAt).toBeTruthy()
  expect(repo.reviewEvidence(db, taskId).commits).toEqual(['abcdef1'])

  expect(index.prune(0)).toBe(0)
  expect(index.prune(30)).toBe(0)
  const later = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000)
  expect(index.prune(30, later)).toBe(1)
  expect(index.prune(30, later)).toBe(0)

  const parse = vi.spyOn(ClaudeSessionParser.prototype, 'pushLines')
  index.request(repo.getRun(db, runId)!)
  await index.settled()
  expect(parse).not.toHaveBeenCalled()
  const shown = view.loadSession(runId)
  expect(shown.messages).toEqual([])
  expect(shown.prunedAt).toBe(later.toISOString())
  expect(repo.reviewEvidence(db, taskId).commits).toEqual(['abcdef1'])

  // A session that goes on again is read in full once more
  appendFileSync(logPath, message(7))
  index.request(repo.getRun(db, runId)!)
  await index.settled()
  const resumed = view.loadSession(runId)
  expect(resumed.prunedAt).toBeUndefined()
  expect(resumed.totalMessages).toBeGreaterThan(0)
})
