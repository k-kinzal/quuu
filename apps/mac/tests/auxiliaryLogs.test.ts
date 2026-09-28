import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate as yieldToReader } from 'node:timers/promises'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { adapterFor } from '../src/main/agent-adapters/registry.js'
import { AuxiliaryLogs, type AuxiliarySource } from '../src/main/session/auxiliaryLogs.js'
import { ReportOperations } from '../src/main/report/operations.js'
import { HookOperations } from '../src/main/hooks/operations.js'
import * as repo from '../src/main/db/repo.js'
import { HOOK_DEFAULTS } from '../src/main/hooks/config.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { isolateSessionDirs, releaseSessionDirs, makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

let dir: string
let db: ReturnType<typeof memoryDb>
let logs: AuxiliaryLogs
let source: AuxiliarySource
const jsonl = (value: unknown): string => JSON.stringify(value) + '\n'
const message = (i: number): string => jsonl({ type: i % 2 ? 'assistant' : 'user', uuid: `m${i}`,
  message: { content: [{ type: 'text', text: `Message ${i} 日本語 ${'body '.repeat(150)}` }] } })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-auxiliary-log-'))
  isolateSessionDirs(dir)
  db = memoryDb()
  logs = new AuxiliaryLogs(db)
  source = { logPath: join(dir, 'stdout.log'), mirroredPath: join(dir, 'session.jsonl'), cwd: dir,
    startedAt: new Date().toISOString(), adapter: 'claude', sessionId: 'auxiliary', running: false }
})
afterEach(() => { logs.stop(); db.close(); releaseSessionDirs(); rmSync(dir, { recursive: true, force: true }) })

it('recovers the actual Codex conversation from stdout for hooks and reports predating writer metadata', async () => {
  const id = '01a075da-e8ed-75d0-8354-e1302f5a72c3'
  const day = join(dir, 'codex', '2026', '09', '28')
  mkdirSync(day, { recursive: true })
  writeFileSync(join(day, `rollout-now-${id}.jsonl`), jsonl({ type: 'response_item', payload: {
    type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Report written' }]
  } }))
  writeFileSync(source.logPath, `OpenAI Codex v0.153.4\n--------\nsession id: ${id}\n--------\n`)
  for (const adapter of [undefined, 'codex'] as const) {
    const page = await logs.page({ ...source, adapter, sessionId: 'minted-id', mirroredPath: undefined }, { id: 'report' })
    expect(page).toMatchObject({ structured: true, sessionId: id })
    expect(page.messages[0].blocks).toEqual([{ kind: 'text', text: 'Report written' }])
  }
})

it('does not substitute a previous or later execution with the same instruction', async () => {
  const candidates = [900, 1100, 1300].map(bornMs => {
    const logPath = join(dir, `${bornMs}.jsonl`)
    writeFileSync(logPath, jsonl({ type: 'user', uuid: `${bornMs}`, message: { content: 'Same instruction' } }))
    return { bornMs, logPath, sessionId: `${bornMs}` }
  })
  const provider = adapterFor('claude')
  const discover = provider.sessionCandidates
  try {
    provider.sessionCandidates = () => candidates
    const page = await logs.page({ ...source, mirroredPath: undefined, input: 'Same instruction',
      startedAt: new Date(1000).toISOString(), endedAt: new Date(1200).toISOString() }, { id: 'hook' })
    expect(page.sessionId).toBe('1100')
    expect(page.messages[0].id).toBe('1100')
  } finally { provider.sessionCandidates = discover }
})

it('reads every message beyond the former log tail in bounded pages in both directions', async () => {
  writeFileSync(source.mirroredPath!, Array.from({ length: 245 }, (_, i) => message(i)).join(''))
  let page = await logs.page(source, { id: 'hook' })
  expect(page).toMatchObject({ first: 165, last: 245, hasMore: true, structured: true })
  const seen = new Set(page.messages.map(message => message.id))
  while (page.hasMore) {
    const older = await logs.page(source, { id: 'hook', before: page.first, generation: page.generation })
    expect(older.last).toBe(page.first)
    expect(older.messages.length).toBeLessThanOrEqual(80)
    older.messages.forEach(message => seen.add(message.id))
    page = older
  }
  expect(seen.size).toBe(245)
  expect(page.messages[0].id).toBe('m0')
  const newer = await logs.page(source, { id: 'hook', after: page.last, generation: page.generation })
  expect(newer.first).toBe(page.last)
})

it('settles overlapping readers even when one has already indexed the queued version', async () => {
  writeFileSync(source.mirroredPath!, Array.from({ length: 2000 }, (_, i) => message(i)).join(''))
  const first = logs.page(source, { id: 'hook' })
  await yieldToReader()
  const second = logs.page(source, { id: 'hook' })
  await first
  const third = logs.page(source, { id: 'hook' })
  const pages = await Promise.all([second, third])
  expect(pages.every(page => page.totalMessages === 2000)).toBe(true)
})

it('keeps tool calls linked to results across input chunks and reads images from this conversation', async () => {
  const call = jsonl({ type: 'assistant', uuid: 'call', message: { content: [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'npm test' } }] } })
  const result = jsonl({ type: 'user', uuid: 'result', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'Final verification passed' }] } })
  const picture = jsonl({ type: 'user', uuid: 'picture', message: { content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } }] } })
  writeFileSync(source.mirroredPath!, call + Array.from({ length: 150 }, (_, i) => message(i)).join('') + result + picture)
  const last = await logs.page(source, { id: 'hook' })
  const image = last.messages.find(message => message.id === 'picture')?.blocks.find(block => block.kind === 'image')
  expect(image?.kind).toBe('image')
  if (image?.kind === 'image') expect(logs.image(source, image.image.id)).toBe('data:image/png;base64,aGVsbG8=')
  const first = await logs.page(source, { id: 'hook', before: 80, generation: last.generation })
  expect(first.messages[0].blocks[0]).toMatchObject({ kind: 'tool', tool: { result: 'Final verification passed' } })
})

it('reads all raw output including an unfinished line, and refreshes the last output on completion', async () => {
  source = { ...source, adapter: 'stdout', mirroredPath: undefined, running: true }
  writeFileSync(source.logPath, Array.from({ length: 2400 }, (_, i) => `Line ${i}: ${'出力'.repeat(25)}\n`).join('') + 'Final partial')
  let page = await logs.page(source, { id: 'shell' })
  expect(page.messages).toHaveLength(8)
  expect(page.messages.at(-1)?.blocks).toEqual([{ kind: 'text', text: 'Final partial' }])
  const chunks = [...page.messages]
  while (page.hasMore) {
    page = await logs.page(source, { id: 'shell', before: page.first, generation: page.generation })
    chunks.unshift(...page.messages)
  }
  expect(chunks.flatMap(message => message.blocks).filter(block => block.kind === 'text').map(block => block.text).join('\n')).toContain('Line 0:')
  appendFileSync(source.logPath, ' completed')
  const final = await logs.page({ ...source, running: false }, { id: 'shell' })
  expect(final.messages.at(-1)?.blocks).toEqual([{ kind: 'text', text: 'Final partial completed' }])
})

it('resets an obsolete cursor after log replacement and never looks locally for a remote log', async () => {
  writeFileSync(source.mirroredPath!, Array.from({ length: 100 }, (_, i) => message(i)).join(''))
  const previous = await logs.page(source, { id: 'hook' })
  writeFileSync(source.mirroredPath!, message(999))
  const replaced = await logs.page(source, { id: 'hook', before: previous.first, generation: previous.generation })
  expect(replaced.messages.map(message => message.id)).toEqual(['m999'])
  writeFileSync(source.logPath, 'Remote output\n')
  const fallback = await logs.page({ ...source, mirroredPath: null }, { id: 'remote' })
  expect(fallback.structured).toBe(false)
  expect(fallback.messages[0].blocks).toEqual([{ kind: 'text', text: 'Remote output\n' }])
})

it('opens report and hook logs by their recorded identity without creating runs or changing task state', async () => {
  const agent = makeAgent(db, { name: 'Writer' })
  const projectId = makeProject(db, { name: 'Project', targetId: agent, path: dir })
  const taskId = makeTask(db, projectId, 'Task')
  const before = repo.getTask(db, taskId)
  writeFileSync(source.logPath, 'Written report\n')
  const conversation = { adapter: 'stdout' as const, sessionId: 'writer', input: 'Write a report' }
  repo.saveTaskReport(db, { taskId, status: 'ready', cwd: dir, logPath: source.logPath, revision: '', path: '',
    pending: '', exitPath: '', error: '', pid: null, startedAt: source.startedAt, endedAt: source.startedAt, conversation })
  const reports = new ReportOperations(db, () => DEFAULT_SETTINGS, () => ({ dir, project: repo.getProject(db, projectId)! }))
  const hooks = new HookOperations(db, () => {}, () => dir)
  const definition = { ...HOOK_DEFAULTS, id: 'check', name: 'Check', kind: 'command' as const, command: 'echo checked', enabled: true, events: ['stopped' as const] }
  repo.saveHookRun(db, { id: 'hook', taskId, taskTitle: 'Task', projectId, hookId: 'check', name: 'Check',
    event: 'stopped', kind: 'command', input: definition.command, status: 'succeeded', cwd: dir, logPath: source.logPath,
    createdAt: source.startedAt, startedAt: source.startedAt, endedAt: source.startedAt, agentId: null, exitCode: 0,
    error: '', exitPath: '', pid: null, authDir: null, sessionId: 'shell', logAdapter: 'stdout', limitPatterns: [], definition, project: repo.getProject(db, projectId)! })
  try {
    expect(await reports.conversation({ id: taskId })).toMatchObject({ input: 'Write a report', totalMessages: 1 })
    expect(await hooks.conversation({ id: 'hook' })).toMatchObject({ input: '', totalMessages: 1 })
    expect(repo.getTaskReport(db, taskId)?.conversation).toEqual(conversation)
    expect(repo.getTask(db, taskId)).toEqual(before)
    expect(repo.listRunsByTask(db, taskId)).toEqual([])
  } finally { reports.stop(); hooks.stop() }
})
