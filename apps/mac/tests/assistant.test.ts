import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import { MEMORY_MAX_BYTES, memoryPath } from '../src/main/assistant/memory.js'
import { QUUU_PROJECT_ID } from '../src/main/projects/types.js'
import { sessionKey } from '../src/main/session/index.js'
import { sessionReadTarget } from '../src/main/session/sessionAttach.js'
import { makeAgent, makeProject, makeTask, occupy } from './helpers.js'
import type { FinishedEvent } from '../src/main/execution/runner.js'

let dir: string
let app: QuuuApp
let agent: string
let project: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-assistant-'))
  vi.stubEnv('QUUU_USER_DATA', dir)
  app = new QuuuApp(join(dir, 'taskd.db'))
  app.scheduler.pause()
  agent = makeAgent(app.db, { name: 'Assistant', logAdapter: 'stdout', resumeArgsTemplate: ['{{sessionId}}', '{{prompt}}'] })
  app.projects.ensureBuiltIn(dir)
  repo.updateProject(app.db, QUUU_PROJECT_ID, { targetKind: 'agent', targetId: agent })
  project = makeProject(app.db, { name: 'Application', targetId: agent, path: dir })
})
afterEach(() => {
  app.shutdown()
  app.db.close()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

function completedProposal(confidence = 85, title = 'Restore interrupted downloads'): string {
  const id = app.assistant.prepareCheck()!
  expect(id).toBeTruthy()
  writeFileSync(app.assistant.resultPath(id), JSON.stringify({ proposal: { projectId: project, title, prompt: 'Resume partial downloads and verify the regression.', reason: 'Three recent sessions show the same interruption.', confidence } }))
  repo.setTaskStatus(app.db, id, 'review')
  app.assistant.reconcile()
  return id
}

function makeDue(): void {
  const check = repo.listAssistantChecks(app.db)[0]
  repo.saveAssistantCheck(app.db, { ...check, settledAt: '2000-01-01T00:00:00.000Z' })
}

describe('shared memory', () => {
  it('keeps bounded UTF-8 memory outside the bundle, detects competing edits and carries it into each run', () => {
    const before = app.assistant.memory()
    app.assistant.setMemory('日本語で簡潔に答える', before.revision)
    expect(readFileSync(memoryPath(dir), 'utf8')).toBe('日本語で簡潔に答える')
    expect(() => app.assistant.setMemory('lost edit', before.revision)).toThrow(/changed/)
    expect(() => app.assistant.setMemory('あ'.repeat(MEMORY_MAX_BYTES / 2), app.assistant.memory().revision)).toThrow(/bytes/)
    const task = app.assistant.send('Help me plan today')
    const first = app.runner.prepare({ task, project: repo.getProject(app.db, QUUU_PROJECT_ID)!, agent: repo.getAgent(app.db, agent)!, groupId: null, kind: 'initial', fallbackFromRunId: null })
    expect(first.args.join(' ')).toContain('日本語で簡潔に答える')
    app.assistant.setMemory('Prefer focused changes.', app.assistant.memory().revision)
    repo.updateRun(app.db, first.id, { status: 'succeeded', endedAt: new Date().toISOString() })
    repo.setTaskStatus(app.db, task.id, 'review', { sessionId: first.sessionId })
    const followup = app.runner.prepare({ task: repo.getTask(app.db, task.id)!, project: repo.getProject(app.db, QUUU_PROJECT_ID)!, agent: repo.getAgent(app.db, agent)!, groupId: null, kind: 'followup', sessionId: first.sessionId, messageOverride: 'Continue', fallbackFromRunId: null })
    expect(followup.args.join(' ')).toContain('Prefer focused changes.')
  })
})

describe('proactive suggestions', () => {
  it('hides internal checks and their notifications, publishes one proposal and stops until a reply or reaction', () => {
    const notifications = vi.fn()
    const hooks = vi.fn()
    repo.setLifecycleRecorder(app.db, hooks)
    app.on('notify', notifications)
    const id = completedProposal()
    expect(hooks).not.toHaveBeenCalled()
    expect(app.snapshot().tasks.map(t => t.id)).not.toContain(id)
    expect(app.tasks.listTasks(true).map(t => t.id)).not.toContain(id)
    expect(app.tasks.listPage({ archived: 'include' }).tasks.map(t => t.id)).not.toContain(id)
    expect(notifications).toHaveBeenCalledTimes(1)
    expect(notifications.mock.calls[0][0]).toMatchObject({ notificationKind: 'assistant' })
    const state = app.assistant.state()
    expect(state.activity).toBe('awaiting-response')
    expect(state.unread).toBe(true)
    const thread = state.threads[0]
    app.assistant.markRead(thread.taskId, 'stale revision')
    expect(app.assistant.state().unread).toBe(true)
    app.assistant.markRead(thread.taskId, thread.revision)
    expect(app.assistant.state().unread).toBe(false)
    makeDue()
    expect(app.assistant.prepareCheck()).toBeNull()
    app.assistant.reconcile()
    expect(notifications).toHaveBeenCalledTimes(1)
  })

  it('executes an approved suggestion exactly once in its target project and remembers negative reactions', () => {
    completedProposal()
    const proposal = app.assistant.state().proposals[0]
    const approved = app.assistant.react(proposal.taskId, 'approve')
    const again = app.assistant.react(proposal.taskId, 'approve')
    expect(again).toEqual(approved)
    expect(repo.getTask(app.db, approved.executionTaskId!)!).toMatchObject({ projectId: project, status: 'queued', prompt: proposal.prompt })
    expect(app.tasks.listTasks().filter(t => t.projectId === project)).toHaveLength(1)
    makeDue()
    completedProposal(92, 'Explain repeated startup failures')
    const second = app.assistant.state().proposals[0]
    expect(app.assistant.react(second.taskId, 'dismiss')).toMatchObject({ status: 'dismissed', executionTaskId: null })
    makeDue()
    completedProposal(99, second.title)
    expect(app.assistant.state().proposals).toHaveLength(2)
  })

  it('allows a reply to restart future checks without treating discussion as approval', () => {
    app.assistant.start()
    completedProposal()
    const proposal = app.assistant.state().proposals[0]
    expect(app.tasks.send(proposal.taskId, 'What evidence supports this?').ok).toBe(true)
    expect(app.assistant.state().proposals[0]).toMatchObject({ status: 'pending', executionTaskId: null })
    expect(app.assistant.state().proposals[0].respondedAt).not.toBeNull()
    makeDue()
    expect(app.assistant.prepareCheck()).not.toBeNull()
    expect(app.tasks.listTasks().filter(t => t.projectId === project)).toHaveLength(0)
  })

  it('drops weak and invalid proposals and respects the interval even when nothing is suggested', () => {
    completedProposal(69)
    expect(app.assistant.state().proposals).toEqual([])
    expect(app.assistant.prepareCheck()).toBeNull()
    makeDue()
    const id = app.assistant.prepareCheck()!
    writeFileSync(app.assistant.resultPath(id), 'not JSON')
    repo.setTaskStatus(app.db, id, 'review')
    app.assistant.reconcile()
    expect(app.assistant.state().error).not.toBeNull()
    expect(app.assistant.prepareCheck()).toBeNull()
  })

  it('restores pending proposals, read receipts, configuration and unfinished check results after reopening', () => {
    const id = app.assistant.prepareCheck()!
    writeFileSync(app.assistant.resultPath(id), JSON.stringify({ proposal: { projectId: project, title: 'Recover interrupted work', prompt: 'Add recovery.', reason: 'Repeated interruption.', confidence: 80 } }))
    repo.setTaskStatus(app.db, id, 'review')
    app.shutdown(); app.db.close()
    app = new QuuuApp(join(dir, 'taskd.db')); app.scheduler.pause()
    app.assistant.reconcile()
    expect(app.assistant.state().proposals).toHaveLength(1)
    const thread = app.assistant.state().threads[0]
    app.assistant.markRead(thread.taskId, thread.revision)
    app.assistant.configure({ intervalHours: 24 })
    app.shutdown(); app.db.close()
    app = new QuuuApp(join(dir, 'taskd.db')); app.scheduler.pause()
    expect(app.assistant.state()).toMatchObject({ unread: false, settings: { intervalHours: 24 }, activity: 'awaiting-response' })
    expect(app.assistant.prepareCheck()).toBeNull()
  })

  it('never uses busy, reserved or cooling slots and lets ordinary queued work go first', () => {
    // Resume claims without starting processes; tick is separately covered by scheduler tests.
    vi.spyOn(app.scheduler, 'tick').mockResolvedValue(undefined)
    app.scheduler.resume()
    const ordinary = makeTask(app.db, project, 'Human request')
    expect(app.scheduler.claimNext()?.task.id).toBe(ordinary)
    expect(app.scheduler.claimNext()).toBeNull()
    const run = repo.listRunsByTask(app.db, ordinary)[0]
    repo.updateRun(app.db, run.id, { status: 'succeeded', endedAt: new Date().toISOString() })
    repo.setTaskStatus(app.db, ordinary, 'review')
    repo.setCooldown(app.db, agent, new Date(Date.now() + 60000).toISOString(), 'limited')
    expect(app.scheduler.claimNext()).toBeNull()
    repo.clearCooldown(app.db, agent)
    app.scheduler.holdSlot({ taskId: ordinary, projectId: project, agentId: agent, title: 'Human request' })
    expect(app.scheduler.claimNext()).toBeNull()
    app.scheduler.releaseSlot(ordinary)
    const check = app.scheduler.claimNext()
    expect(check).not.toBeNull()
    expect(repo.isAssistantCheck(app.db, check!.task.id)).toBe(true)
    expect(app.assistant.state().activity).toBe('checking')
  })

  it('preserves the user queue’s wait reasons when background research cannot fit either', () => {
    vi.spyOn(app.scheduler, 'tick').mockResolvedValue(undefined)
    app.scheduler.resume()
    repo.updateAgent(app.db, agent, { enabled: false })
    makeAgent(app.db, { name: 'Unassigned spare agent' })
    makeTask(app.db, project, 'Human request')
    expect(app.scheduler.claimNext()).toBeNull()
    expect(app.scheduler.status().warnings.some(warning => warning.includes('Application'))).toBe(true)
    expect(app.scheduler.status().warnings.some(warning => warning.includes('QuuuAI'))).toBe(false)
  })

  it('stops research when disabled and does not publish a late result', () => {
    const id = app.assistant.prepareCheck()!
    occupy(app.db, id, agent)
    const cancel = vi.spyOn(app.tasks, 'cancelTask')
    app.assistant.configure({ enabled: false })
    expect(cancel).toHaveBeenCalledWith(id)
    expect(app.assistant.prepareCheck()).toBeNull()
    repo.setTaskStatus(app.db, id, 'review')
    app.assistant.reconcile()
    expect(app.assistant.state().proposals).toEqual([])
  })

  it('does not auto-retry internal failures or emit ordinary review notifications', () => {
    const notify = vi.fn()
    app.on('notify', notify)
    const id = app.assistant.prepareCheck()!
    const runId = occupy(app.db, id, agent)
    repo.updateRun(app.db, runId, { status: 'limited', endedAt: new Date().toISOString() })
    app.runner.emit('finished', { run: repo.getRun(app.db, runId)!, classification: { kind: 'limit', message: 'limit' }, tail: '' } satisfies FinishedEvent)
    expect(repo.getTask(app.db, id)?.status).toBe('failed')
    expect(notify).not.toHaveBeenCalled()
  })

  it('makes a new assistant reply unread without letting a stale read receipt consume it', () => {
    const task = app.assistant.send('Hello')
    const runId = occupy(app.db, task.id, agent)
    const run = repo.getRun(app.db, runId)!
    const key = sessionKey(sessionReadTarget(app.db, run))
    const message = { id: 'm1', role: 'assistant' as const, isSidechain: false, timestamp: null, model: null, blocks: [{ kind: 'text' as const, text: 'Hello there' }] }
    repo.writeSessionMessages(app.db, key, 'g1', 0, [message])
    repo.finishSessionIndex(app.db, key, { stamp: '1', generation: 'g1', title: null, total: 1, evidenceVersion: 0, updatedAt: new Date().toISOString() })
    const first = app.assistant.state().threads[0]
    expect(first).toMatchObject({ unread: true, preview: 'Hello there' })
    repo.writeSessionMessages(app.db, key, 'g1', 1, [{ ...message, id: 'm2' }])
    repo.finishSessionIndex(app.db, key, { stamp: '2', generation: 'g1', title: null, total: 2, evidenceVersion: 0, updatedAt: new Date().toISOString() })
    app.assistant.markRead(task.id, first.revision)
    expect(app.assistant.state().unread).toBe(true)
    const latest = app.assistant.state().threads[0]
    app.assistant.markRead(task.id, latest.revision)
    repo.writeSessionMessages(app.db, key, 'g1', 1, [{ ...message, id: 'm2', blocks: [{ kind: 'text', text: 'A streamed reply grew' }] }])
    repo.finishSessionIndex(app.db, key, { stamp: '3', generation: 'g1', title: null, total: 2, evidenceVersion: 0, updatedAt: new Date().toISOString() })
    expect(app.assistant.state().threads[0]).toMatchObject({ unread: true, replies: 2, preview: 'A streamed reply grew' })
  })
})
