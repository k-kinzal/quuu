import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import * as repo from '../src/main/db/repo.js'
import { SessionImporter, isRunning } from '../src/main/import/importer.js'
import { discoverSessions, startedByProgram } from '../src/main/import/adapters.js'
import { probeLiveSessions, resetLivenessMemo } from '../src/main/import/liveness.js'
import { GrokSessionParser } from '../src/main/session/grokParser.js'
import { CopilotSessionParser } from '../src/main/session/copilotParser.js'
import { CursorSessionParser } from '../src/main/session/cursorParser.js'
import { readCursorChat } from '../src/main/session/cursorStore.js'
import { expectedLogPath, lastWrittenMs, resolveLogPath } from '../src/main/session/logAdapters.js'
import { scanFields } from '../src/main/session/cursorStore.js'
import { SessionWatcher } from '../src/main/session/sessionWatcher.js'
import type { AppendedEvent } from '../src/main/session/sessionWatcher.js'
import { canRecoverSessionId, findSessionId } from '../src/main/session/sessionIdentity.js'
import { isolateSessionDirs, memoryDb, releaseSessionDirs } from './helpers.js'

// node:sqlite cannot be imported statically (same reason as vitest.config.ts / database.ts)
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

/**
 * Support for Cursor / Grok / GitHub Copilot.
 *
 * The expectations come from real measurements (log shapes captured by actually running the CLIs on this machine).
 * A fabricated log is worthless if its shape differs from the real one, so even the layout matches the real thing.
 */

let root: string
let codexDir: string
let grokDir: string
let copilotDir: string
let cursorDir: string
let work: string

const line = (o: unknown): string => `${JSON.stringify(o)}\n`

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'taskd-agents-'))
  // Point every location at the test dirs (never let it read the real home)
  const dirs = isolateSessionDirs(root)
  codexDir = dirs.codex
  grokDir = dirs.grok
  copilotDir = dirs.copilot
  cursorDir = dirs.cursor
  work = join(root, 'work')
  mkdirSync(work, { recursive: true })
  resetLivenessMemo()
})

afterEach(() => {
  releaseSessionDirs()
  rmSync(root, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Layout (write into the directories observed in practice)
// ---------------------------------------------------------------------------

/** `<root>/<percent-encoded cwd>/<sessionId>/chat_history.jsonl` */
function writeGrok(
  sessionId: string,
  prompt: string,
  options: { ageMs?: number; cwd?: string; title?: string } = {}
): string {
  const cwd = options.cwd ?? work
  const dir = join(grokDir, encodeURIComponent(cwd), sessionId)
  mkdirSync(dir, { recursive: true })

  const path = join(dir, 'chat_history.jsonl')
  writeFileSync(
    path,
    [
      line({ type: 'system', content: 'あなたは Grok です' }),
      // Environment info is written with the user role too (it is not a human utterance)
      line({ type: 'user', content: [{ type: 'text', text: '<user_info>\nOS: macos\n</user_info>' }] }),
      line({
        type: 'user',
        content: [{ type: 'text', text: `<user_query>\n${prompt}\n</user_query>` }],
        prompt_index: 0
      }),
      line({ type: 'reasoning', summary: [{ type: 'summary_text', text: '考えている' }] }),
      line({
        type: 'assistant',
        content: '読みます',
        tool_calls: [{ id: 'call-1', name: 'read_file', arguments: '{"target_file":"a.ts"}' }],
        model_id: 'grok-4.6'
      }),
      line({ type: 'tool_result', tool_call_id: 'call-1', content: 'ファイルの中身' })
    ].join('')
  )

  writeFileSync(
    join(dir, 'summary.json'),
    JSON.stringify({
      info: { id: sessionId, cwd },
      created_at: new Date(Date.now() - (options.ageMs ?? 0) - 60_000).toISOString(),
      updated_at: new Date(Date.now() - (options.ageMs ?? 0)).toISOString(),
      ...(options.title ? { generated_title: options.title } : {})
    })
  )

  const when = new Date(Date.now() - (options.ageMs ?? 0))
  utimesSync(path, when, when)
  return path
}

/** `<root>/<sessionId>/events.jsonl` + `workspace.yaml` */
function writeCopilot(
  sessionId: string,
  prompt: string,
  options: { ageMs?: number; name?: string; shutdown?: boolean; workspace?: boolean } = {}
): string {
  const dir = join(copilotDir, sessionId)
  mkdirSync(dir, { recursive: true })

  const startedAt = new Date(Date.now() - (options.ageMs ?? 0) - 60_000).toISOString()
  const events = [
    line({
      type: 'session.start',
      data: { sessionId, producer: 'copilot-agent', startTime: startedAt, context: { cwd: work } },
      timestamp: startedAt
    }),
    line({ type: 'session.model_change', data: { newModel: 'gpt-5.4', reasoningEffort: null } }),
    line({
      type: 'user.message',
      // content is the raw body; transformedContent is the send-ready body with the preamble added
      data: { content: prompt, transformedContent: `<current_datetime>x</current_datetime>\n${prompt}` },
      timestamp: startedAt
    }),
    line({
      type: 'assistant.message',
      data: {
        content: '直します',
        toolRequests: [{ toolCallId: 'call-1', name: 'str_replace', arguments: { path: 'a.ts' } }]
      }
    }),
    line({
      type: 'tool.execution_complete',
      data: { toolCallId: 'call-1', success: true, result: { content: '書き換えた', detailedContent: '長い差分' } }
    })
  ]
  if (options.shutdown) events.push(line({ type: 'session.shutdown', data: {} }))

  const path = join(dir, 'events.jsonl')
  writeFileSync(path, events.join(''))

  if (options.workspace !== false) {
    writeFileSync(
      join(dir, 'workspace.yaml'),
      [
        `id: ${sessionId}`,
        `cwd: ${work}`,
        'user_named: false',
        `created_at: ${startedAt}`,
        `updated_at: ${new Date(Date.now() - (options.ageMs ?? 0)).toISOString()}`,
        ...(options.name ? [`name: ${options.name}`] : [])
      ].join('\n')
    )
  }

  const when = new Date(Date.now() - (options.ageMs ?? 0))
  utimesSync(path, when, when)
  return path
}

/**
 * `<root>/<md5(cwd)>/<chatId>/store.db` + `meta.json`
 *
 * store.db is content-addressed. `meta['0']` holds hex JSON, and the root blob is
 * protobuf (field 1 lists the ids of the message blobs in order).
 */
function writeCursor(
  chatId: string,
  prompt: string,
  options: { ageMs?: number; cwd?: string; subagent?: boolean; entrypoint?: string } = {}
): string {
  const cwd = options.cwd ?? work
  const dir = join(cursorDir, createHash('md5').update(cwd).digest('hex'), chatId)
  mkdirSync(dir, { recursive: true })

  const messages: unknown[] = [
    { role: 'system', content: 'あなたは Cursor です' },
    {
      role: 'user',
      // Observed: environment info, rules, and the skill list are concatenated into one message
      content:
        '<user_info>\nOS Version: darwin\n</user_info>\n<agent_skills>\n<available_skills>\nx\n</available_skills>\n</agent_skills>'
    }
  ]
  if (options.subagent) {
    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: '<system_reminder>\nYou are running as a subagent under a parent agent.\n</system_reminder>'
        }
      ]
    })
  }
  messages.push({
    role: 'user',
    content: [{ type: 'text', text: `<timestamp>now</timestamp>\n<user_query>\n${prompt}\n</user_query>` }]
  })
  messages.push({
    role: 'assistant',
    content: [
      { type: 'reasoning', text: '考えている', signature: 'sig' },
      { type: 'text', text: '調べます' },
      { type: 'tool-call', toolCallId: 'call-1', toolName: 'Glob', args: { glob_pattern: '*.ts' } }
    ]
  })
  messages.push({
    role: 'tool',
    content: [{ type: 'tool-result', toolCallId: 'call-1', toolName: 'Glob', result: 'a.ts' }]
  })

  const storePath = join(dir, 'store.db')
  const db = new DatabaseSync(storePath)
  db.exec('CREATE TABLE blobs (id TEXT PRIMARY KEY, data BLOB)')
  db.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)')

  const ids: Buffer[] = []
  const insert = db.prepare('INSERT INTO blobs (id, data) VALUES (?, ?)')
  for (const message of messages) {
    const data = Buffer.from(JSON.stringify(message), 'utf8')
    const id = createHash('sha256').update(data).digest()
    ids.push(id)
    insert.run(id.toString('hex'), data)
  }

  const root = protoRoot(ids, options.entrypoint ?? 'cli', cwd)
  const rootId = createHash('sha256').update(root).digest('hex')
  insert.run(rootId, root)
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(
    '0',
    Buffer.from(JSON.stringify({ agentId: chatId, latestRootBlobId: rootId, name: 'New Agent' })).toString('hex')
  )
  db.close()

  const updatedMs = Date.now() - (options.ageMs ?? 0)
  const metaPath = join(dir, 'meta.json')
  writeFileSync(
    metaPath,
    JSON.stringify({ schemaVersion: 1, cwd, createdAtMs: updatedMs - 60_000, updatedAtMs: updatedMs })
  )

  // Age meta.json along with it. The real thing writes it next to store.db on every turn, so
  // leaving only this at "just now" makes a stopped chat look forever running
  const when = new Date(updatedMs)
  utimesSync(storePath, when, when)
  utimesSync(metaPath, when, when)
  return storePath
}

/** The root blob. Hand-assembled protobuf wire format (same ordering as observed). */
function protoRoot(messageIds: Buffer[], entrypoint: string, cwd: string): Buffer {
  const parts: Buffer[] = []
  const lengthDelimited = (field: number, payload: Buffer): Buffer =>
    Buffer.concat([varint(field * 8 + 2), varint(payload.length), payload])

  for (const id of messageIds) parts.push(lengthDelimited(1, id))
  parts.push(lengthDelimited(9, Buffer.from(`file://${cwd}`, 'utf8')))
  parts.push(lengthDelimited(22, Buffer.from(entrypoint, 'utf8')))
  parts.push(Buffer.concat([varint(26 * 8 + 0), varint(Date.now())]))
  return Buffer.concat(parts)
}

function varint(value: number): Buffer {
  const out: number[] = []
  let v = value
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80)
    v = Math.floor(v / 128)
  }
  out.push(v)
  return Buffer.from(out)
}

const settings = { ...DEFAULT_SETTINGS, importHistoryDays: 30 }

// ---------------------------------------------------------------------------

describe('session log parsing', () => {
  it('Grok: emits only the messages a human typed, and folds tool results into their calls', () => {
    const path = writeGrok('11111111-1111-1111-1111-111111111111', 'テストを直して')
    const parser = new GrokSessionParser()
    parser.pushLines(readLines(path))

    // The <user_info> preamble is not emitted (it is not a human utterance)
    expect(parser.messages.filter((m) => m.role === 'user')).toHaveLength(1)
    expect(parser.messages[0].blocks).toEqual([{ kind: 'text', text: 'テストを直して' }])
    expect(parser.title).toBe('テストを直して')

    const thinking = parser.messages.find((m) => m.blocks[0]?.kind === 'thinking')
    expect(thinking?.blocks[0]).toEqual({ kind: 'thinking', text: '考えている' })

    const tool = parser.messages.flatMap((m) => m.blocks).find((b) => b.kind === 'tool')
    expect(tool?.kind === 'tool' && tool.tool.name).toBe('read_file')
    // arguments arrive as a JSON string, so parse them before handing them over
    expect(tool?.kind === 'tool' && tool.tool.input).toEqual({ target_file: 'a.ts' })
    expect(tool?.kind === 'tool' && tool.tool.result).toBe('ファイルの中身')
  })

  it('Copilot: emits the body the human typed, not the body with the preamble added', () => {
    const path = writeCopilot('22222222-2222-2222-2222-222222222222', 'ビルドを通して')
    const parser = new CopilotSessionParser()
    parser.pushLines(readLines(path))

    const user = parser.messages.find((m) => m.role === 'user')
    expect(user?.blocks).toEqual([{ kind: 'text', text: 'ビルドを通して' }])

    const assistant = parser.messages.find((m) => m.role === 'assistant')
    expect(assistant?.model).toBe('gpt-5.4')
    const tool = assistant?.blocks.find((b) => b.kind === 'tool')
    // Take the short content side for the result (detailedContent runs to tens of KB)
    expect(tool?.kind === 'tool' && tool.tool.result).toBe('書き換えた')
    expect(tool?.kind === 'tool' && tool.tool.isError).toBe(false)
  })

  it('Cursor: builds the conversation out of SQLite blobs', () => {
    const store = writeCursor('33333333-3333-3333-3333-333333333333', '設計を見て')
    const parser = new CursorSessionParser()
    parser.reload(store, '33333333-3333-3333-3333-333333333333')

    expect(parser.messages.filter((m) => m.role === 'user')).toHaveLength(1)
    expect(parser.messages[0].blocks).toEqual([{ kind: 'text', text: '設計を見て' }])

    const assistant = parser.messages.find((m) => m.role === 'assistant')
    expect(assistant?.blocks.map((b) => b.kind)).toEqual(['thinking', 'text', 'tool'])
    const tool = assistant?.blocks.find((b) => b.kind === 'tool')
    // Fold the result, which arrives on a separate row (role: tool), into the call row
    expect(tool?.kind === 'tool' && tool.tool.result).toBe('a.ts')
  })

  it('Cursor: returns -1 when re-reading finds no change', () => {
    const store = writeCursor('44444444-4444-4444-4444-444444444444', '変わらない')
    const parser = new CursorSessionParser()
    expect(parser.reload(store, '44444444-4444-4444-4444-444444444444').changedFromIndex).toBe(0)
    expect(parser.reload(store, '44444444-4444-4444-4444-444444444444').changedFromIndex).toBe(-1)
  })

  it('Cursor: does not throw on a corrupt store.db and keeps the previous content', () => {
    const broken = join(root, 'broken.db')
    writeFileSync(broken, 'これは SQLite ではない')
    expect(readCursorChat(broken, 'x')).toBeNull()

    const parser = new CursorSessionParser()
    const store = writeCursor('55555555-5555-5555-5555-555555555555', '残るはず')
    parser.reload(store, '55555555-5555-5555-5555-555555555555')
    const before = parser.messages.length

    expect(parser.reload(broken, 'x').changedFromIndex).toBe(-1)
    expect(parser.messages).toHaveLength(before)
  })
})

describe('recovering the session id', () => {
  /*
   * Copilot has no argument for passing a session id to `-p` (observed).
   * If the id the CLI chose cannot be picked up, both the conversation view and continuation break silently.
   */
  it('Copilot: pins down the session the CLI created from cwd and start time', () => {
    expect(canRecoverSessionId('copilot')).toBe(true)

    // Match the real order: the Run starts first, then the CLI creates the session
    const startedAtMs = Date.now() - 120_000
    writeCopilot('eeeeeeee-1111-1111-1111-111111111111', '走らせた作業')

    const found = findSessionId('copilot', {
      cwd: work,
      startedAtMs,
      claimed: new Set<string>()
    })
    expect(found).toBe('eeeeeeee-1111-1111-1111-111111111111')
  })

  it('Copilot: takes neither an id another Run already claims nor one older than launch', () => {
    const startedAtMs = Date.now() - 120_000
    writeCopilot('eeeeeeee-2222-2222-2222-222222222222', '別の Run の作業')

    // Already known to belong to another Run
    expect(
      findSessionId('copilot', {
        cwd: work,
        startedAtMs,
        claimed: new Set(['eeeeeeee-2222-2222-2222-222222222222'])
      })
    ).toBeNull()

    // Anything that started before our own launch is not our session
    expect(
      findSessionId('copilot', {
        cwd: work,
        startedAtMs: startedAtMs + 10 * 60 * 1000,
        claimed: new Set<string>()
      })
    ).toBeNull()
  })

  it('Copilot: does not take a session whose working directory differs', () => {
    // A run that failed authentication still creates the session-state directory
    writeCopilot('eeeeeeee-3333-3333-3333-333333333333', '別の場所の作業')
    const other = join(root, 'another')
    mkdirSync(other, { recursive: true })

    expect(
      findSessionId('copilot', { cwd: other, startedAtMs: Date.now(), claimed: new Set<string>() })
    ).toBeNull()
  })

  it('does not rely on recovery for CLIs that accept an id argument', () => {
    // grok / cursor take it as an argument. Codex's id comes from the stdout header, not this search.
    expect(canRecoverSessionId('grok')).toBe(true)
    expect(canRecoverSessionId('cursor')).toBe(true)
    expect(canRecoverSessionId('codex')).toBe(false)
    expect(canRecoverSessionId('stdout')).toBe(false)
  })
})

describe('following the conversation (replacement style)', () => {
  it('Cursor: streams what was added as appended once store.db is rewritten', async () => {
    const chatId = 'dddddddd-1111-1111-1111-111111111111'
    const store = writeCursor(chatId, '最初の依頼')

    const watcher = new SessionWatcher()
    try {
      const snapshot = watcher.open({ runId: 'run1', sessionId: chatId, logPath: store, mode: 'cursor' })
      expect(snapshot.exists).toBe(true)
      expect(snapshot.messages.filter((m) => m.role === 'user')).toHaveLength(1)

      const events: AppendedEvent[] = []
      watcher.on('appended', (e: AppendedEvent) => events.push(e))

      // The conversation grows (Cursor replaces the root blob)
      appendCursorTurn(store, '続きをお願い')
      await waitFor(() => events.length > 0)

      const last = events[events.length - 1]
      expect(last.runId).toBe('run1')
      const texts = last.messages.flatMap((m) =>
        m.blocks.filter((b) => b.kind === 'text').map((b) => (b.kind === 'text' ? b.text : ''))
      )
      expect(texts).toContain('続きをお願い')
    } finally {
      watcher.close()
    }
  })

  it('Codex: swaps the provisional stdout view for the structured log automatically', async () => {
    const sessionId = '01a031d7-3381-7603-8c0c-9776aed323ac'
    const stdout = join(root, 'run.log')
    const structured = join(codexDir, '2026', '08', '24', `rollout-now-${sessionId}.jsonl`)
    writeFileSync(stdout, 'Codex CLI の生ログ\n')

    const watcher = new SessionWatcher()
    try {
      const snapshot = watcher.open({
        runId: 'run-codex',
        sessionId,
        logPath: stdout,
        mode: 'stdout',
        resolveWhilePresent: true,
        resolve: () =>
          existsSync(structured) ? { sessionId, logPath: structured, mode: 'codex' } : null
      })
      expect(snapshot.messages.map((m) => m.role)).toEqual(['system'])

      mkdirSync(join(codexDir, '2026', '08', '24'), { recursive: true })
      writeFileSync(
        structured,
        [
          line({
            type: 'response_item',
            payload: { type: 'message', role: 'user', content: [{ type: 'text', text: '調べて' }] }
          }),
          line({
            type: 'response_item',
            payload: {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: '修正します' }]
            }
          })
        ].join('')
      )

      const events: AppendedEvent[] = []
      watcher.on('appended', (event: AppendedEvent) => events.push(event))
      await waitFor(() => events.some((event) => event.messages.some((m) => m.role === 'assistant')))

      const roles = events.flatMap((event) => event.messages.map((m) => m.role))
      expect(roles).toContain('user')
      expect(roles).toContain('assistant')
      expect(roles).not.toContain('system')
      expect(watcher.openSessionId).toBe(sessionId)
    } finally {
      watcher.close()
    }
  })
})

describe('where session logs live', () => {
  it('builds the actual path the CLI writes from cwd and sessionId', () => {
    expect(expectedLogPath('grok', '/w', 'sid')).toBe(join(grokDir, '%2Fw', 'sid', 'chat_history.jsonl'))
    expect(expectedLogPath('cursor', '/w', 'sid')).toBe(
      join(cursorDir, createHash('md5').update('/w').digest('hex'), 'sid', 'store.db')
    )
    // Copilot does not use cwd as the directory name
    expect(expectedLogPath('copilot', '/w', 'sid')).toBe(join(copilotDir, 'sid', 'events.jsonl'))
  })

  it('locates a written log from its sessionId', () => {
    const grok = writeGrok('66666666-6666-6666-6666-666666666666', 'あ')
    expect(resolveLogPath('grok', work, '66666666-6666-6666-6666-666666666666')).toBe(grok)

    const cursor = writeCursor('77777777-7777-7777-7777-777777777777', 'い')
    expect(resolveLogPath('cursor', work, '77777777-7777-7777-7777-777777777777')).toBe(cursor)

    const copilot = writeCopilot('88888888-8888-8888-8888-888888888888', 'う')
    expect(resolveLogPath('copilot', work, '88888888-8888-8888-8888-888888888888')).toBe(copilot)

    const codexId = '01a031d7-3381-7603-8c0c-9776aed323ac'
    const codexDay = join(codexDir, '2026', '08', '24')
    mkdirSync(codexDay, { recursive: true })
    const codex = join(codexDay, `rollout-2026-08-24T12-36-22-${codexId}.jsonl`)
    writeFileSync(codex, line({ type: 'session_meta', payload: { id: codexId } }))
    expect(resolveLogPath('codex', work, codexId)).toBe(codex)
  })

  it('finds it by scanning the root even when cwd has changed', () => {
    writeGrok('99999999-9999-9999-9999-999999999999', 'え', { cwd: '/somewhere/else' })
    expect(resolveLogPath('grok', work, '99999999-9999-9999-9999-999999999999')).toContain(
      '99999999-9999-9999-9999-999999999999'
    )
  })
})

describe('importing external sessions', () => {
  it('finds sessions from all three CLIs and reads their identity', () => {
    writeGrok('aaaaaaaa-1111-1111-1111-111111111111', 'グロックの作業')
    writeCopilot('bbbbbbbb-2222-2222-2222-222222222222', 'コパイロットの作業')
    writeCursor('cccccccc-3333-3333-3333-333333333333', 'カーソルの作業')

    const found = discoverSessions({ since: null, limit: 100 })
    const byAdapter = new Map(found.map((s) => [s.adapter, s]))

    expect(byAdapter.get('grok')?.title).toBe('グロックの作業')
    expect(byAdapter.get('copilot')?.title).toBe('コパイロットの作業')
    expect(byAdapter.get('cursor')?.title).toBe('カーソルの作業')
    for (const adapter of ['grok', 'copilot', 'cursor'] as const) {
      expect(byAdapter.get(adapter)?.cwd).toBe(work)
      expect(byAdapter.get(adapter)?.key).toBe(`${adapter}:${byAdapter.get(adapter)?.sessionId}`)
    }
  })

  it('becomes a task and a Run, with a per-adapter import agent attached', () => {
    writeGrok('aaaaaaaa-4444-4444-4444-444444444444', 'グロックの作業', { ageMs: 60 * 60 * 1000 })
    writeCursor('cccccccc-5555-5555-5555-555555555555', 'カーソルの作業', { ageMs: 60 * 60 * 1000 })

    const db = memoryDb()
    const result = new SessionImporter(db).sync(settings)
    expect(result.createdTasks).toBe(2)

    const titles = repo.listTasks(db).map((t) => t.title)
    expect(titles).toContain('グロックの作業')
    expect(titles).toContain('カーソルの作業')

    // The import definitions are ours to hide from the user, and cannot be used to run anything
    const agents = repo.listAgents(db)
    expect(agents.map((a) => a.name).sort()).toEqual(['Cursor (external)', 'Grok (external)'])
    expect(agents.every((a) => a.source === 'imported' && !a.enabled)).toBe(true)
  })

  it('does not list Cursor sub-agents', () => {
    writeCursor('cccccccc-6666-6666-6666-666666666666', '親の依頼', {
      ageMs: 60 * 60 * 1000,
      subagent: true
    })

    const db = memoryDb()
    const result = new SessionImporter(db).sync(settings)
    expect(result.createdTasks).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('does not import a Cursor chat made in the IDE, since it carries no CLI marker', () => {
    // Observed: only a chat launched from the CLI carries the `cli` marker
    writeCursor('cccccccc-7777-7777-7777-777777777777', 'IDE の会話', { entrypoint: 'ide' })
    const found = discoverSessions({ since: null, limit: 100 })
    expect(found.find((s) => s.adapter === 'cursor')?.entrypoint).toBe('ide')
    expect(startedByProgram('ide')).toBe(false)
  })

  it('Copilot: reads cwd from events.jsonl even when workspace.yaml is missing', () => {
    writeCopilot('bbbbbbbb-8888-8888-8888-888888888888', '認証前の実行', { workspace: false })
    const found = discoverSessions({ since: null, limit: 100 })
    const session = found.find((s) => s.adapter === 'copilot')
    expect(session?.cwd).toBe(work)
    expect(session?.title).toBe('認証前の実行')
  })

  it('Copilot: with a shutdown marker, does not report running even if it wrote a moment ago', () => {
    writeCopilot('bbbbbbbb-9999-9999-9999-999999999999', '終わった作業', { shutdown: true })
    const probe = probeLiveSessions()
    expect(probe.finished('copilot', 'bbbbbbbb-9999-9999-9999-999999999999')).toBe(true)
    expect(isRunning('copilot', 'bbbbbbbb-9999-9999-9999-999999999999', 0, probe)).toBe(false)

    // Without the marker, judge by mtime (the previous behavior)
    writeCopilot('bbbbbbbb-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '続いている作業')
    expect(isRunning('copilot', 'bbbbbbbb-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0, probe)).toBe(true)
  })

  it('judges Grok and Cursor by mtime, since they carry no running marker', () => {
    const probe = probeLiveSessions()
    for (const adapter of ['grok', 'cursor'] as const) {
      expect(probe.authoritative(adapter, 'x')).toBe(false)
      expect(isRunning(adapter, 'x', 10_000, probe)).toBe(true)
      expect(isRunning(adapter, 'x', 60 * 60 * 1000, probe)).toBe(false)
    }
  })

  it('Cursor: does not drop to done after three silent minutes in the middle of a turn', () => {
    /*
     * Cursor rewrites store.db once per turn, so nothing is written while a tool
     * is running. Measured: a 200-second shell run went silent for three and a half
     * minutes, and a live session was being dropped to "done".
     */
    const probe = probeLiveSessions()
    expect(isRunning('cursor', 'x', 5 * 60 * 1000, probe)).toBe(true)
    // For an append-style log, the same five minutes of silence really does mean stopped
    expect(isRunning('claude', 'x', 5 * 60 * 1000, probe)).toBe(false)
  })

  it('Cursor: a chat whose cursor-agent is alive stays running even while silent', () => {
    // Observed: $TMPDIR/cursor-agent-logs-<uid>/session-<time>-<pid>-<n>.log
    const chatId = 'dddddddd-1111-2222-3333-444444444444'
    writeCursorAgentLog(process.pid, chatId)
    // Logs for dead pids stick around forever. Grabbing one would fabricate a running state
    writeCursorAgentLog(deadPid(), 'eeeeeeee-1111-2222-3333-444444444444', 'conversation_id')

    const recentProbe = probeLiveSessions()
    expect(recentProbe.has('cursor', 'eeeeeeee-1111-2222-3333-444444444444')).toBe(false)
    // Read correctly despite the differing spelling (without it, the guarantee does not hold)
    expect(recentProbe.authoritative('cursor', 'eeeeeeee-1111-2222-3333-444444444444')).toBe(true)

    // Treat the log itself as having been silent for 40 minutes, then take a fresh liveness check.
    const probe = probeLiveSessions(Date.now() + 40 * 60 * 1000)
    expect(probe.has('cursor', chatId)).toBe(true)
    // pid and process start time match, so it stays running past the silence window
    expect(isRunning('cursor', chatId, 20 * 60 * 1000, probe)).toBe(true)
    // As long as the pid really is alive, silence alone never drops it to done
    expect(isRunning('cursor', chatId, 40 * 60 * 1000, probe)).toBe(true)
  })

  it('Cursor: marks a chat done without waiting once its cursor-agent has exited', () => {
    // A log exists, so the chat is the CLI's. A dead pid means it has finished
    const chatId = 'dddddddd-9999-2222-3333-444444444444'
    writeCursorAgentLog(deadPid(), chatId)

    const probe = probeLiveSessions()
    expect(probe.has('cursor', chatId)).toBe(false)
    expect(probe.authoritative('cursor', chatId)).toBe(true)
    // Close it without waiting out the silence window (10 minutes)
    expect(isRunning('cursor', chatId, 60_000, probe)).toBe(false)
  })

  it('Cursor: does not conclude an IDE chat has exited just because it carries no marker', () => {
    // A single CLI log makes it look like the mechanism is working, but
    // an IDE chat writes no log at all. Concluding from that drops it to done the moment it opens
    writeCursorAgentLog(process.pid, 'dddddddd-1111-2222-3333-444444444444')
    const probe = probeLiveSessions()
    expect(probe.authoritative('cursor', 'ide-chat')).toBe(false)
    expect(isRunning('cursor', 'ide-chat', 60_000, probe)).toBe(true)
  })

  it('Cursor: reads last-write from the WAL and meta.json too (store.db only moves on checkpoint)', () => {
    const chatId = 'ffffffff-1111-2222-3333-444444444444'
    const store = writeCursor(chatId, 'WAL に書いた続き', { ageMs: 60 * 60 * 1000 })
    // Build the state where the main file is an hour old and the write sits in the WAL
    const now = new Date()
    writeFileSync(`${store}-wal`, 'x')
    utimesSync(`${store}-wal`, now, now)

    expect(lastWrittenMs('cursor', store)).toBeGreaterThan(Date.now() - 10_000)

    const session = discoverSessions({ since: null, limit: 100 }).find((s) => s.adapter === 'cursor')
    expect(session?.sessionId).toBe(chatId)
    // Back when only the main file was read, this looked like an hour-old update
    expect(Date.now() - Date.parse(session?.updatedAt ?? '')).toBeLessThan(10_000)
  })

  it('Cursor: ignores store.db-shm (merely reading it from Quuu moves its mtime)', () => {
    const chatId = 'ffffffff-5555-2222-3333-444444444444'
    const store = writeCursor(chatId, '終わった会話', { ageMs: 60 * 60 * 1000 })
    const now = new Date()
    writeFileSync(`${store}-shm`, 'x')
    utimesSync(`${store}-shm`, now, now)

    // Counting shm would make every chat look like it was written just now, forever
    expect(Date.now() - (lastWrittenMs('cursor', store) ?? 0)).toBeGreaterThan(30 * 60 * 1000)
  })
})

/**
 * The log cursor-agent leaves for each running process (shape as observed).
 *
 * The chat id key is spelled camelCase or snake_case depending on the run.
 */
function writeCursorAgentLog(
  pid: number,
  chatId: string,
  key: 'conversationId' | 'conversation_id' = 'conversationId'
): void {
  const dir = join(root, 'cursor-agent-logs')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `session-2026-08-22T06-40-53-932Z-${pid}-1.log`),
    [
      '--- Cursor Agent Debug Session 2026-08-22T06:40:53.942Z ---',
      JSON.stringify({ event: 'debug-session-start', pid }),
      `[2026-08-22T06:40:54.004Z] conversationClassification.init {"${key}":"${chatId}"}`
    ].join('\n')
  )
}

/** A pid that is not alive. Look for a large value that has not been recycled. */
function deadPid(): number {
  for (let pid = 99_990; pid > 90_000; pid -= 1) {
    try {
      process.kill(pid, 0)
    } catch {
      return pid
    }
  }
  throw new Error('no free pid found')
}

function readLines(path: string): string[] {
  return readFileSync(path, 'utf8').split('\n')
}

/**
 * Extend the conversation by one turn.
 * Cursor does not append; it adds a message blob and replaces the root (cursorStore.ts).
 */
function appendCursorTurn(storePath: string, prompt: string): void {
  const db = new DatabaseSync(storePath)
  const meta = JSON.parse(
    Buffer.from(
      (db.prepare("SELECT value FROM meta WHERE key = '0'").get() as { value: string }).value,
      'hex'
    ).toString('utf8')
  ) as { latestRootBlobId: string; agentId: string; name: string }

  const previous = db.prepare('SELECT data FROM blobs WHERE id = ?').get(meta.latestRootBlobId) as {
    data: Uint8Array
  }
  const ids = scanFields(previous.data)
    .filter((f) => f.number === 1 && f.bytes?.length === 32)
    .map((f) => Buffer.from(f.bytes as Uint8Array))

  const added = Buffer.from(
    JSON.stringify({ role: 'user', content: [{ type: 'text', text: `<user_query>\n${prompt}\n</user_query>` }] }),
    'utf8'
  )
  const addedId = createHash('sha256').update(added).digest()
  db.prepare('INSERT OR REPLACE INTO blobs (id, data) VALUES (?, ?)').run(
    addedId.toString('hex'),
    added
  )

  const root = protoRoot([...ids, addedId], 'cli', work)
  const rootId = createHash('sha256').update(root).digest('hex')
  db.prepare('INSERT OR REPLACE INTO blobs (id, data) VALUES (?, ?)').run(rootId, root)
  db.prepare("UPDATE meta SET value = ? WHERE key = '0'").run(
    Buffer.from(JSON.stringify({ ...meta, latestRootBlobId: rootId })).toString('hex')
  )
  db.close()
}

/** Follow-up arrives through a 200ms debounce and 1-second polling. */
async function waitFor(done: () => boolean, timeoutMs = 4000): Promise<void> {
  const started = Date.now()
  while (!done()) {
    if (Date.now() - started > timeoutMs) throw new Error('waited for follow-up but none arrived')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
