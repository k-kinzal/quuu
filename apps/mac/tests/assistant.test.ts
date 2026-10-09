import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import { afterCommit, inTransaction } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { MEMORY_MAX_BYTES, memoryPath } from '../src/main/assistant/memory.js'
import { QUUU_PROJECT_ID } from '../src/main/projects/types.js'
import { sessionKey } from '../src/main/session/index.js'
import { sessionReadTarget } from '../src/main/session/sessionAttach.js'
import { makeAgent, makeProject, makeTask, occupy, sessioned } from './helpers.js'
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

describe('assistant execution target', () => {
  it.each(['agent', 'group'] as const)('keeps the saved %s after restart and uses it for unstarted threads and suggestion research', kind => {
    const next = makeAgent(app.db, { name: 'Selected agent', command: 'true', logAdapter: 'codex' })
    const group = app.agents.createGroup({ name: 'Selected group', description: '', strategy: 'priority', memberIds: [next], sortOrder: 0 })
    const queued = app.assistant.send('Waiting for an agent')
    const target = { targetKind: kind, targetId: kind === 'group' ? group.id : next }
    app.projects.updateProject(QUUU_PROJECT_ID, target)
    app.shutdown(); app.db.close()
    app = new QuuuApp(join(dir, 'taskd.db')); app.scheduler.pause()
    expect(app.projects.ensureBuiltIn(join(dir, 'updated-workspace'))).toMatchObject(target)
    const fresh = app.assistant.send('New conversation')
    // Claims prepare runs without launching any CLI or letting the timer consume them.
    vi.spyOn(app.scheduler, 'tick').mockResolvedValue(undefined)
    app.scheduler.resume()
    for (const id of [queued.id, fresh.id]) {
      const claim = app.scheduler.claimNext()!
      expect(claim).toMatchObject({ task: { id, agentOverrideId: null }, agentId: next, run: { kind: 'initial', resolvedFromGroupId: kind === 'group' ? group.id : null } })
      repo.updateRun(app.db, claim.run.id, { status: 'succeeded', endedAt: new Date().toISOString() })
      repo.setTaskStatus(app.db, id, 'review')
    }
    const check = app.scheduler.claimNext()!
    expect(repo.isAssistantCheck(app.db, check.task.id)).toBe(true)
    expect(check.agentId).toBe(next)
  })

  it('waits on an incompatible selection and resumes the original conversation once its agent is eligible again', () => {
    app.assistant.configure({ enabled: false })
    const thread = app.assistant.send('Keep this conversation')
    const opened = sessioned(app.db, thread.id, agent, 'review')
    const sessionId = repo.getRun(app.db, opened)!.sessionId
    const other = makeAgent(app.db, { name: 'Other CLI', command: 'true', logAdapter: 'codex' })
    app.projects.updateProject(QUUU_PROJECT_ID, { targetKind: 'agent', targetId: other })
    app.tasks.sendBack(thread.id, 'Continue our conversation')
    vi.spyOn(app.scheduler, 'tick').mockResolvedValue(undefined)
    app.scheduler.resume()
    expect(app.scheduler.claimNext()).toBeNull()
    expect(repo.getTask(app.db, thread.id)).toMatchObject({ status: 'queued', sessionId })
    expect(repo.listRunsByTask(app.db, thread.id)).toHaveLength(1)
    const group = app.agents.createGroup({ name: 'Compatible group', description: '', strategy: 'priority', memberIds: [other, agent], sortOrder: 0 })
    app.projects.updateProject(QUUU_PROJECT_ID, { targetKind: 'group', targetId: group.id })
    expect(app.scheduler.claimNext()).toMatchObject({ task: { id: thread.id }, agentId: agent, run: { kind: 'followup', sessionId } })
  })
})

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

describe('assistant reset', () => {
  it('clears all assistant history and memory while retaining settings and approved project work', () => {
    const check = completedProposal()
    const proposal = app.assistant.state().proposals[0]
    const approved = app.assistant.createTask(proposal.taskId)
    const thread = app.assistant.state().threads[0]
    app.assistant.markRead(thread.taskId, thread.revision)
    const archived = app.assistant.send('Debug conversation')
    repo.setTaskArchived(app.db, archived.id, true)
    const runId = occupy(app.db, archived.id, agent)
    repo.updateRun(app.db, runId, { status: 'succeeded', endedAt: new Date().toISOString() })
    repo.setTaskStatus(app.db, archived.id, 'review')
    const sessionId = repo.getRun(app.db, runId)!.sessionId
    app.assistant.setMemory('Debug preference', app.assistant.memory().revision)
    app.assistant.configure({ enabled: false, intervalHours: 24, confidenceThreshold: 88 })
    const beforeProject = repo.getProject(app.db, QUUU_PROJECT_ID)
    const settings = app.assistant.settings()
    const hooks = vi.fn()
    repo.setLifecycleRecorder(app.db, hooks)

    expect(app.assistant.reset().sort()).toEqual([check, proposal.taskId, archived.id].sort())
    expect(app.assistant.memory().content).toBe('')
    expect(app.assistant.state()).toMatchObject({ threads: [], proposals: [], unread: false, lastCheckAt: null, nextCheckAt: null, error: null, settings })
    expect(repo.listAssistantChecks(app.db)).toEqual([])
    expect(repo.assistantReads(app.db).size).toBe(0)
    expect(repo.listRunsByTask(app.db, archived.id)).toEqual([])
    expect(repo.getProject(app.db, QUUU_PROJECT_ID)).toEqual(beforeProject)
    expect(repo.getTask(app.db, approved.executionTaskId!)).toMatchObject({ projectId: project, status: 'queued' })
    expect(existsSync(app.assistant.resultPath(check))).toBe(false)
    expect(hooks).not.toHaveBeenCalled()
    // Provider logs remain provider-owned; import must not turn them back into conversations.
    expect(repo.managedSessionIds(app.db).has(sessionId)).toBe(true)
    app.shutdown(); app.db.close()
    app = new QuuuApp(join(dir, 'taskd.db')); app.scheduler.pause()
    app.assistant.reconcile()
    expect(app.assistant.state()).toMatchObject({ threads: [], proposals: [], unread: false, settings })
    expect(repo.managedSessionIds(app.db).has(sessionId)).toBe(true)
  })

  it.each(['thread', 'research'] as const)('refuses to reset active %s work without deleting anything', kind => {
    completedProposal()
    app.assistant.react(app.assistant.state().proposals[0].taskId, 'dismiss')
    makeDue()
    const id = kind === 'thread' ? app.assistant.send('Working').id : app.assistant.prepareCheck()!
    occupy(app.db, id, agent)
    app.assistant.setMemory('Still needed', app.assistant.memory().revision)
    const state = app.assistant.state()
    const tasks = repo.listTasks(app.db, true, true)
    const memory = app.assistant.memory()
    expect(() => app.assistant.reset()).toThrow(/finish/)
    expect(repo.listTasks(app.db, true, true)).toEqual(tasks)
    expect(app.assistant.state()).toEqual(state)
    expect(app.assistant.memory()).toEqual(memory)
  })

  it('does not erase context while a deletion hook is queued', () => {
    const task = app.assistant.send('Debug')
    app.settings.setSettings({ taskHooks: [{ id: 'reset-test', name: 'Deletion hook', kind: 'command', command: 'true', prompt: '', events: ['deleted'], enabled: true, timeoutSeconds: 60 }] })
    app.hooks.record(task, 'deleted')
    expect(() => app.assistant.reset()).toThrow(/finish/)
    expect(repo.getTask(app.db, task.id)).not.toBeNull()
  })

  it('invalidates pre-reset editors even when memory was empty and recovers oversized memory', () => {
    const before = app.assistant.memory()
    app.assistant.reset()
    expect(() => app.assistant.setMemory('Stale draft', before.revision)).toThrow(/changed/)
    const empty = app.assistant.memory()
    app.assistant.reset()
    expect(() => app.assistant.setMemory('Another stale draft', empty.revision)).toThrow(/changed/)
    writeFileSync(memoryPath(dir), 'x'.repeat(MEMORY_MAX_BYTES + 1))
    app.assistant.reset()
    expect(app.assistant.memory().bytes).toBe(0)
  })

  it('waits for a canceled process to exit but does not block on a reused historical PID', () => {
    const task = app.assistant.send('Canceled debug run')
    const id = occupy(app.db, task.id, agent)
    repo.updateRun(app.db, id, { status: 'canceled', pid: process.pid, endedAt: new Date().toISOString() })
    repo.setTaskStatus(app.db, task.id, 'draft')
    // Our test process predates the run, so move its start back to cover that process.
    app.db.prepare('UPDATE runs SET started_at = ? WHERE id = ?').run('2000-01-01T00:00:00Z', id)
    expect(() => app.assistant.reset()).toThrow(/finish/)
    repo.updateRun(app.db, id, { endedAt: '2000-01-02T00:00:00Z' })
    expect(app.assistant.reset()).toContain(task.id)
  })

  it('rolls back deletion if the memory file cannot be replaced', () => {
    completedProposal()
    app.assistant.setMemory('Keep this if reset fails', app.assistant.memory().revision)
    // A directory at the temporary-file path deterministically causes the atomic write to fail.
    mkdirSync(`${memoryPath(dir)}.tmp`)
    const before = app.assistant.state()
    const tasks = repo.listTasks(app.db, true, true)
    expect(() => app.assistant.reset()).toThrow()
    expect(app.assistant.state()).toEqual(before)
    expect(repo.listTasks(app.db, true, true)).toEqual(tasks)
    expect(app.assistant.memory().content).toBe('Keep this if reset fails')
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

  it('adds, changes and clears feedback without accepting, dismissing or creating work', () => {
    completedProposal()
    const proposal = app.assistant.state().proposals[0]
    const tasks = repo.listTasks(app.db, true, true)
    const lifecycle = vi.fn()
    repo.setLifecycleRecorder(app.db, lifecycle)
    // Feedback remains available even when creation is unavailable.
    repo.updateProject(app.db, project, { enabled: false })
    for (const reaction of ['approve', 'approve', 'dismiss', 'clear', 'approve'] as const) {
      expect(app.assistant.react(proposal.taskId, reaction)).toMatchObject({
        status: 'pending', reaction: reaction === 'clear' ? null : reaction, executionTaskId: null
      })
    }
    expect(repo.listTasks(app.db, true, true)).toEqual(tasks)
    expect(lifecycle).not.toHaveBeenCalled()
    app.shutdown(); app.db.close()
    app = new QuuuApp(join(dir, 'taskd.db')); app.scheduler.pause()
    app.assistant.reconcile()
    expect(repo.listTasks(app.db, true, true)).toEqual(tasks)
    expect(app.assistant.state().proposals[0]).toMatchObject({ status: 'pending', reaction: 'approve', executionTaskId: null })
  })

  it('creates exactly once independently of feedback and retains the receipt after reopening and task deletion', () => {
    completedProposal()
    const proposal = app.assistant.state().proposals[0]
    app.assistant.react(proposal.taskId, 'dismiss')
    const created = app.assistant.createTask(proposal.taskId)
    expect(created).toMatchObject({ status: 'accepted', reaction: 'dismiss' })
    expect(repo.getTask(app.db, created.executionTaskId!)).toMatchObject({ projectId: project, title: proposal.title, status: 'queued', prompt: proposal.prompt })
    expect(app.assistant.createTask(proposal.taskId)).toEqual(created)
    const execution = repo.getTask(app.db, created.executionTaskId!)
    for (const reaction of ['approve', 'dismiss', 'clear'] as const) {
      expect(app.assistant.react(proposal.taskId, reaction)).toMatchObject({ status: 'accepted', executionTaskId: created.executionTaskId })
    }
    expect(app.tasks.listTasks().filter(t => t.projectId === project)).toHaveLength(1)
    expect(repo.getTask(app.db, created.executionTaskId!)).toEqual(execution)
    app.shutdown(); app.db.close()
    app = new QuuuApp(join(dir, 'taskd.db')); app.scheduler.pause()
    expect(app.assistant.createTask(proposal.taskId).executionTaskId).toBe(created.executionTaskId)
    app.tasks.deleteIdleTasks([created.executionTaskId!])
    expect(app.assistant.createTask(proposal.taskId).executionTaskId).toBe(created.executionTaskId)
    expect(app.tasks.listTasks().filter(t => t.projectId === project)).toHaveLength(0)
  })

  it('rolls back the task and lifecycle effects if receipt storage fails, then allows a safe retry', () => {
    completedProposal()
    const proposal = app.assistant.state().proposals[0]
    const before = repo.listTasks(app.db, true, true)
    const lifecycle = vi.fn()
    const unobserve = repo.observeLifecycle(app.db, lifecycle)
    vi.spyOn(repo, 'saveAssistantProposal').mockImplementationOnce(() => { throw new Error('Disk full') })
    expect(() => app.assistant.createTask(proposal.taskId)).toThrow('Disk full')
    expect(repo.listTasks(app.db, true, true)).toEqual(before)
    expect(app.assistant.state().proposals[0]).toEqual(proposal)
    expect(lifecycle).not.toHaveBeenCalled()
    expect(app.assistant.createTask(proposal.taskId).executionTaskId).toBeTruthy()
    expect(app.tasks.listTasks().filter(t => t.projectId === project)).toHaveLength(1)
    unobserve()
  })

  it('reuses committed work when the creation response fails after commit', () => {
    completedProposal()
    const proposal = app.assistant.state().proposals[0]
    expect(() => inTransaction(app.db, () => {
      app.assistant.createTask(proposal.taskId)
      afterCommit(app.db, () => { throw new Error('Notification unavailable') })
    })).toThrow(/post-commit/)
    const receipt = app.assistant.state().proposals[0]
    expect(app.assistant.createTask(proposal.taskId)).toEqual(receipt)
    expect(app.tasks.listTasks().filter(t => t.projectId === project)).toHaveLength(1)
  })

  it('rejects unavailable targets and archived threads without recording acceptance, then retries after recovery', () => {
    completedProposal()
    const proposal = app.assistant.state().proposals[0]
    repo.updateProject(app.db, project, { enabled: false })
    expect(() => app.assistant.createTask(proposal.taskId)).toThrow()
    expect(app.assistant.state().proposals[0]).toEqual(proposal)
    repo.updateProject(app.db, project, { enabled: true })
    repo.setTaskArchived(app.db, proposal.taskId, true)
    expect(() => app.assistant.createTask(proposal.taskId)).toThrow()
    repo.setTaskArchived(app.db, proposal.taskId, false)
    expect(app.assistant.createTask(proposal.taskId).executionTaskId).toBeTruthy()
  })

  it('includes feedback separately in research and never repeats an existing proposal', () => {
    completedProposal()
    const proposal = app.assistant.state().proposals[0]
    app.assistant.react(proposal.taskId, 'dismiss')
    makeDue()
    const id = completedProposal(99, proposal.title)
    expect(repo.getTask(app.db, id)?.prompt).toContain('"status":"pending","reaction":"dismiss"')
    expect(app.assistant.state().proposals).toHaveLength(1)
    expect(app.assistant.promptContext(proposal.taskId, 'run')).toContain('Reactions are feedback only, never approval')
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
