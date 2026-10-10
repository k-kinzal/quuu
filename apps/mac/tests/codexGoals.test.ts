import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adapterFor } from '../src/main/agent-adapters/registry.js'
import { runExitPath } from '../src/main/appPaths.js'
import * as repo from '../src/main/db/repo.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { isolateSessionDirs, makeAgent, makeProject, makeTask, memoryDb, releaseSessionDirs } from './helpers.js'

// Sanitized from the 0.160.1 exec exit: the native goal turn was aborted 66 ms after dispatch.
const fixture = readFileSync(join(import.meta.dirname, 'fixtures/sessions/codex-goal-exec-exit.jsonl'), 'utf8')
const finalOnly = fixture.split('\n').filter(line => !line.includes('goal-turn') && !line.includes('turn_aborted')).join('\n')
let root: string
let log: string
const cleanup: (() => void)[] = []
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'quuu-codex-goal-'))
  log = join(root, 'session.jsonl')
  process.env.QUUU_USER_DATA = root
  isolateSessionDirs(root)
  writeFileSync(log, fixture)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-09T20:08:14.756Z'))
})
afterEach(() => {
  for (const close of cleanup.splice(0)) close()
  vi.useRealTimers()
  releaseSessionDirs()
  delete process.env.QUUU_USER_DATA
  rmSync(root, { recursive: true, force: true })
})

function pending(text = fixture, startedAt = '2026-10-09T20:08:14.756Z', args = ['exec', 'resume', 'session']): boolean {
  writeFileSync(log, text)
  return adapterFor('codex').pendingContinuation!({ args, sessionLogPath: log, startedAt })
}

describe('Codex goal continuation evidence', () => {
  it('recognizes the native goal turn cut off by exec shutdown', () => {
    expect(pending()).toBe(true)
    expect(pending(fixture, undefined, ['exec', '--', '/goal finish the work'])).toBe(true)
  })

  it('does not treat goal wording from a person or a tool as a continuation request', () => {
    expect(pending(fixture.replace('goal.internal_context', 'user.input'))).toBe(false)
    expect(pending(fixture.replace('"role":"user"', '"role":"assistant"'))).toBe(false)
    expect(pending(fixture.replace('"internal_chat_message_metadata_passthrough":', '"quoted_metadata":'))).toBe(false)
    expect(pending(fixture.replace('"type":"message","role":"user"', '"type":"function_call_output","role":"user"'))).toBe(false)
  })

  it('does not continue stale evidence, a plan turn, an interactive CLI or a mismatched turn', () => {
    expect(pending(fixture, '2026-10-10T00:00:00.000Z')).toBe(false)
    expect(pending(fixture.replace('"default"', '"plan"'))).toBe(false)
    expect(pending(fixture, undefined, ['resume', 'session'])).toBe(false)
    expect(pending(fixture.replace('"reason":"interrupted"', '"reason":"replaced"'))).toBe(false)
    expect(pending(fixture.replace('"turn_id":"goal-turn","content_item_kinds"', '"turn_id":"other-turn","content_item_kinds"'))).toBe(false)
  })

  it('leaves completed, paused, blocked and exhausted goals to the native continuation policy', () => {
    // No native dispatch follows these final answers, regardless of old active-goal output.
    for (const status of ['active', 'complete', 'paused', 'blocked', 'budget_limited', 'usage_limited']) {
      const old = JSON.stringify({ timestamp: '2026-10-09T21:00:00Z', type: 'response_item',
        payload: { type: 'function_call_output', output: JSON.stringify({ goal: { status } }) } })
      expect(pending(old + '\n' + finalOnly)).toBe(false)
    }
  })

  it('stops when the dispatched turn has answered, used a tool, or received new user input', () => {
    for (const payload of [
      { type: 'message', role: 'assistant' }, { type: 'custom_tool_call' }, { type: 'reasoning' },
      { type: 'message', role: 'user' }
    ]) {
      expect(pending(fixture + JSON.stringify({ timestamp: '2026-10-09T21:37:45.300Z', type: 'response_item', payload }))).toBe(false)
    }
    expect(pending(fixture + JSON.stringify({ timestamp: '2026-10-09T21:37:45.300Z', type: 'event_msg',
      payload: { type: 'task_complete', turn_id: 'goal-turn' } }))).toBe(false)
  })

  it('requires a prompt shutdown interruption and complete readable evidence', () => {
    expect(pending(fixture.split('\n').filter(line => !line.includes('custom_tool_call')).join('\n'))).toBe(false)
    expect(pending(fixture.replace('21:37:45.223Z', '21:38:45.223Z'))).toBe(false)
    expect(pending(fixture.replace('"reason":"interrupted"', '"reason":"shutdown"'))).toBe(false)
    expect(pending(fixture + '{"type":')).toBe(false)
    expect(pending('x'.repeat(1024 * 1024) + '\n' + fixture)).toBe(true)
    rmSync(log)
    expect(adapterFor('codex').pendingContinuation!({ args: ['exec'], sessionLogPath: log, startedAt: new Date().toISOString() })).toBe(false)
  })
})

function running(resume = true) {
  const db = memoryDb()
  const agentId = makeAgent(db, { name: 'Codex', command: 'codex', logAdapter: 'codex',
    argsTemplate: ['exec', '--', '{{prompt}}'],
    resumeArgsTemplate: resume ? ['exec', 'resume', '{{sessionId}}', '--', '{{prompt}}'] : [] })
  const projectId = makeProject(db, { name: 'project', path: root, targetId: agentId })
  const taskId = makeTask(db, projectId, '/goal finish the work')
  const runner = new Runner(db)
  const scheduler = new Scheduler(db, runner)
  scheduler.pause()
  cleanup.push(() => { scheduler.stop(); runner.shutdown(); db.close() })
  const prepared = runner.prepare({ task: repo.getTask(db, taskId)!, project: repo.getProject(db, projectId)!,
    agent: repo.getAgent(db, agentId)!, groupId: null, kind: 'initial', fallbackFromRunId: null })
  const run = repo.updateRun(db, prepared.id, { status: 'running', sessionLogPath: log })
  vi.setSystemTime(new Date('2026-10-09T21:37:46Z'))
  return { db, agentId, taskId, runner, scheduler, run }
}

describe('scheduling an unfinished native goal turn', () => {
  it('queues the same conversation without announcing review or inventing user input', () => {
    const { db, agentId, taskId, runner, scheduler, run } = running()
    const notify = vi.fn()
    scheduler.on('notify', notify)
    const prompt = '  /goal finish the work\n\n'
    repo.setTaskStatus(db, taskId, 'running', { pendingMessage: prompt })
    runner.complete(run, { kind: null, message: '' }, 0, '')
    expect(repo.getRun(db, run.id)?.status).toBe('succeeded')
    expect(repo.getTask(db, taskId)).toMatchObject({ status: 'queued', sessionId: run.sessionId, pendingMessage: prompt })
    expect(notify).not.toHaveBeenCalled()
    const next = scheduler.claimNext()
    expect(next?.params).toMatchObject({ kind: 'followup', sessionId: run.sessionId, messageOverride: prompt, agent: { id: agentId } })
    expect(next?.run.args).toEqual(['exec', 'resume', run.sessionId, '--', prompt])
  })

  it('recovers the same continuation when exec ended while Quuu was closed', () => {
    const { db, taskId, scheduler, run } = running()
    writeFileSync(runExitPath(run.id), '0')
    scheduler.reconcile()
    expect(repo.getTask(db, taskId)?.status).toBe('queued')
    expect(existsSync(runExitPath(run.id))).toBe(false)
    expect(scheduler.claimNext()?.params.sessionId).toBe(run.sessionId)
  })

  it('gives a reserved human instruction precedence over the goal continuation', () => {
    const { db, taskId, runner, scheduler, run } = running()
    const message = '  Pause the goal.\n'
    repo.setReservedMessage(db, taskId, message)
    runner.complete(run, { kind: null, message: '' }, 0, '')
    expect(repo.getTask(db, taskId)).toMatchObject({ status: 'queued', pendingMessage: message, reservedMessage: '' })
    expect(scheduler.claimNext()?.params.messageOverride).toBe(message)
  })

  it('does not restart a canceled run or a success with an unknown exit code', () => {
    for (const canceled of [true, false]) {
      const { db, taskId, runner, run } = running()
      runner.complete(run, { kind: canceled ? 'canceled' : null, message: '' }, canceled ? 0 : null, '')
      expect(repo.getTask(db, taskId)?.status).toBe('review')
    }
  })

  it('leaves normal completion and an agent without resume support in review', () => {
    const unsupported = running(false)
    unsupported.runner.complete(unsupported.run, { kind: null, message: '' }, 0, '')
    expect(repo.getTask(unsupported.db, unsupported.taskId)?.status).toBe('review')
    const completed = running()
    writeFileSync(log, finalOnly)
    completed.runner.complete(completed.run, { kind: null, message: '' }, 0, '')
    expect(repo.getTask(completed.db, completed.taskId)?.status).toBe('review')
  })
})
