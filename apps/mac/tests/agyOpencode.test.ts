import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promptAsValue, resumeInvocation } from '../src/main/agents/cli.js'
import * as repo from '../src/main/db/repo.js'
import { discoverSessions, startedByProgram } from '../src/main/import/adapters.js'
import { SessionImporter, isRunning } from '../src/main/import/importer.js'
import { probeLiveSessions, resetLivenessMemo } from '../src/main/import/liveness.js'
import { AgySessionParser } from '../src/main/agent-adapters/agy/parser.js'
import { sessionKey } from '../src/main/session/index.js'
import { expectedLogPath, lastWrittenMs, resolveLogPath } from '../src/main/session/logAdapters.js'
import { OpencodeSessionParser } from '../src/main/agent-adapters/opencode/parser.js'
import { canRecoverSessionId, findSessionId } from '../src/main/session/sessionIdentity.js'
import { sessionIdInStdout } from '../src/main/session/stdoutSessionId.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { isolateSessionDirs, memoryDb, releaseSessionDirs } from './helpers.js'

// node:sqlite cannot be imported statically (same reason as vitest.config.ts / database.ts)
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

/**
 * Support for the Antigravity CLI (`agy`) and for opencode.
 *
 * The shapes here were measured by running both CLIs on this machine, down to the quoting
 * `opencode run` puts around a prompt and the fact that the Antigravity transcript records no
 * working directory at all. A fixture whose shape differs from the real thing proves nothing, so
 * these are written the way the CLIs write them.
 */

let root: string
let agyDir: string
let opencodeDb: string
let work: string

const line = (o: unknown): string => `${JSON.stringify(o)}\n`

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'taskd-agy-'))
  const dirs = isolateSessionDirs(root)
  agyDir = dirs.agy
  opencodeDb = dirs.opencodeDb
  work = join(root, 'work')
  mkdirSync(work, { recursive: true })
  resetLivenessMemo()
})

afterEach(() => {
  releaseSessionDirs()
  rmSync(root, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Antigravity (agy)
// ---------------------------------------------------------------------------

/** `<root>/brain/<conversationId>/.system_generated/logs/transcript.jsonl` (+ the cwd cache) */
function writeAgy(
  conversationId: string,
  prompt: string,
  options: { ageMs?: number; cwd?: string; title?: string; mapped?: boolean } = {}
): string {
  const path = join(
    agyDir,
    'brain',
    conversationId,
    '.system_generated',
    'logs',
    'transcript.jsonl'
  )
  mkdirSync(dirname(path), { recursive: true })
  const at = new Date(Date.now() - (options.ageMs ?? 0)).toISOString()

  writeFileSync(
    path,
    [
      line({
        step_index: 0,
        source: 'USER_EXPLICIT',
        type: 'USER_INPUT',
        status: 'DONE',
        created_at: at,
        // The CLI appends its own metadata to whatever the human typed
        content: `<USER_REQUEST>\n${prompt}\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\nThe current local time is: ${at}.\n</ADDITIONAL_METADATA>`
      }),
      // Injected context, written under the SYSTEM source
      line({ step_index: 1, source: 'SYSTEM', type: 'EPHEMERAL_MESSAGE', status: 'DONE', content: '<reminder>気をつけて</reminder>' }),
      line({
        step_index: 2,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: at,
        thinking: '考えている',
        // Every argument value arrives as a JSON-encoded string
        tool_calls: [{ name: 'run_command', args: { CommandLine: '"ls -la"', Cwd: `"${work}"` } }]
      }),
      // The result of the call before it. Named after the tool, or simply GENERIC
      line({ step_index: 3, source: 'MODEL', type: 'GENERIC', status: 'DONE', created_at: at, content: 'total 0' }),
      line({ step_index: 4, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: at, content: '終わりました' })
    ].join('')
  )

  if (options.mapped !== false) {
    const cachePath = join(agyDir, 'cache', 'last_conversations.json')
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, JSON.stringify({ [options.cwd ?? work]: conversationId }, null, 2))
  }
  if (options.title) {
    const annotations = join(agyDir, 'annotations')
    mkdirSync(annotations, { recursive: true })
    writeFileSync(join(annotations, `${conversationId}.pbtxt`), `title:"${options.title}"\n`)
  }

  const when = new Date(Date.now() - (options.ageMs ?? 0))
  utimesSync(path, when, when)
  return path
}

// ---------------------------------------------------------------------------
// opencode
// ---------------------------------------------------------------------------

/** One SQLite store holds every session, so the fixture opens the same file every time. */
function openStore(): InstanceType<typeof DatabaseSync> {
  mkdirSync(dirname(opencodeDb), { recursive: true })
  const db = new DatabaseSync(opencodeDb)
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_v2 (
      id text PRIMARY KEY, project_id text NOT NULL, parent_id text, slug text NOT NULL,
      directory text NOT NULL, title text, version text NOT NULL,
      time_created integer NOT NULL, time_updated integer NOT NULL,
      time_idle integer, idle_outcome text
    );
    CREATE TABLE IF NOT EXISTS session_message (
      id text PRIMARY KEY, session_id text NOT NULL, type text NOT NULL, seq integer NOT NULL,
      time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL
    );
  `)
  return db
}

function writeOpencode(
  sessionId: string,
  prompt: string,
  options: {
    ageMs?: number
    cwd?: string
    title?: string
    parentId?: string
    idle?: boolean
  } = {}
): string {
  const db = openStore()
  const updated = Date.now() - (options.ageMs ?? 0)
  const created = updated - 60_000
  db.prepare(
    `INSERT OR REPLACE INTO session_v2
       (id, project_id, parent_id, slug, directory, title, version, time_created, time_updated, time_idle, idle_outcome)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    sessionId,
    'prj_1',
    options.parentId ?? null,
    'slug',
    options.cwd ?? work,
    options.title ?? null,
    '2.0.8',
    created,
    updated,
    options.idle ? updated : null,
    options.idle ? 'succeeded' : null
  )

  const insert = db.prepare(
    `INSERT OR REPLACE INTO session_message (id, session_id, type, seq, time_created, time_updated, data)
     VALUES (?,?,?,?,?,?,?)`
  )
  // The CLI records a prompt it was handed on the command line wrapped in quotes
  insert.run(`msg_${sessionId}_u`, sessionId, 'user', 1, created, created, JSON.stringify({
    time: { created },
    text: `"${prompt}"`,
    files: []
  }))
  insert.run(`msg_${sessionId}_a`, sessionId, 'assistant', 2, created, updated, JSON.stringify({
    time: { created, completed: updated },
    agent: 'build',
    model: { id: 'gpt-5.4', providerID: 'github-copilot' },
    content: [
      { type: 'reasoning', text: '考えている' },
      { type: 'text', text: '直します' },
      {
        type: 'tool',
        id: 'call-1',
        name: 'write',
        state: {
          status: 'completed',
          input: { path: 'a.ts', content: 'x' },
          content: [{ type: 'text', text: '書いた' }]
        }
      }
    ],
    finish: 'stop'
  }))
  if (options.idle) {
    insert.run(`msg_${sessionId}_i`, sessionId, 'idle', 3, updated, updated, JSON.stringify({
      time: { created: updated },
      outcome: 'succeeded'
    }))
  }
  db.close()
  return opencodeDb
}

const settings = { ...DEFAULT_SETTINGS, importHistoryDays: 30 }

// ---------------------------------------------------------------------------

describe('session log parsing', () => {
  it('Antigravity: shows what the human asked, not the metadata wrapped around it', () => {
    const path = writeAgy('11111111-1111-1111-1111-111111111111', 'テストを直して')
    const parser = new AgySessionParser()
    parser.pushLines(readLines(path))

    expect(parser.messages.filter((m) => m.role === 'user')).toHaveLength(1)
    expect(parser.messages[0].blocks).toEqual([{ kind: 'text', text: 'テストを直して' }])
    expect(parser.title).toBe('テストを直して')
    // Context the CLI injects is not something the human said
    expect(parser.messages.some((m) => m.blocks.some((b) => b.kind === 'text' && b.text.includes('reminder')))).toBe(false)
  })

  it('Antigravity: folds the step after a call into the call, since calls carry no id', () => {
    const path = writeAgy('11111111-2222-2222-2222-222222222222', '一覧して')
    const parser = new AgySessionParser()
    parser.pushLines(readLines(path))

    const tool = parser.messages.flatMap((m) => m.blocks).find((b) => b.kind === 'tool')
    expect(tool?.kind === 'tool' && tool.tool.name).toBe('run_command')
    // Argument values arrive JSON-encoded, so they are decoded before being handed over
    expect(tool?.kind === 'tool' && tool.tool.input).toEqual({ CommandLine: 'ls -la', Cwd: work })
    expect(tool?.kind === 'tool' && tool.tool.target).toBe('ls -la')
    expect(tool?.kind === 'tool' && tool.tool.result).toBe('total 0')
  })

  it('Antigravity: a step the CLI writes twice appears once', () => {
    const parser = new AgySessionParser()
    const step = (status: string, text: string): string =>
      line({ step_index: 7, source: 'MODEL', type: 'PLANNER_RESPONSE', status, content: text })

    parser.pushLines([step('ACTIVE', '書いて')])
    const second = parser.pushLines([step('DONE', '書いています')])

    expect(parser.messages).toHaveLength(1)
    expect(parser.messages[0].blocks).toEqual([{ kind: 'text', text: '書いています' }])
    // The row that changed is where the re-paste starts
    expect(second.changedFromIndex).toBe(0)
  })

  it('opencode: builds the conversation out of the shared store', () => {
    const store = writeOpencode('ses_aaa', 'テストを直して')
    const parser = new OpencodeSessionParser()
    parser.reload(store, 'ses_aaa')

    // The quotes `opencode run` wraps a command-line prompt in are not part of what was typed
    expect(parser.messages[0].blocks).toEqual([{ kind: 'text', text: 'テストを直して' }])
    expect(parser.title).toBe('テストを直して')

    const assistant = parser.messages.find((m) => m.role === 'assistant')
    expect(assistant?.model).toBe('gpt-5.4')
    expect(assistant?.blocks.map((b) => b.kind)).toEqual(['thinking', 'text', 'tool'])
    const tool = assistant?.blocks.find((b) => b.kind === 'tool')
    expect(tool?.kind === 'tool' && tool.tool.result).toBe('書いた')
    expect(tool?.kind === 'tool' && tool.tool.target).toBe('a.ts')
  })

  it('opencode: returns -1 when re-reading finds no change, and keeps what it had when unreadable', () => {
    const store = writeOpencode('ses_bbb', '変わらない')
    const parser = new OpencodeSessionParser()
    expect(parser.reload(store, 'ses_bbb').changedFromIndex).toBe(0)
    expect(parser.reload(store, 'ses_bbb').changedFromIndex).toBe(-1)

    const broken = join(root, 'broken.db')
    writeFileSync(broken, 'これは SQLite ではない')
    expect(parser.reload(broken, 'ses_bbb').changedFromIndex).toBe(-1)
    expect(parser.messages).toHaveLength(2)
  })

  it('opencode: two sessions in one store never share a conversation key', () => {
    const target = (sessionId: string): Parameters<typeof sessionKey>[0] => ({
      sessionId,
      logPath: opencodeDb,
      mode: 'opencode' as const,
      awaitingStructured: false
    })
    expect(sessionKey(target('ses_aaa'))).not.toBe(sessionKey(target('ses_bbb')))
    // A layout with a file per session is keyed by that file, exactly as before
    expect(sessionKey({ sessionId: 'x', logPath: '/l.jsonl', mode: 'claude', awaitingStructured: false })).toBe(
      sessionKey({ sessionId: 'y', logPath: '/l.jsonl', mode: 'claude', awaitingStructured: false })
    )
  })
})

describe('recovering the session id', () => {
  it('Antigravity: takes the conversation off the line the CLI opens its stream with', () => {
    const log = join(root, 'run.log')
    writeFileSync(
      log,
      [
        // Quuu writes the command first, and a prompt can quote anything at all
        `# cmd: agy --print='{"event":"init","conversation_id":"00000000-0000-0000-0000-000000000000"} を直して'`,
        line({ event: 'init', conversation_id: 'd0e17550-4e2f-4180-a61c-d270facadc77', init: { cwd: work } }).trim(),
        line({ event: 'result', result: { conversation_id: 'd0e17550-4e2f-4180-a61c-d270facadc77', status: 'SUCCESS' } }).trim()
      ].join('\n')
    )

    expect(sessionIdInStdout(log, 'agy')).toBe('d0e17550-4e2f-4180-a61c-d270facadc77')
  })

  it('Antigravity: says nothing when the stream carries no init line', () => {
    const log = join(root, 'plain.log')
    // Without --output-format stream-json the CLI prints the reply and nothing else
    writeFileSync(log, 'hello\n')
    expect(sessionIdInStdout(log, 'agy')).toBeNull()
    expect(canRecoverSessionId('agy')).toBe(false)
  })

  it('opencode: pins down the session the CLI created from its directory and start time', () => {
    expect(canRecoverSessionId('opencode')).toBe(true)

    const startedAtMs = Date.now() - 120_000
    writeOpencode('ses_mine', '走らせた作業')

    expect(findSessionId('opencode', { cwd: work, startedAtMs, claimed: new Set<string>() })).toBe('ses_mine')
  })

  it('opencode: takes neither a claimed session, an older one, nor a sub-agent of another', () => {
    const startedAtMs = Date.now() - 120_000
    writeOpencode('ses_claimed', '別の Run の作業')
    expect(
      findSessionId('opencode', { cwd: work, startedAtMs, claimed: new Set(['ses_claimed']) })
    ).toBeNull()

    // Anything that started before our own launch is not our session
    expect(
      findSessionId('opencode', { cwd: work, startedAtMs: Date.now() + 60_000, claimed: new Set<string>() })
    ).toBeNull()

    writeOpencode('ses_child', 'サブエージェントの作業', { parentId: 'ses_claimed' })
    expect(
      findSessionId('opencode', { cwd: work, startedAtMs, claimed: new Set(['ses_claimed']) })
    ).toBeNull()
  })
})

describe('where session logs live', () => {
  it('Antigravity: a conversation is found by its id, whatever the working directory', () => {
    const transcript = writeAgy('22222222-1111-1111-1111-111111111111', 'あ')
    expect(expectedLogPath('agy', '/anywhere', '22222222-1111-1111-1111-111111111111')).toBe(transcript)
    expect(resolveLogPath('agy', '/anywhere', '22222222-1111-1111-1111-111111111111')).toBe(transcript)
  })

  it('opencode: answers with the store only once the session is really in it', () => {
    // The store exists from the first run onwards, so its presence says nothing about a session
    writeOpencode('ses_present', 'ある作業')
    expect(expectedLogPath('opencode', work, 'ses_missing')).toBeNull()
    expect(expectedLogPath('opencode', work, 'ses_present')).toBe(opencodeDb)
    expect(resolveLogPath('opencode', work, 'ses_present')).toBe(opencodeDb)
  })

  it('opencode: a session is only as fresh as its own row, not as the store it sits in', () => {
    writeOpencode('ses_old', '一時間前の作業', { ageMs: 60 * 60 * 1000 })
    // Someone else writing to the store moves the file's timestamp, but not this session's
    writeOpencode('ses_new', 'たった今の作業')

    const idleMs = Date.now() - (lastWrittenMs('opencode', opencodeDb, 'ses_old') ?? 0)
    expect(idleMs).toBeGreaterThan(30 * 60 * 1000)
  })
})

describe('importing external sessions', () => {
  it('Antigravity: reads cwd out of the cache and prefers the title the CLI generated', () => {
    writeAgy('33333333-1111-1111-1111-111111111111', '最初の依頼', { title: 'Fixing the tests' })

    const session = discoverSessions({ since: null, limit: 100 }).find((s) => s.adapter === 'agy')
    expect(session?.cwd).toBe(work)
    expect(session?.title).toBe('Fixing the tests')
    expect(session?.key).toBe('agy:33333333-1111-1111-1111-111111111111')
  })

  it('Antigravity: leaves a conversation whose directory is unknown out, rather than guessing one', () => {
    // Only the newest conversation per directory is recorded, so an older one cannot be placed
    writeAgy('33333333-2222-2222-2222-222222222222', '置き場所の分からない会話', { mapped: false })
    expect(discoverSessions({ since: null, limit: 100 }).some((s) => s.adapter === 'agy')).toBe(false)
  })

  it('opencode: becomes a task with the prompt as its title', () => {
    writeOpencode('ses_import', 'オープンコードの作業', { ageMs: 60 * 60 * 1000, idle: true })

    const db = memoryDb()
    expect(new SessionImporter(db).sync(settings).createdTasks).toBe(1)
    expect(repo.listTasks(db).map((t) => t.title)).toContain('オープンコードの作業')
    expect(repo.listAgents(db).map((a) => a.name)).toEqual(['opencode (external)'])
  })

  it('opencode: does not list a session an agent started for itself', () => {
    writeOpencode('ses_parent', '親の依頼', { ageMs: 60 * 60 * 1000, idle: true })
    writeOpencode('ses_sub', '子の作業', { ageMs: 60 * 60 * 1000, idle: true, parentId: 'ses_parent' })

    const found = discoverSessions({ since: null, limit: 100 })
    expect(found.find((s) => s.sessionId === 'ses_sub')?.entrypoint).toBe('opencode-subagent')
    expect(startedByProgram('opencode-subagent')).toBe(true)

    const db = memoryDb()
    const result = new SessionImporter(db).sync(settings)
    expect(result.createdTasks).toBe(1)
    expect(result.skipped).toBe(1)
  })

  it('opencode: once the session goes idle it is finished, however busy the store is', () => {
    writeOpencode('ses_done', '終わった作業', { idle: true })
    const probe = probeLiveSessions()
    expect(probe.finished('opencode', 'ses_done')).toBe(true)
    expect(isRunning('opencode', 'ses_done', 0, probe)).toBe(false)

    writeOpencode('ses_busy', '動いている作業')
    expect(probe.finished('opencode', 'ses_busy')).toBe(false)
    expect(isRunning('opencode', 'ses_busy', 0, probe)).toBe(true)
  })
})

describe('calling the CLI back', () => {
  it('reopens the same conversation with the words each CLI uses for it', () => {
    expect(resumeInvocation({ command: 'agy', sessionId: 'c-1' })).toEqual({
      command: 'agy',
      args: ['--conversation', 'c-1'],
      cliName: 'Antigravity'
    })
    expect(resumeInvocation({ command: 'opencode', sessionId: 'ses_1' })).toEqual({
      command: 'opencode',
      args: ['--session', 'ses_1'],
      cliName: 'opencode'
    })
    // An imported session records no command, so the CLI is decided by how its log is read
    expect(resumeInvocation({ adapter: 'agy', sessionId: 'c-2' })?.command).toBe('agy')
    expect(resumeInvocation({ adapter: 'opencode', sessionId: 'ses_2' })?.command).toBe('opencode')
  })

  it('keeps a prompt a prompt in the spelling each CLI accepts', () => {
    // agy reads the prompt as --print's value, and only the attached form survives a leading dash
    expect(promptAsValue('agy', ['--print', '{{prompt}}'])).toEqual(['--print={{prompt}}'])
    expect(promptAsValue('agy', ['--print={{prompt}}'])).toEqual(['--print={{prompt}}'])
    /*
     * opencode has nothing to rewrite to: `--` makes it repeat the message or wait forever, so
     * the template is left exactly as it is rather than being "fixed" into something broken.
     */
    expect(promptAsValue('opencode', ['run', '--auto', '{{prompt}}'])).toEqual([
      'run',
      '--auto',
      '{{prompt}}'
    ])
  })
})

// ---------------------------------------------------------------------------

function readLines(path: string): string[] {
  return readFileSync(path, 'utf8').split('\n')
}
