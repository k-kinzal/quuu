import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import * as repo from '../src/main/db/repo.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { SessionImporter } from '../src/main/import/importer.js'
import { resetLivenessMemo } from '../src/main/import/liveness.js'
import { slugForCwd } from '../src/main/agent-adapters/claude/paths.js'
import { argsCarrySessionId } from '../src/main/session/sessionIdentity.js'
import { findClaudeSessionId } from '../src/main/agent-adapters/claude/identity.js'
import { isolateSessionDirs, makeAgent, makeProject, makeTask, memoryDb, releaseSessionDirs } from './helpers.js'

/**
 * When the args template does not pass `{{sessionId}}`, the CLI picks its own
 * session ID. The ID Quuu recorded then never exists, and import mistakes the
 * agent Quuu itself launched for an external session, producing "a concurrency-1
 * project with 2 things running".
 */

let root: string
let claudeDir: string
let claudePidDir: string
let work: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'taskd-identity-'))
  claudeDir = join(root, 'claude')
  claudePidDir = join(root, 'claude-sessions')
  work = join(root, 'work')
  mkdirSync(work, { recursive: true })
  process.env.QUUU_USER_DATA = root
  isolateSessionDirs(root)
  process.env.QUUU_CLAUDE_PROJECTS_DIR = claudeDir
  process.env.QUUU_CLAUDE_SESSIONS_DIR = claudePidDir
  resetLivenessMemo()
})

afterEach(() => {
  delete process.env.QUUU_USER_DATA
  releaseSessionDirs()
  rmSync(root, { recursive: true, force: true })
})

/** Where session logs live. Claude Code writes under a name derived from cwd. */
function logDir(cwd = work): string {
  const dir = join(claudeDir, slugForCwd(cwd))
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeSessionLog(sessionId: string, cwd = work): string {
  const path = join(logDir(cwd), `${sessionId}.jsonl`)
  writeFileSync(path, `${JSON.stringify({ type: 'user', sessionId, cwd })}\n`)
  return path
}

/** The pid file a running Claude Code leaves. */
function writePidFile(sessionId: string, cwd = work, pid = process.pid): void {
  mkdirSync(claudePidDir, { recursive: true })
  writeFileSync(
    join(claudePidDir, `${pid}.json`),
    JSON.stringify({ pid, sessionId, cwd, startedAt: Date.now() })
  )
}

describe('pinning down the real session ID', () => {
  it('tells whether the args carry the session ID', () => {
    expect(argsCarrySessionId(['-p', 'やって', '--session-id', 'abc'], 'abc')).toBe(true)
    expect(argsCarrySessionId(['-p', 'やって'], 'abc')).toBe(false)
  })

  it('picks the real one from a session log created after launch', () => {
    const startedAtMs = Date.now()
    writeSessionLog('11111111-1111-1111-1111-111111111111')

    expect(findClaudeSessionId({ cwd: work, startedAtMs, claimed: new Set() })).toBe(
      '11111111-1111-1111-1111-111111111111'
    )
  })

  it('can also pick it up from a running pid file (before the log exists)', () => {
    const startedAtMs = Date.now()
    writePidFile('22222222-2222-2222-2222-222222222222')

    expect(findClaudeSessionId({ cwd: work, startedAtMs, claimed: new Set() })).toBe(
      '22222222-2222-2222-2222-222222222222'
    )
  })

  it('does not match a session another Run has claimed', () => {
    const startedAtMs = Date.now()
    writeSessionLog('33333333-3333-3333-3333-333333333333')

    const claimed = new Set(['33333333-3333-3333-3333-333333333333'])
    expect(findClaudeSessionId({ cwd: work, startedAtMs, claimed })).toBeNull()
  })

  it('a session that started before our launch is not ours', () => {
    writeSessionLog('44444444-4444-4444-4444-444444444444')
    // Seen from a Run that started *after* the log existed, that session belongs to someone else
    const startedAtMs = Date.now() + 60 * 1000

    expect(findClaudeSessionId({ cwd: work, startedAtMs, claimed: new Set() })).toBeNull()
  })

  it('does not pick up sessions from another directory', () => {
    const other = join(root, 'other')
    mkdirSync(other, { recursive: true })
    const startedAtMs = Date.now()
    writeSessionLog('55555555-5555-5555-5555-555555555555', other)
    writePidFile('66666666-6666-6666-6666-666666666666', other)

    expect(findClaudeSessionId({ cwd: work, startedAtMs, claimed: new Set() })).toBeNull()
  })
})

describe('records stay truthful even when configured not to pass a session ID', () => {
  it('writes the session ID the CLI picked back to the Run and the task', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const scheduler = new Scheduler(db, runner)

    const real = '77777777-7777-7777-7777-777777777777'
    // A template that does not pass {{sessionId}}, reproducing the CLI opening its own session.
    const agent = makeAgent(db, {
      name: 'claude',
      command: '/bin/sh',
      argsTemplate: ['-c', `printf '{}\\n' > ${join(logDir(), `${real}.jsonl`)}`],
      logAdapter: 'claude'
    })
    const project = makeProject(db, { name: 'work', targetId: agent, path: work })
    const task = makeTask(db, project, 'セッション ID を渡さない')

    await new Promise<void>((resolve) => {
      runner.once('finished', () => setTimeout(resolve, 50))
      void scheduler.tick()
    })

    const run = repo.listRunsByTask(db, task)[0]
    expect(run.sessionId).toBe(real)
    expect(run.sessionLogPath).toBe(join(logDir(), `${real}.jsonl`))
    // Continuation --resume points at the task-side ID, so that one must be fixed too
    expect(repo.getTask(db, task)?.sessionId).toBe(real)
  })

  it('does not import an agent it launched itself as an external session', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'claude', command: 'claude' })
    const project = makeProject(db, { name: 'work', targetId: agent, path: work })
    const task = makeTask(db, project, '自前')

    // Quuu recorded a session ID that does not exist (the template did not pass one)
    repo.insertRun(db, {
      id: 'run_own',
      taskId: task,
      agentId: agent,
      resolvedFromGroupId: null,
      sessionId: 'どこにも無い ID',
      kind: 'initial',
      status: 'running',
      attempt: 1,
      fallbackFromRunId: null,
      pid: null,
      cwd: work,
      command: 'claude',
      args: [],
      promptPreview: '',
      exitCode: null,
      errorKind: null,
      errorMessage: '',
      sessionLogPath: null,
      stdoutLogPath: join(root, 'x.log'),
      startedAt: new Date(Date.now() - 60 * 1000).toISOString()
    })
    repo.setTaskStatus(db, task, 'running', { currentRunId: 'run_own' })

    // The session the CLI actually opened. Its ID does not match Quuu's record.
    writeSessionLog('88888888-8888-8888-8888-888888888888')
    writePidFile('88888888-8888-8888-8888-888888888888')

    new SessionImporter(db).sync({ ...DEFAULT_SETTINGS, importExternalSessions: true })

    // If import adds a task, a concurrency-1 project appears to have 2 running
    expect(repo.listTasks(db)).toHaveLength(1)
    expect(repo.countActiveRunsByProject(db, project)).toBe(1)
  })
})
