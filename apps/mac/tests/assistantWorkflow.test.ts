import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import { QUUU_PROJECT_ID } from '../src/main/projects/types.js'
import { TASK_STATUSES } from '../src/main/tasks/status.js'
import { SyncExporter } from '../src/main/mobile-sync/exportSnapshot.js'
import { SyncFolder } from '../src/main/mobile-sync/folder.js'
import { LAYOUT } from '../src/main/mobile-sync/layout.js'
import { parseSnapshot } from '../../mobile/src/sync/readSnapshot.js'
import { openCountByProject, reviewCount, scopeTasks, workTasks } from '../src/renderer/src/model/derive.js'
import { makeAgent, makeProject, occupy } from './helpers.js'

let dir: string
let app: QuuuApp
let agentId: string
let projectId: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-conversation-workflow-'))
  vi.stubEnv('QUUU_USER_DATA', dir)
  app = new QuuuApp(join(dir, 'taskd.db'))
  app.scheduler.pause()
  agentId = makeAgent(app.db, { name: 'Fixture', logAdapter: 'stdout', resumeArgsTemplate: ['{{sessionId}}', '{{prompt}}'] })
  app.projects.ensureBuiltIn(dir)
  repo.updateProject(app.db, QUUU_PROJECT_ID, { targetKind: 'agent', targetId: agentId })
  // Names never decide whether work is a conversation.
  projectId = makeProject(app.db, { name: 'QuuuAI', targetId: agentId, path: dir })
})
afterEach(async () => {
  app.shutdown()
  await app.sessions.settled()
  app.db.close()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

it('excludes old and new conversations from every work list and count without changing stored history', async () => {
  for (const status of TASK_STATUSES) {
    repo.insertTask(app.db, { projectId: QUUU_PROJECT_ID, title: `Conversation ${status}`, status, priority: 0 })
    repo.insertTask(app.db, { projectId, title: `Work ${status}`, status })
  }
  const before = repo.listTasks(app.db, true)
  const verify = (): void => {
    const snapshot = app.snapshot()
    const work = workTasks(snapshot)
    expect(work).toHaveLength(TASK_STATUSES.length)
    expect(app.tasks.listTasks()).toEqual(work)
    for (const kind of ['all', 'review', 'done', 'project'] as const) {
      for (const showDone of [false, true]) {
        expect(scopeTasks(snapshot, { kind, projectId, showDone }).every(task => task.projectId === projectId)).toBe(true)
      }
    }
    expect(scopeTasks(snapshot, { kind: 'review', showDone: true }).map(task => task.status)).toEqual(['review', 'failed'])
    expect(scopeTasks(snapshot, { kind: 'done', showDone: true }).map(task => task.status)).toEqual(['done'])
    expect(openCountByProject(work)).toEqual(new Map([[projectId, 6]]))
    expect(reviewCount(work)).toBe(2)
    expect(snapshot.scheduler).toMatchObject({ queued: 1, review: 1, failed: 1, holds: [] })
    expect(snapshot.assistant?.threads).toHaveLength(TASK_STATUSES.length)
    expect(scopeTasks(snapshot, { kind: 'quuuAI', showDone: false })).toHaveLength(TASK_STATUSES.length)
    const first = app.tasks.listPage({ limit: 2 })
    const rest = app.tasks.listPage({ after: first.next! })
    expect([...first.tasks, ...rest.tasks]).toEqual(work)
    expect(app.tasks.listPage({ projectId: QUUU_PROJECT_ID }).tasks).toHaveLength(TASK_STATUSES.length)
    expect(repo.listTasks(app.db, true)).toEqual(before)
  }
  verify()
  app.shutdown()
  await app.sessions.settled()
  app.db.close()
  app = new QuuuApp(join(dir, 'taskd.db'))
  app.scheduler.pause()
  verify()

  const folder = new SyncFolder(join(dir, 'sync'))
  await new SyncExporter(app.db).export(folder, false)
  const parsed = parseSnapshot((await folder.read(LAYOUT.snapshot))!)
  if (!parsed.ok) throw new Error(parsed.reason)
  const phone = parsed.value
  expect(phone.tasks).toHaveLength(TASK_STATUSES.length)
  expect(phone.tasks.every(task => task.projectId === projectId)).toBe(true)
  expect(phone.projects.map(project => project.id)).toEqual([projectId])
  expect(phone.omittedDone).toBe(0)
  expect(folder.list(LAYOUT.details)).toHaveLength(TASK_STATUSES.length)
})

it('keeps explicitly created proposal work in the ordinary review and human completion workflow', async () => {
  const check = app.assistant.prepareCheck()!
  writeFileSync(app.assistant.resultPath(check), JSON.stringify({ proposal: {
    projectId, title: 'Implement downloads', prompt: 'Resume downloads.', reason: 'Repeated failures.', confidence: 90
  } }))
  repo.setTaskStatus(app.db, check, 'review')
  app.assistant.reconcile()
  const proposal = app.assistant.state().proposals[0]
  const created = app.assistant.createTask(proposal.taskId)
  const id = created.executionTaskId!
  const notified = vi.fn()
  const hooks = vi.fn()
  app.on('notify', notified)
  repo.setLifecycleRecorder(app.db, hooks)
  const runId = occupy(app.db, id, agentId)
  app.runner.complete(repo.getRun(app.db, runId)!, { kind: null, message: '' }, 0, '')
  expect(app.tasks.getTask(id)).toMatchObject({ status: 'review', doneAt: null })
  expect(scopeTasks(app.snapshot(), { kind: 'review', showDone: false }).map(task => task.id)).toEqual([id])
  expect(notified).toHaveBeenCalledWith(expect.objectContaining({ taskId: id, notificationKind: 'review' }))
  expect(hooks).toHaveBeenCalledWith(expect.objectContaining({ id }), 'review', undefined)
  await app.tasks.markDone(id)
  expect(app.tasks.getTask(id)?.status).toBe('done')
  expect(scopeTasks(app.snapshot(), { kind: 'done', showDone: true }).map(task => task.id)).toEqual([id])
  expect(app.assistant.state().threads.map(thread => thread.taskId)).toContain(proposal.taskId)
})
