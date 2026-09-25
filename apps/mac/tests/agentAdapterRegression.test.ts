import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adapterFor } from '../src/main/agent-adapters/registry.js'
import { sessionLogDir } from '../src/main/agent-adapters/claude/paths.js'
import { runExitPath } from '../src/main/appPaths.js'
import * as repo from '../src/main/db/repo.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { findSessionId } from '../src/main/session/sessionIdentity.js'
import { sessionReadTarget } from '../src/main/session/sessionAttach.js'
import { isolateSessionDirs, makeAgent, makeProject, makeTask, memoryDb, occupy, releaseSessionDirs } from './helpers.js'

// Exact failure text from a Fable run on 2026-09-23. No user prompt or account data.
const SESSION_LIMIT = "You've hit your session limit · resets 10:40pm (Asia/Tokyo)"
const input = { exitCode: 1, signal: null, output: SESSION_LIMIT, limitPatterns: [], timedOut: false, canceled: false }

function weeklyLimit(): { message: string; until: string } {
  const at = new Date()
  at.setDate(at.getDate() + 3)
  at.setHours(19, 0, 0, 0)
  const month = at.toLocaleString('en-US', { month: 'short' })
  return {
    message: `You've hit your weekly limit · resets ${month} ${at.getDate()} at 7pm (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
    until: at.toISOString()
  }
}

describe('Claude limit translation', () => {
  it('recognizes the Fable session limit with its reset time', () => {
    const result = adapterFor('claude').classify(input)
    expect(result).toMatchObject({ kind: 'limit', message: SESSION_LIMIT })
    expect(result.retryAt).toBeTruthy()
    expect(adapterFor('claude').classifyDetached(input)).toEqual(result)
  })

  it('recognizes native limits even when the user configured an additional pattern', () => {
    expect(adapterFor('claude').classify({ ...input, limitPatterns: ['custom vendor error'] }).kind).toBe('limit')
  })

  it('reads a failed JSON result even when the CLI exits zero', () => {
    const output = JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: SESSION_LIMIT })
    expect(adapterFor('claude').classify({ ...input, exitCode: 0, output })).toMatchObject({ kind: 'limit', message: SESSION_LIMIT })
  })

  it('carries the exact weekly reset through text and failed JSON results', () => {
    const { message, until } = weeklyLimit()
    for (const output of [message, JSON.stringify({ type: 'result', is_error: true, result: message })]) {
      expect(adapterFor('claude').classify({ ...input, output }))
        .toEqual({ kind: 'limit', message, retryAt: until })
      expect(adapterFor('claude').classifyDetached({ ...input, output }))
        .toEqual({ kind: 'limit', message, retryAt: until })
    }
  })

  it('does not turn successful discussion of a limit into a limited run', () => {
    const output = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: `The log says: ${SESSION_LIMIT}` })
    expect(adapterFor('claude').classify({ ...input, exitCode: 0, output }).kind).toBeNull()
    expect(adapterFor('claude').classify({ ...input, exitCode: 0, output: `I fixed the parser for: ${SESSION_LIMIT}` }).kind).toBeNull()
  })

  it('preserves cancellation and timeout ahead of a provider error', () => {
    expect(adapterFor('claude').classify({ ...input, canceled: true }).kind).toBe('canceled')
    expect(adapterFor('claude').classify({ ...input, timedOut: true }).kind).toBe('timeout')
  })
})

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'quuu-adapter-regression-'))
  process.env.QUUU_USER_DATA = root
  isolateSessionDirs(root)
  mkdirSync(join(root, 'logs'), { recursive: true })
})
afterEach(() => {
  releaseSessionDirs()
  delete process.env.QUUU_USER_DATA
  rmSync(root, { recursive: true, force: true })
})

it.each([
  { recovered: false, weekly: false },
  { recovered: true, weekly: false },
  { recovered: false, weekly: true },
  { recovered: true, weekly: true }
])('parks a Claude limit automatically (recovered: $recovered, weekly: $weekly)', async ({ recovered, weekly }) => {
  const db = memoryDb()
  const runner = new Runner(db)
  const scheduler = new Scheduler(db, runner)
  const { message, until } = weekly ? weeklyLimit() : { message: SESSION_LIMIT, until: null }
  const script = join(root, 'limited.sh')
  writeFileSync(script, `#!/bin/sh\nprintf '%s\\n' "${message}"\nexit 1\n`)
  const agent = makeAgent(db, { name: 'Fable', command: '/bin/sh', logAdapter: 'claude', argsTemplate: [script] })
  const project = makeProject(db, { name: 'p', targetId: agent, path: root })
  const task = makeTask(db, project, 'keep the instruction')
  try {
    if (recovered) {
      const stdoutLogPath = join(root, 'output.log')
      const run = occupy(db, task, agent, { stdoutLogPath })
      writeFileSync(stdoutLogPath, message)
      writeFileSync(runExitPath(run), '1')
      scheduler.reconcile()
    } else {
      const finished = new Promise<void>(resolve => runner.once('finished', () => resolve()))
      await runner.start({ task: repo.getTask(db, task)!, project: repo.getProject(db, project)!, agent: repo.getAgent(db, agent)!, kind: 'initial', groupId: null, fallbackFromRunId: null })
      await finished
    }
    expect(repo.listRunsByTask(db, task)[0]).toMatchObject({ status: 'limited', errorKind: 'limit', errorMessage: message })
    expect(repo.getTask(db, task)).toMatchObject({ status: 'queued', prompt: 'keep the instruction' })
    expect(repo.getTask(db, task)?.scheduledAt).toBe(repo.listCooldowns(db).find(cooldown => cooldown.agentId === agent)?.until)
    if (until !== null) expect(repo.getTask(db, task)?.scheduledAt).toBe(until)
    expect(scheduler.claimNext()).toBeNull()
  } finally {
    scheduler.stop()
    runner.shutdown()
    db.close()
  }
})

it.each([false, true])('restores a saved weekly wait on restart (later human schedule: %s)', (scheduledLater) => {
  const db = memoryDb()
  const runner = new Runner(db)
  const scheduler = new Scheduler(db, runner)
  const agent = makeAgent(db, { name: 'Opus', command: 'claude', logAdapter: 'claude' })
  const project = makeProject(db, { name: 'p', targetId: agent, path: root })
  const task = makeTask(db, project, 'wait for the weekly reset')
  const run = occupy(db, task, agent)
  const { message, until } = weeklyLimit()
  const guessed = new Date(Date.now() + 900_000).toISOString()
  const scheduled = scheduledLater ? new Date(Date.parse(until) + 3_600_000).toISOString() : guessed
  repo.updateRun(db, run, { status: 'limited', errorKind: 'limit', errorMessage: message, endedAt: new Date().toISOString() })
  repo.setTaskStatus(db, task, 'queued')
  repo.setTaskSchedule(db, task, scheduled)
  repo.setCooldown(db, agent, guessed, message)
  try {
    scheduler.reconcile()
    expect(repo.cooldownEnd(db, agent)).toBe(until)
    expect(repo.getTask(db, task)?.scheduledAt).toBe(scheduledLater ? scheduled : until)
    expect(scheduler.claimNext()).toBeNull()
    scheduler.reconcile()
    expect(repo.cooldownEnd(db, agent)).toBe(until)
    expect(repo.listRunsByTask(db, task)).toHaveLength(1)
  } finally {
    scheduler.stop()
    runner.shutdown()
    db.close()
  }
})

it('does not restart an elapsed relative limit when restoring a saved wait', () => {
  const db = memoryDb()
  const runner = new Runner(db)
  const scheduler = new Scheduler(db, runner)
  const agent = makeAgent(db, { name: 'a' })
  const project = makeProject(db, { name: 'p', targetId: agent, path: root })
  const task = makeTask(db, project, 't')
  const run = occupy(db, task, agent)
  const message = 'Usage limit reached. Try again in 2 hours'
  const guessed = new Date(Date.now() + 900_000).toISOString()
  repo.updateRun(db, run, {
    status: 'limited', errorKind: 'limit', errorMessage: message,
    endedAt: new Date(Date.now() - 86_400_000).toISOString()
  })
  repo.setTaskStatus(db, task, 'queued')
  repo.setTaskSchedule(db, task, guessed)
  repo.setCooldown(db, agent, guessed, message)
  try {
    scheduler.reconcile()
    expect(repo.cooldownEnd(db, agent)).toBe(guessed)
    expect(repo.getTask(db, task)?.scheduledAt).toBe(guessed)
  } finally {
    scheduler.stop()
    runner.shutdown()
    db.close()
  }
})

it('reads a historical session using the adapter recorded at launch after settings change', () => {
  const db = memoryDb()
  try {
    const agent = makeAgent(db, { name: 'Codex', command: 'codex', logAdapter: 'codex' })
    const project = makeProject(db, { name: 'p', targetId: agent })
    const task = makeTask(db, project, 'keep this session')
    const id = occupy(db, task, agent)
    const logPath = join(root, 'session.jsonl')
    writeFileSync(logPath, '{}\n')
    repo.updateRun(db, id, { sessionLogPath: logPath })
    repo.updateAgent(db, agent, { logAdapter: 'claude', command: 'claude' })
    expect(sessionReadTarget(db, repo.getRun(db, id)!)).toMatchObject({ mode: 'codex', logPath })
  } finally { db.close() }
})

it.each(['grok', 'cursor'] as const)('%s never adopts a Claude session in the same directory', (adapter) => {
  const cwd = join(root, 'project')
  mkdirSync(cwd)
  const dir = sessionLogDir(cwd)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'claude-session.jsonl'), '{}\n')
  expect(findSessionId(adapter, { cwd, startedAtMs: Date.now(), claimed: new Set() })).toBeNull()
})
