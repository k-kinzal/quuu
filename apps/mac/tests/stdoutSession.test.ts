import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { attachSessionLog } from '../src/main/session/sessionAttach.js'
import { sessionIdInStdout } from '../src/main/session/stdoutSessionId.js'
import { isolateSessionDirs, makeAgent, makeProject, makeTask, memoryDb, releaseSessionDirs } from './helpers.js'

/**
 * The session id of a CLI whose log location cannot be traced (`logAdapter: 'stdout'`).
 *
 * The body uses the header exactly as measured (codex-cli 0.149.0).
 * If the shape changes, this fails and the change gets noticed.
 */

let dir: string
let codexDir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'taskd-stdout-'))
  codexDir = isolateSessionDirs(dir).codex
})
afterEach(() => {
  releaseSessionDirs()
  rmSync(dir, { recursive: true, force: true })
})

const REAL_ID = '01a03143-aa86-7442-9bfd-e362b34f4947'

function log(body: string): string {
  const path = join(dir, `${Math.random().toString(36).slice(2)}.log`)
  writeFileSync(path, body)
  return path
}

/** The Quuu header + the Codex header + the body (the same order as a live log). */
function codexLog(sessionId = REAL_ID, tail = ''): string {
  return log(
    [
      '# Quuu run run_x',
      '# 2026-08-24T00:55:12.649Z',
      '# cwd: /Users/me/Projects/demo-app',
      '# cmd: codex exec --skip-git-repo-check やって',
      '',
      'OpenAI Codex v0.149.0',
      '--------',
      'workdir: /Users/me/Projects/demo-app',
      'model: gpt-5.6-sol',
      'approval: never',
      `session id: ${sessionId}`,
      '--------',
      'user',
      tail,
      ''
    ].join('\n')
  )
}

describe('the session id picked up from standard output', () => {
  it('reads the CLI header even after a long launch prompt, and never uses a fake id inside the prompt', () => {
    const source = codexLog()
    const long = '# cmd: codex exec ' + '長い指示'.repeat(20_000) + '\\n--------\\nsession id: 01a0aaaa-bbbb-cccc-dddd-eeeeeeeeeeee\\n--------\n'
    const path = log(long + readFileSync(source, 'utf8'))
    expect(sessionIdInStdout(path)).toBe(REAL_ID)
  })

  it('picks up the id announced in the header', () => {
    expect(sessionIdInStdout(codexLog())).toBe(REAL_ID)
  })

  it('does not pick it up while the header is unclosed (it is still starting)', () => {
    const path = log(
      ['OpenAI Codex v0.149.0', '--------', `session id: ${REAL_ID}`, ''].join('\n')
    )
    expect(sessionIdInStdout(path)).toBeNull()
  })

  it('does not pick up the same text from the body (pasting it into a prompt is not announcing it)', () => {
    const other = '01a0aaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    expect(sessionIdInStdout(codexLog(REAL_ID, `session id: ${other}`))).toBe(REAL_ID)
  })

  it('returns null for a log that announces nothing (another CLI read through standard output)', () => {
    expect(sessionIdInStdout(log('just some output\nwithout any header\n'))).toBeNull()
    expect(sessionIdInStdout(join(dir, 'missing.log'))).toBeNull()
  })
})

describe('reconciling an assigned id with the real one', () => {
  it('re-binds Codex to the structured log of the id it announced', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'Codex', command: 'codex', logAdapter: 'codex' })
    const project = makeProject(db, { name: 'p', targetId: agent })
    const task = makeTask(db, project, 't')
    const stdout = codexLog()
    const day = join(codexDir, '2026', '08', '24')
    mkdirSync(day, { recursive: true })
    const structured = join(day, `rollout-now-${REAL_ID}.jsonl`)
    writeFileSync(structured, `${JSON.stringify({ type: 'session_meta', payload: { id: REAL_ID } })}\n`)

    repo.insertRun(db, {
      id: 'run_structured',
      taskId: task,
      agentId: agent,
      // Even through a group, how it is read is decided by the Codex definition of the agentId actually chosen
      resolvedFromGroupId: 'grp_frontier',
      sessionId: 'quuu-id',
      kind: 'initial',
      status: 'succeeded',
      attempt: 1,
      fallbackFromRunId: null,
      pid: null,
      cwd: '/tmp',
      command: 'codex',
      args: [],
      promptPreview: 'やって',
      exitCode: 0,
      errorKind: null,
      errorMessage: '',
      sessionLogPath: null,
      stdoutLogPath: stdout
    })
    repo.setTaskStatus(db, task, 'review', {
      currentRunId: 'run_structured',
      sessionId: 'quuu-id'
    })

    const after = attachSessionLog(db, repo.getRun(db, 'run_structured')!)

    expect(after.sessionId).toBe(REAL_ID)
    expect(after.sessionLogPath).toBe(structured)
    expect(repo.getTask(db, task)?.sessionId).toBe(REAL_ID)
  })

  it('rewrites both the Run and the task to the id the CLI announced', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'Codex', command: 'codex', logAdapter: 'stdout' })
    const project = makeProject(db, { name: 'p', targetId: agent })
    const task = makeTask(db, project, 't')
    const stdout = codexLog()

    repo.insertRun(db, {
      id: 'run_1',
      taskId: task,
      agentId: agent,
      resolvedFromGroupId: null,
      sessionId: 'quuu-が採番した-実在しない-id',
      kind: 'initial',
      status: 'running',
      attempt: 1,
      fallbackFromRunId: null,
      pid: null,
      cwd: '/tmp',
      command: 'codex',
      args: [],
      promptPreview: 'やって',
      exitCode: null,
      errorKind: null,
      errorMessage: '',
      sessionLogPath: null,
      stdoutLogPath: stdout
    })
    repo.setTaskStatus(db, task, 'running', {
      currentRunId: 'run_1',
      sessionId: 'quuu-が採番した-実在しない-id'
    })

    const after = attachSessionLog(db, repo.getRun(db, 'run_1')!)

    expect(after.sessionId).toBe(REAL_ID)
    // The continuation uses the id on the task side
    expect(repo.getTask(db, task)?.sessionId).toBe(REAL_ID)
    // What it reads stays the Quuu standard output log (there is no external log to re-bind to)
    expect(after.sessionLogPath).toBeNull()
  })

  it('does not take an id that another Run has announced', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'Codex', command: 'codex', logAdapter: 'stdout' })
    const project = makeProject(db, { name: 'p', targetId: agent })
    const task = makeTask(db, project, 't')
    const stdout = codexLog()

    const insert = (id: string, sessionId: string, log: string): void => {
      repo.insertRun(db, {
        id,
        taskId: task,
        agentId: agent,
        resolvedFromGroupId: null,
        sessionId,
        kind: 'initial',
        status: 'succeeded',
        attempt: 1,
        fallbackFromRunId: null,
        pid: null,
        cwd: '/tmp',
        command: 'codex',
        args: [],
        promptPreview: '',
        exitCode: 0,
        errorKind: null,
        errorMessage: '',
        sessionLogPath: null,
        stdoutLogPath: log
      })
    }
    insert('run_first', REAL_ID, stdout)
    insert('run_second', 'fake', stdout)

    expect(attachSessionLog(db, repo.getRun(db, 'run_second')!).sessionId).toBe('fake')
  })
})
