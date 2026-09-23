import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { CursorSessionParser } from '../src/main/agent-adapters/cursor/parser.js'
import * as cursorStore from '../src/main/agent-adapters/cursor/store.js'
import type { CursorMessage } from '../src/main/agent-adapters/cursor/store.js'
import { SessionIndex, sessionKey } from '../src/main/session/index.js'
import { sessionReadTarget } from '../src/main/session/sessionAttach.js'
import { SessionWatcher, snapshotStamp } from '../src/main/session/sessionWatcher.js'
import type { AppendedEvent } from '../src/main/session/sessionWatcher.js'
import { SessionView } from '../src/main/session/view.js'
import { isolateSessionDirs, makeAgent, makeProject, makeTask, memoryDb, occupy, releaseSessionDirs } from './helpers.js'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
let dir: string
let store: string
let writer: InstanceType<typeof DatabaseSync>
let db: ReturnType<typeof memoryDb>
let index: SessionIndex
let view: SessionView
let watcher: SessionWatcher
let runId: string
const user: CursorMessage = { role: 'user', content: '<user_query>Continue the work</user_query>' }
const call = (seconds = 3600): CursorMessage => ({
  role: 'assistant',
  content: [
    { type: 'text', text: 'Waiting for the background job.' },
    { type: 'tool-call', toolCallId: 'await-1', toolName: 'CallDynamicTool', args: { namespace: 'cursor', toolName: 'AwaitShell', arguments: { shell_id: '123', block_until_ms: seconds * 1000 } } }
  ]
})
const result = (isError = false): CursorMessage => ({
  role: 'tool',
  content: [{ type: 'tool-result', toolCallId: 'await-1', result: 'Job finished', isError }]
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-cursor-live-'))
  isolateSessionDirs(dir)
  store = join(dir, 'store.db')
  writer = new DatabaseSync(store)
  writer.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB); CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)')
  writeConversation([user])
  writer.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  db = memoryDb()
  const agentId = makeAgent(db, { name: 'Cursor', logAdapter: 'cursor' })
  const projectId = makeProject(db, { name: 'Fixture', path: dir, targetId: agentId })
  const taskId = makeTask(db, projectId, 'Fixture')
  runId = occupy(db, taskId, agentId, { stdoutLogPath: join(dir, 'stdout.log') })
  repo.updateRun(db, runId, { sessionLogPath: store })
  index = new SessionIndex(db)
  view = new SessionView(db, index)
  watcher = new SessionWatcher()
})

afterEach(async () => {
  watcher.close()
  view.closeSession()
  index.stop()
  await index.settled()
  db.close()
  writer.close()
  releaseSessionDirs()
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/** Cursor 2026.09.18 stores running calls inline in root field 4, outside the field-1 blobs. */
function writeConversation(messages: CursorMessage[], pending: CursorMessage[] = []): void {
  writer.exec('BEGIN IMMEDIATE')
  try {
    const parts = messages.map(message => field(1, blob(Buffer.from(JSON.stringify(message)))))
    parts.push(...pending.map(message => field(4, Buffer.from(JSON.stringify(message)))))
    parts.push(field(22, Buffer.from('cli')))
    const root = blob(Buffer.concat(parts))
    writer.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(
      '0', Buffer.from(JSON.stringify({ latestRootBlobId: root.toString('hex'), name: 'Fixture' })).toString('hex')
    )
    writer.exec('COMMIT')
  } catch (error) {
    writer.exec('ROLLBACK')
    throw error
  }
}

function blob(data: Buffer): Buffer {
  const id = createHash('sha256').update(data).digest()
  writer.prepare('INSERT OR IGNORE INTO blobs (id, data) VALUES (?, ?)').run(id.toString('hex'), data)
  return id
}

function field(number: number, value: Buffer): Buffer {
  return Buffer.concat([varint(number * 8 + 2), varint(value.length), value])
}

function varint(value: number): Buffer {
  const bytes: number[] = []
  while (value > 127) { bytes.push((value & 127) | 128); value = Math.floor(value / 128) }
  return Buffer.from([...bytes, value])
}

it('shows the running tool before Cursor commits the completed message and folds the result into the same row', () => {
  writeConversation([user], [call()])
  const parser = new CursorSessionParser()
  expect(parser.reload(store, 'chat').readSucceeded).toBe(true)
  expect(parser.messages).toHaveLength(2)
  const pending = parser.messages[1]
  expect(pending.blocks[1]).toMatchObject({ kind: 'tool', tool: { id: 'await-1', result: null } })

  writeConversation([user, call(), result()])
  expect(parser.reload(store, 'chat').changedFromIndex).toBe(1)
  expect(parser.messages).toHaveLength(2)
  expect(parser.messages[1].id).toBe(pending.id)
  expect(parser.messages[1].blocks[1]).toMatchObject({ kind: 'tool', tool: { result: 'Job finished' } })
  expect(parser.reload(store, 'chat').changedFromIndex).toBe(-1)
  expect(cursorStore.readCursorChat(store, 'chat', { maxMessages: 1 })?.messages).toEqual([user])
})

it('detects changing arguments and errors even when the tool ID and result text stay the same', () => {
  writeConversation([user], [call()])
  const parser = new CursorSessionParser()
  parser.reload(store, 'chat')
  writeConversation([user], [call(1800)])
  expect(parser.reload(store, 'chat').changedFromIndex).toBe(1)
  writeConversation([user, call(1800), result()])
  parser.reload(store, 'chat')
  writeConversation([user, call(1800), result(true)])
  expect(parser.reload(store, 'chat').changedFromIndex).toBe(1)
  expect(parser.messages[1].blocks[1]).toMatchObject({ kind: 'tool', tool: { isError: true } })
})

it('publishes a WAL-only running call and its completion to an already open chat without a reload', async () => {
  const events: AppendedEvent[] = []
  view.watcher.on('appended', (event: AppendedEvent) => events.push(event))
  view.loadSession(runId)
  await index.settled()
  events.length = 0
  const before = statSync(store)
  writeConversation([user], [call()])
  expect(statSync(store).mtimeMs).toBe(before.mtimeMs)
  expect(statSync(`${store}-wal`).size).toBeGreaterThan(0)
  await vi.waitFor(() => expect(events.at(-1)?.messages[1]?.blocks[1]).toMatchObject({ kind: 'tool', tool: { result: null } }), { timeout: 3000 })
  expect(events.at(-1)?.replacement?.totalMessages).toBe(2)
  expect(events.at(-1)?.runId).toBe(runId)

  writeConversation([user, call(), result()])
  await vi.waitFor(() => expect(events.at(-1)?.messages[1]?.blocks[1]).toMatchObject({ kind: 'tool', tool: { result: 'Job finished' } }), { timeout: 3000 })
  expect(events.at(-1)?.replacement?.totalMessages).toBe(2)
})

it.each(['cold', 'warm'] as const)('retries a failed %s index read without another store write or losing cached messages', async state => {
  const run = repo.getRun(db, runId)!
  const target = sessionReadTarget(db, run)
  const key = sessionKey(target)
  if (state === 'warm') { index.request(run); await index.settled() }
  const previous = repo.getSessionIndex(db, key)
  writeConversation([user], [call()])
  const stamp = snapshotStamp(store)
  const read = vi.spyOn(cursorStore, 'readCursorChat').mockReturnValueOnce(null)
  index.request(run)
  await index.settled()
  expect(repo.getSessionIndex(db, key)).toEqual(previous)
  if (previous) expect(index.page(target).messages).toHaveLength(1)

  index.request(run)
  await index.settled()
  expect(read).toHaveBeenCalledTimes(2)
  expect(snapshotStamp(store)).toBe(stamp)
  expect(index.page(target).messages).toHaveLength(2)
  expect(repo.getSessionIndex(db, key)?.stamp).toBe(stamp)
})

it('retries a failed watcher read through polling even when filesystem events and further writes stop', async () => {
  const read = vi.spyOn(cursorStore, 'readCursorChat').mockReturnValueOnce(null)
  const events: AppendedEvent[] = []
  watcher.on('appended', (event: AppendedEvent) => events.push(event))
  watcher.open({ runId, sessionId: 'chat', logPath: store, mode: 'cursor' })
  watcher.stopFileWatchersForTest()
  const stamp = snapshotStamp(store)
  await vi.waitFor(() => expect(events.at(-1)?.messages).toHaveLength(1), { timeout: 3000 })
  expect(read).toHaveBeenCalledTimes(2)
  expect(snapshotStamp(store)).toBe(stamp)
})

it.each(['root', 'message'])('keeps the last conversation when a referenced %s blob is unavailable', kind => {
  const parser = new CursorSessionParser()
  parser.reload(store, 'chat')
  const previous = parser.messages
  if (kind === 'message') {
    writer.prepare('DELETE FROM blobs WHERE id = ?').run(createHash('sha256').update(JSON.stringify(user)).digest('hex'))
  } else {
    writer.prepare("UPDATE meta SET value = ? WHERE key = '0'").run(Buffer.from(JSON.stringify({ latestRootBlobId: '00'.repeat(32) })).toString('hex'))
  }
  expect(parser.reload(store, 'chat')).toEqual({ changedFromIndex: -1, readSucceeded: false })
  expect(parser.messages).toBe(previous)
})
