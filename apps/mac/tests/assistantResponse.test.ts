import { appendFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import { runExitPath } from '../src/main/appPaths.js'
import type { Run } from '../src/main/execution/types.js'
import type { Classification } from '../src/main/execution/errorClassifier.js'
import { QUUU_PROJECT_ID } from '../src/main/projects/types.js'
import { sessionKey } from '../src/main/session/index.js'
import { sessionReadTarget } from '../src/main/session/sessionAttach.js'
import { makeAgent, makeProject, makeTask } from './helpers.js'

let dir: string
let app: QuuuApp
let agentId: string
let notify: ReturnType<typeof vi.fn>
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-response-'))
  vi.stubEnv('QUUU_USER_DATA', dir)
  app = new QuuuApp(join(dir, 'taskd.db'))
  app.scheduler.pause()
  agentId = makeAgent(app.db, { name: 'Conversation agent', logAdapter: 'claude', resumeArgsTemplate: ['{{sessionId}}', '{{prompt}}'] })
  app.projects.ensureBuiltIn(dir)
  repo.updateProject(app.db, QUUU_PROJECT_ID, { targetKind: 'agent', targetId: agentId })
  notify = vi.fn()
  app.on('notify', notify)
})
afterEach(async () => {
  app.shutdown()
  await app.sessions.settled()
  app.db.close()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

function prepare(message: string, previous?: Run): Run {
  const task = previous ? repo.getTask(app.db, previous.taskId)! : app.assistant.send(message)
  if (previous) expect(app.tasks.send(task.id, message).ok).toBe(true)
  const run = app.runner.prepare({ task: repo.getTask(app.db, task.id)!, project: repo.getProject(app.db, task.projectId)!,
    agent: repo.getAgent(app.db, agentId)!, groupId: null, kind: previous ? 'followup' : 'initial',
    messageOverride: message, sessionId: previous?.sessionId, fallbackFromRunId: null })
  const path = previous?.sessionLogPath ?? join(dir, `${run.sessionId}.jsonl`)
  repo.updateRun(app.db, run.id, { status: 'running', sessionLogPath: path })
  appendFileSync(path, JSON.stringify({ type: 'user', uuid: `user-${run.id}`, message: { role: 'user', content: run.args.join(' ') } }) + '\n')
  return repo.getRun(app.db, run.id)!
}

function reply(run: Run, text: string): void {
  appendFileSync(run.sessionLogPath!, JSON.stringify({ type: 'assistant', uuid: `reply-${run.id}`,
    message: { role: 'assistant', content: [{ type: 'text', text }] } }) + '\n')
}

async function finish(run: Run, classification: Classification = { kind: null, message: '' }, code: number | null = 0): Promise<void> {
  app.runner.complete(run, classification, code, '')
  await vi.waitFor(() => expect(['starting', 'running']).not.toContain(repo.getRun(app.db, run.id)?.status))
}

it('finishes a conversation without approval, hooks or retained slots and continues it after reopening', async () => {
  const hooks = vi.fn()
  const gate = vi.fn(() => true)
  repo.setLifecycleRecorder(app.db, hooks)
  app.scheduler.setReviewGate(gate)
  const first = prepare('Which project should I choose?')
  repo.patchTask(app.db, first.taskId, { priority: 0 })
  reply(first, 'Which directory should the project use?')
  await finish(first)
  expect(repo.getTask(app.db, first.taskId)).toMatchObject({ status: 'review', doneAt: null, sessionId: first.sessionId })
  expect(hooks).not.toHaveBeenCalled()
  expect(gate).not.toHaveBeenCalled()
  expect(app.scheduler.status()).toMatchObject({ review: 0, activeRuns: 0, holds: [] })
  expect(app.tasks.listTasks()).toEqual([])
  expect(notify).not.toHaveBeenCalledWith(expect.objectContaining({ notificationKind: 'review' }))
  const history = repo.listRunsByTask(app.db, first.taskId)
  app.shutdown()
  await app.sessions.settled()
  app.db.close()
  app = new QuuuApp(join(dir, 'taskd.db'))
  app.scheduler.pause()
  expect(repo.listRunsByTask(app.db, first.taskId)).toEqual(history)
  expect(app.assistant.state().threads[0].preview).toBe('Which directory should the project use?')
  const next = prepare('/tmp/example', first)
  expect(next.sessionId).toBe(first.sessionId)
  reply(next, 'The directory is selected.')
  await finish(next)
  expect(app.assistant.state().threads[0]).toMatchObject({ replies: 2, preview: 'The directory is selected.' })
  expect(repo.getTask(app.db, first.taskId)?.doneAt).toBeNull()
})

it('delivers reserved conversation input after success and retains it after an invalid result', async () => {
  const first = prepare('Help me choose')
  expect(app.tasks.send(first.taskId, 'Also check the directory')).toEqual({ ok: true, reserved: true })
  reply(first, 'Here are the options.')
  await finish(first)
  expect(repo.getTask(app.db, first.taskId)).toMatchObject({ status: 'queued', pendingMessage: 'Also check the directory', reservedMessage: '' })
  const next = prepare('And check permissions', first)
  expect(app.tasks.send(next.taskId, 'Keep this question')).toEqual({ ok: true, reserved: true })
  await finish(next)
  expect(repo.getTask(app.db, next.taskId)).toMatchObject({ status: 'failed', reservedMessage: 'Keep this question', doneAt: null })
  expect(app.assistant.state().threads[0].unread).toBe(true)
  expect(notify).toHaveBeenCalledWith(expect.objectContaining({ notificationKind: 'failure', taskId: first.taskId }))
})

it('calls the agent for thanks and completes an explicit no-reply turn without a reply, unread mark or notification', async () => {
  const run = prepare('ありがとう')
  expect(run.args).toEqual(['ありがとう'])
  app.assistant.noReply(run.id)
  app.assistant.noReply(run.id)
  reply(run, ' \n\t\u3000\u00a0 ')
  await finish(run)
  expect(repo.getTask(app.db, run.taskId)?.status).toBe('review')
  expect(repo.getRun(app.db, run.id)?.status).toBe('succeeded')
  expect(repo.getAssistantTurn(app.db, run.id)?.outcome).toBe('no-reply')
  expect(app.assistant.state().threads[0]).toMatchObject({ preview: '', replies: 0, unread: false })
  expect(notify).not.toHaveBeenCalled()
  expect(repo.countActiveRuns(app.db)).toBe(0)
})

it.each(['ありがとう。次は何をすればいい？', 'ありがとう。対象プロジェクトを追加してください。', '今の状態を教えて'])('keeps the reply to %s and a reply notification without work review', async message => {
  const run = prepare(message)
  reply(run, '必要な回答と操作結果です。')
  await finish(run)
  expect(repo.getAssistantTurn(app.db, run.id)?.outcome).toBe('reply')
  expect(app.assistant.state().threads[0]).toMatchObject({ preview: '必要な回答と操作結果です。', replies: 1, unread: true })
  expect(notify).toHaveBeenCalledWith(expect.objectContaining({ notificationKind: 'assistant', taskId: run.taskId }))
})

it('keeps read replies read across silent follow-ups and resumes the same session for another question', async () => {
  const first = prepare('設定を教えて')
  reply(first, '現在の設定です。')
  await finish(first)
  const before = app.assistant.state().threads[0]
  app.assistant.markRead(first.taskId, before.revision)
  notify.mockClear()
  const silent = prepare('ありがとう', first)
  expect(app.assistant.state().unread).toBe(false)
  app.assistant.noReply(silent.id)
  await finish(silent)
  expect(app.assistant.state().threads[0]).toMatchObject({ revision: before.revision, unread: false, replies: 1 })
  expect(notify).not.toHaveBeenCalled()
  const next = prepare('ありがとう。間隔は変更できる？', silent)
  expect(next.sessionId).toBe(first.sessionId)
  reply(next, '間隔は設定画面で変更できます。')
  await finish(next)
  expect(app.assistant.state().threads[0]).toMatchObject({ unread: true, replies: 2, preview: '間隔は設定画面で変更できます。' })
  expect(notify).toHaveBeenCalledTimes(1)
})

it('does not consume previously unread replies when a later turn deliberately stays silent', async () => {
  const first = prepare('質問')
  reply(first, '回答')
  await finish(first)
  const before = app.assistant.state().threads[0]
  const silent = prepare('ありがとう', first)
  app.assistant.noReply(silent.id)
  await finish(silent)
  expect(app.assistant.state().threads[0]).toMatchObject({ revision: before.revision, unread: true })
})

it('carries an unchanged read receipt from an older app through a subsequent silent turn', async () => {
  const first = prepare('設定を教えて')
  reply(first, '現在の設定です。')
  await finish(first)
  const run = repo.getRun(app.db, first.id)!
  const key = sessionKey(sessionReadTarget(app.db, run))
  const index = repo.getSessionIndex(app.db, key)!
  const version = [key, index.generation, index.total, index.stamp].join(':')
  repo.readAssistantThread(app.db, first.taskId, [version, run.id, run.status, undefined].join(':'))
  expect(app.assistant.state().unread).toBe(false)
  const silent = prepare('ありがとう', first)
  app.assistant.noReply(silent.id)
  await finish(silent)
  expect(app.assistant.state().unread).toBe(false)
})

it('does not mistake old replies or an earlier no-reply decision for the result of a new attempt', async () => {
  const first = prepare('ありがとう')
  reply(first, 'どういたしまして')
  await finish(first)
  const silent = prepare('ありがとう', first)
  app.assistant.noReply(silent.id)
  await finish(silent)
  const missing = prepare('ありがとう', silent)
  await finish(missing)
  expect(repo.getRun(app.db, missing.id)).toMatchObject({ status: 'failed', errorKind: 'invalid-result' })
  expect(repo.getTask(app.db, first.taskId)?.status).toBe('failed')
  expect(notify).toHaveBeenLastCalledWith(expect.objectContaining({ notificationKind: 'failure' }))
})

it('preserves a real answer even if the agent also requested silence', async () => {
  const run = prepare('ありがとう。結果を教えて')
  app.assistant.noReply(run.id)
  reply(run, '操作は完了しました。')
  await finish(run)
  expect(repo.getAssistantTurn(app.db, run.id)?.outcome).toBe('reply')
  expect(app.assistant.state().threads[0]).toMatchObject({ preview: '操作は完了しました。', unread: true })
  expect(notify).toHaveBeenCalledTimes(1)
})

it.each(['nonzero-exit', 'timeout', 'canceled', 'limit'] as const)('never hides a %s after an explicit no-reply decision', async kind => {
  const run = prepare('ありがとう')
  app.assistant.noReply(run.id)
  await finish(run, { kind, message: 'Execution did not succeed' }, 1)
  expect(repo.getRun(app.db, run.id)).toMatchObject({ errorKind: kind })
  expect(repo.getRun(app.db, run.id)?.status).not.toBe('succeeded')
  expect(repo.getAssistantTurn(app.db, run.id)?.outcome).toBeNull()
  if (kind === 'nonzero-exit' || kind === 'timeout') {
    expect(app.assistant.state().unread).toBe(true)
    if (kind === 'nonzero-exit') expect(notify).toHaveBeenCalledWith(expect.objectContaining({ notificationKind: 'failure' }))
    else expect(repo.getTask(app.db, run.taskId)?.status).toBe('queued')
  }
})

it('requires a confirmed successful exit and reports indexing errors instead of silently completing', async () => {
  const unknown = prepare('ありがとう')
  app.assistant.noReply(unknown.id)
  await finish(unknown, { kind: null, message: '' }, null)
  expect(repo.getRun(app.db, unknown.id)).toMatchObject({ status: 'failed', errorKind: 'invalid-result' })
  const broken = prepare('ありがとう')
  app.assistant.noReply(broken.id)
  vi.spyOn(app.sessions, 'ready').mockRejectedValueOnce(new Error('Unreadable session'))
  await finish(broken)
  expect(repo.getRun(app.db, broken.id)).toMatchObject({ status: 'failed', errorKind: 'invalid-result' })
})

it('recovers the persisted decision and successful exit after an app restart without notifying', async () => {
  const run = prepare('ありがとう')
  app.assistant.noReply(run.id)
  writeFileSync(runExitPath(run.id), '0')
  app.shutdown()
  await app.sessions.settled()
  app.db.close()
  app = new QuuuApp(join(dir, 'taskd.db'))
  app.scheduler.pause()
  app.on('notify', notify)
  app.scheduler.reconcile()
  await vi.waitFor(() => expect(repo.getRun(app.db, run.id)?.status).toBe('succeeded'))
  expect(repo.getTask(app.db, run.taskId)?.status).toBe('review')
  expect(existsSync(runExitPath(run.id))).toBe(false)
  expect(app.assistant.state().unread).toBe(false)
  expect(notify).not.toHaveBeenCalled()
})

it('keeps capacity occupied and the exit receipt while validating, and lets cancellation win', async () => {
  const run = prepare('ありがとう')
  app.assistant.noReply(run.id)
  writeFileSync(runExitPath(run.id), '0')
  let release!: () => void
  vi.spyOn(app.sessions, 'ready').mockReturnValueOnce(new Promise<void>(resolve => { release = resolve }))
  app.runner.complete(run, { kind: null, message: '' }, 0, '')
  expect(repo.countActiveRuns(app.db)).toBe(1)
  expect(existsSync(runExitPath(run.id))).toBe(true)
  app.tasks.cancelTask(run.taskId)
  release()
  await app.sessions.settled()
  expect(repo.getRun(app.db, run.id)?.status).toBe('canceled')
  expect(notify).not.toHaveBeenCalledWith(expect.objectContaining({ notificationKind: 'review' }))
})

it('delivers a reserved follow-up after silence and rejects stale, ordinary-task and research decisions', async () => {
  const run = prepare('ありがとう')
  app.assistant.noReply(run.id)
  expect(app.tasks.send(run.taskId, '追加で教えて').reserved).toBe(true)
  await finish(run)
  expect(repo.getTask(app.db, run.taskId)).toMatchObject({ status: 'queued', pendingMessage: '追加で教えて' })
  expect(() => app.assistant.noReply(run.id)).toThrow(/current running/)
  const project = makeProject(app.db, { name: 'Code', targetId: agentId, path: dir })
  const taskId = makeTask(app.db, project, 'Development report')
  const ordinary = app.runner.prepare({ task: repo.getTask(app.db, taskId)!, project: repo.getProject(app.db, project)!,
    agent: repo.getAgent(app.db, agentId)!, groupId: null, kind: 'initial', fallbackFromRunId: null })
  expect(ordinary.args.join(' ')).not.toContain('assistant.noReply')
  expect(() => app.assistant.noReply(ordinary.id)).toThrow()
  await finish(ordinary)
  expect(repo.getRun(app.db, ordinary.id)?.status).toBe('succeeded')
  const check = app.assistant.prepareCheck()!
  const research = app.runner.prepare({ task: repo.getTask(app.db, check)!, project: repo.getProject(app.db, QUUU_PROJECT_ID)!,
    agent: repo.getAgent(app.db, agentId)!, groupId: null, kind: 'initial', fallbackFromRunId: null })
  expect(research.args.join(' ')).not.toContain('assistant.noReply')
  expect(() => app.assistant.noReply(research.id)).toThrow()
})
