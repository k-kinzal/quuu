import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LogAdapterSchema } from '../src/api/schemas/agents.js'
import { adapterFor } from '../src/main/agent-adapters/registry.js'
import { piDirName } from '../src/main/agent-adapters/pi/layout.js'
import { PiSessionParser } from '../src/main/agent-adapters/pi/parser.js'
import { piCli } from '../src/main/agent-clis/pi.js'
import { promptAsValue, resumeInvocation } from '../src/main/agents/cli.js'
import { legacyRunAdapter } from '../src/main/agents/cliAdapter.js'
import * as repo from '../src/main/db/repo.js'
import { discoverSessions } from '../src/main/import/adapters.js'
import { seedIfEmpty, offerNewAgents } from '../src/main/seed.js'
import { resolveLogPath } from '../src/main/session/logAdapters.js'
import { IndexedMessages } from '../src/main/session/messageBuffer.js'
import type { SessionMessage } from '../src/main/session/types.js'
import { sessionIdInStdout } from '../src/main/session/stdoutSessionId.js'
import { isolateSessionDirs, makeAgent, memoryDb, releaseSessionDirs } from './helpers.js'

vi.mock('../src/main/platform/shellEnv.js', () => ({
  resolveLoginPath: () => Promise.resolve('/test/bin'),
  commandExists: (command: string) => command === 'pi'
}))

let root: string
let sessions: string
let cwd: string
const at = '2026-10-10T01:02:03.000Z'
const json = (value: unknown): string => JSON.stringify(value)
const entry = (id: string, message: unknown): string => json({ type: 'message', id, parentId: null, timestamp: at, message })

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'quuu-pi-'))
  sessions = isolateSessionDirs(root).pi
  cwd = join(root, 'work')
  mkdirSync(cwd)
})
afterEach(() => {
  vi.unstubAllEnvs()
  releaseSessionDirs()
  rmSync(root, { recursive: true, force: true })
})

function writeSession(id = '11111111-1111-4111-8111-111111111111', work = cwd): string {
  const path = join(sessions, piDirName(work), `2026-10-10T01-02-03-000Z_${id}.jsonl`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, [
    json({ type: 'session', version: 3, id, timestamp: at, cwd: work }),
    entry('user', { role: 'user', content: '  Fix it\nwithout rewriting my prompt.  ', timestamp: Date.parse(at) }),
    entry('assistant', { role: 'assistant', model: 'test-model', stopReason: 'stop', content: [{ type: 'text', text: 'Fixed.' }] })
  ].join('\n') + '\n')
  return path
}

describe('Pi registration and invocation', () => {
  it('offers an installed Pi once on existing databases and respects deletion', async () => {
    const db = memoryDb()
    try {
      makeAgent(db, { name: 'Existing' })
      await offerNewAgents(db)
      const pi = repo.listAgents(db).find(a => a.command === 'pi')!
      expect(pi).toMatchObject({ name: 'Pi', logAdapter: 'pi', enabled: false, concurrency: 1 })
      expect(pi.argsTemplate).toEqual(piCli.argsTemplate)
      expect(pi.resumeArgsTemplate).toEqual(piCli.resumeArgsTemplate)
      await offerNewAgents(db)
      expect(repo.listAgents(db).filter(a => a.command === 'pi')).toHaveLength(1)
      repo.deleteAgent(db, pi.id)
      await offerNewAgents(db)
      expect(repo.listAgents(db).some(a => a.command === 'pi')).toBe(false)
    } finally { db.close() }
  })

  it('seeds Pi disabled on first launch and recognizes it through the API and command path', async () => {
    const db = memoryDb()
    try {
      await seedIfEmpty(db)
      expect(repo.listAgents(db).find(a => a.command === 'pi')).toMatchObject({ enabled: false, logAdapter: 'pi' })
      expect(LogAdapterSchema.parse('pi')).toBe('pi')
      expect(legacyRunAdapter({ command: 'C:\\bin\\pi.cmd' }, null)).toBe('pi')
    } finally { db.close() }
  })

  it('preserves dash-prefixed multiline prompts and uses the existing session for follow-ups and terminal resume', () => {
    const prompt = '--help\n  日本語 {{sessionId}}  '
    const vars = { prompt, sessionId: 'pi-session', title: '', projectPath: cwd, projectName: '', taskId: '', runId: '' }
    const initial = adapterFor('pi').invoke({ command: '/bin/pi', template: piCli.argsTemplate, vars })
    expect(initial.args).toEqual(['--print', '--mode', 'json', '--approve', '--session-id', 'pi-session', '--', prompt])
    const resumed = adapterFor('pi').invoke({ command: 'pi', template: piCli.resumeArgsTemplate, vars })
    expect(resumed.args).toContain('--session')
    expect(resumed.args).not.toContain('--session-id')
    expect(resumeInvocation({ adapter: 'pi', sessionId: 'pi-session' })).toEqual({ command: 'pi', cliName: 'Pi', args: ['--session', 'pi-session'] })
    expect(promptAsValue('pi', ['--print', '{{prompt}}'])).toEqual(['--print', '--', '{{prompt}}'])
  })
})

describe('Pi session discovery and parsing', () => {
  it('locates timestamped logs by header identity and imports their original cwd and prompt', () => {
    const path = writeSession()
    const id = '11111111-1111-4111-8111-111111111111'
    expect(resolveLogPath('pi', cwd, id)).toBe(path)
    expect(resolveLogPath('pi', '/unknown', id)).toBe(path)
    expect(sessionIdInStdout(path, 'pi')).toBe(id)
    const sessions = discoverSessions({ since: null, limit: 20 })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ adapter: 'pi', key: `pi:${id}`, cwd, title: 'Fix it', logPath: path, startedAt: at })
    const parser = new PiSessionParser()
    parser.pushLines(readFileSync(path, 'utf8').split('\n'))
    expect(parser.messages[0]).toMatchObject({ role: 'user', cwd, timestamp: at, blocks: [{ kind: 'text', text: '  Fix it\nwithout rewriting my prompt.  ' }] })
    expect(parser.messages[1]).toMatchObject({ model: 'test-model', role: 'assistant' })
    appendFileSync(path, json({ type: 'session_info', name: 'Named session' }) + '\n')
    expect(discoverSessions({ since: null, limit: 20 })[0].title).toBe('Named session')
  })

  it('rejects another cwd with the same directory encoding during identity recovery', () => {
    const a = join(root, 'a', 'b')
    const b = join(root, 'a-b')
    expect(piDirName(a)).toBe(piDirName(b))
    writeSession('collision', b)
    expect(adapterFor('pi').sessionCandidates?.(a)).toEqual([])
    expect(adapterFor('pi').recoverSessionId?.({ cwd: a, startedAtMs: Date.now(), claimed: new Set() })).toBeNull()
    expect(adapterFor('pi').recoverSessionId?.({ cwd: b, startedAtMs: Date.now(), claimed: new Set() })).toBe('collision')
    expect(adapterFor('pi').recoverSessionId?.({ cwd: b, startedAtMs: Date.now(), claimed: new Set(['collision']) })).toBeNull()
    expect(piDirName('C:\\Users\\dev\\repo')).toBe('--C--Users-dev-repo--')
  })

  it('finds flat custom session directories without escaping Quuu test overrides', () => {
    const source = writeSession('custom')
    const path = join(sessions, '2026-10-10T01-02-03-000Z_custom.jsonl')
    renameSync(source, path)
    vi.stubEnv('PI_CODING_AGENT_SESSION_DIR', join(root, 'other-pi-sessions'))
    expect(resolveLogPath('pi', cwd, 'custom')).toBe(path)
    expect(adapterFor('pi').recoverSessionId?.({ cwd, startedAtMs: Date.now(), claimed: new Set() })).toBe('custom')
    expect(discoverSessions({ since: null, limit: 20 })).toHaveLength(1)
  })

  it('folds late tool results into indexed calls and keeps images outside the message payload', () => {
    const saved = new Map<number, SessionMessage>()
    const buffer = new IndexedMessages(index => saved.get(index))
    const parser = new PiSessionParser('pi-test', buffer)
    parser.pushLines([
      json({ type: 'session', cwd }),
      entry('call', { role: 'assistant', model: 'test', content: [
        { type: 'thinking', thinking: 'Inspect the file' },
        { type: 'toolCall', id: 'read-1', name: 'read', arguments: { path: 'file.png' } }
      ] })
    ])
    for (const change of buffer.takeChanges()) saved.set(change.index, change.message)
    expect(parser.pushLines([entry('result', { role: 'toolResult', toolCallId: 'read-1', isError: true, content: [
      { type: 'text', text: 'Partial result' }, { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' }
    ] })]).changedFromIndex).toBe(0)
    const changed = buffer.takeChanges()[0].message
    expect(changed.blocks[0]).toEqual({ kind: 'thinking', text: 'Inspect the file' })
    const block = changed.blocks[1]
    expect(block).toMatchObject({ kind: 'tool', tool: { target: 'file.png', result: 'Partial result', isError: true } })
    if (block.kind !== 'tool') throw new Error('missing tool')
    expect(parser.images.get(block.tool.images[0].id)).toBe('data:image/png;base64,aGVsbG8=')
    expect(JSON.stringify(changed)).not.toContain('aGVsbG8=')
  })

  it('does not attribute extension context or compaction summaries to the human', () => {
    const parser = new PiSessionParser()
    parser.pushLines([
      'not JSON', 'null', '{}',
      entry('system', { role: 'system', content: 'AGENTS.md' }),
      json({ type: 'custom_message', id: 'hidden', content: 'Hidden context', display: false }),
      json({ type: 'custom_message', id: 'visible', content: 'Extension context', display: true }),
      json({ type: 'compaction', id: 'summary', summary: 'A summary' }),
      entry('human', { role: 'user', content: 'Original human input' }),
      entry('error', { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'Invalid API key' })
    ])
    expect(parser.messages.map(m => m.role)).toEqual(['system', 'system', 'user', 'assistant'])
    expect(parser.title).toBe('Original human input')
    expect(parser.messages.at(-1)?.blocks).toEqual([{ kind: 'text', text: 'Invalid API key' }])
  })
})

describe('Pi result classification', () => {
  const input = { exitCode: 0, signal: null, canceled: false, timedOut: false, limitPatterns: [] }
  const end = (stopReason: string, errorMessage?: string): string => json({ type: 'message_end', message: { role: 'assistant', stopReason, errorMessage } })

  it.each([
    ['429 rate limit exceeded', 'limit'],
    ['Invalid API key', 'auth'],
    ['Connection refused', 'nonzero-exit']
  ])('classifies a zero-exit failed turn: %s', (reason, kind) => {
    const output = `${end('error', reason)}\n${json({ type: 'agent_settled', aborted: false })}`
    expect(adapterFor('pi').classify({ ...input, output })).toMatchObject({ kind, message: reason })
    expect(adapterFor('pi').classifyDetached({ ...input, output }).kind).toBe(kind)
    expect(adapterFor('pi').classify({ ...input, output, canceled: true }).kind).toBe('canceled')
    expect(adapterFor('pi').classify({ ...input, output, timedOut: true }).kind).toBe('timeout')
  })

  it('keeps successful retries and replies discussing limits successful after restart too', () => {
    const output = [end('error', '429 rate limit'), json({ type: 'message_end', message: {
      role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'I fixed the rate limit handling.' }]
    } }), json({ type: 'agent_settled', aborted: false })].join('\n')
    expect(adapterFor('pi').classify({ ...input, output }).kind).toBeNull()
    expect(adapterFor('pi').classifyDetached({ ...input, output }).kind).toBeNull()
  })

  it('reads terminal agent envelopes even when the beginning of the log tail was cut off', () => {
    const output = 'truncated JSON\n' + json({ type: 'agent_end', messages: [{ role: 'assistant', stopReason: 'error', errorMessage: '401 unauthorized' }] })
    expect(adapterFor('pi').classify({ ...input, output }).kind).toBe('auth')
    expect(adapterFor('pi').classify({ ...input, output: json({ type: 'agent_settled', aborted: true }) }).kind).toBe('nonzero-exit')
  })

  it('keeps native limits detectable with custom patterns and does not assume Pi providers share an account', () => {
    expect(adapterFor('pi').classify({ ...input, limitPatterns: ['custom-limit'], output: end('error', '429 rate limit exceeded') }).kind).toBe('limit')
    expect(adapterFor('pi').limitScope('Your weekly usage limit has been reached')).toEqual({ kind: 'unstated' })
  })
})
