import { appendFileSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { ClaudeSessionParser } from '../src/main/session/claudeParser.js'
import { SessionIndex, SESSION_PAGE, SESSION_WINDOW, sessionKey } from '../src/main/session/index.js'
import { sessionReadTarget } from '../src/main/session/sessionAttach.js'
import { SessionView } from '../src/main/session/view.js'
import { recordSessionEvidence, REVIEW_EVIDENCE_VERSION } from '../src/main/review/evidence.js'
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
  index = new SessionIndex(db, (run, messages) => recordSessionEvidence(db, run.taskId, messages))
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
    line({ type: 'assistant', uuid: 'pr', message: { content: [{ type: 'tool_use', id: 'create-pr', name: 'Bash', input: { command: 'gh pr create' } }] } }) +
    line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'create-pr', content: url }] } }))
  view.loadSession(runId)
  await index.settled()
  const run = repo.getRun(db, runId)!
  const target = sessionReadTarget(db, run)
  const key = sessionKey(target)
  repo.finishSessionEvidence(db, key, 0)
  db.prepare("DELETE FROM task_review_evidence WHERE task_id = ? AND kind = 'pull-request'").run(taskId)
  if (missing) rmSync(logPath)
  view.closeSession()
  index.stop()
  const receive = vi.fn((source: typeof run, messages: Parameters<typeof recordSessionEvidence>[2]) => recordSessionEvidence(db, source.taskId, messages))
  index = new SessionIndex(db, receive)
  const parse = vi.spyOn(ClaudeSessionParser.prototype, 'pushLines')
  const indexed = vi.fn()
  index.on('indexed', indexed)
  index.request(run, target)
  await index.settled()
  expect(parse).not.toHaveBeenCalled()
  expect(receive.mock.calls).toHaveLength(4)
  expect(receive.mock.calls.every(call => call[1].length <= SESSION_PAGE)).toBe(true)
  expect(repo.reviewEvidence(db, taskId).pullRequests).toEqual([url])
  expect(repo.getSessionIndex(db, key)?.evidenceVersion).toBe(REVIEW_EVIDENCE_VERSION)
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
it('drops a Pull Request the run only read, and keeps what its other session produced', async () => {
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
  expect(repo.reviewEvidence(db, taskId).pullRequests.sort()).toEqual([own, followUp].sort())

  // What the old rule left behind: the Pull Request the run only went to look at
  repo.recordReviewEvidence(db, taskId, 'pull-request', foreign)
  for (const run of runs) repo.finishSessionEvidence(db, sessionKey(sessionReadTarget(db, run)), 0)
  for (const run of runs) index.request(run, sessionReadTarget(db, run))
  await index.settled()
  expect(repo.reviewEvidence(db, taskId).pullRequests.sort()).toEqual([own, followUp].sort())
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
  const run = repo.getRun(db, runId)!
  repo.updateAgent(db, run.agentId, { logAdapter: 'stdout' })
  repo.updateRun(db, runId, { sessionLogPath: null })
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
