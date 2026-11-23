import { beforeEach, describe, expect, it } from 'vitest'
import { inTransaction, type Db } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'
import { EVERYTHING, hookRan, NOTHING, ranWithConversation, saveConversation, savedRows } from './sessionRelease.js'

/**
 * Deleting a task deletes its run history, and **the conversations are run history**.
 *
 * They are saved against the log they were read from, not against the task, so no foreign key
 * takes them along. Left behind they could never be opened again (the task is gone) and never
 * went away either: retention defaults to keeping everything, and they were most of the database.
 *
 * What is pinned down here is both halves of that:
 *   - the conversation of a deleted task goes, from every table that holds a part of it
 *   - a conversation something else still names stays: another task, a hook's history, a report
 */
describe('deleting a task', () => {
  let db: Db
  let agent: string
  let project: string

  beforeEach(() => {
    db = memoryDb()
    agent = makeAgent(db, { name: 'a' })
    project = makeProject(db, { name: 'p', path: '/tmp/p', targetId: agent })
  })

  it('removes the conversation its runs saved and leaves another task\'s alone', () => {
    const gone = makeTask(db, project, '消えるタスク')
    const kept = makeTask(db, project, '残るタスク')
    const goneKey = ranWithConversation(db, gone, agent, '/logs/gone.jsonl')
    const keptKey = ranWithConversation(db, kept, agent, '/logs/kept.jsonl')

    repo.deleteTask(db, gone)

    expect(savedRows(db, goneKey)).toEqual(NOTHING)
    expect(savedRows(db, keptKey)).toEqual(EVERYTHING)
    expect(savedRows(db)).toEqual(EVERYTHING)
  })

  it('removes every conversation of a task that ran more than once', () => {
    const task = makeTask(db, project, 'やり直したタスク')
    ranWithConversation(db, task, agent, '/logs/first.jsonl')
    ranWithConversation(db, task, agent, '/logs/fallback.jsonl')

    repo.deleteTask(db, task)

    expect(savedRows(db)).toEqual(NOTHING)
  })

  it('removes the console output saved for a run that had no structured log', () => {
    const task = makeTask(db, project, 'stdout だけのタスク')
    const structured = ranWithConversation(db, task, agent, '/logs/console.jsonl')
    const stdout = structured.replace(/^[^:]*:[^:]*:.*$/, 'v1:stdout:/logs/console.jsonl.stdout')
    saveConversation(db, stdout)

    repo.deleteTask(db, task)

    expect(savedRows(db)).toEqual(NOTHING)
  })

  it('keeps a conversation while a run of another task still reads the same log', () => {
    const gone = makeTask(db, project, '消えるタスク')
    const kept = makeTask(db, project, '同じ会話を続けたタスク')
    const key = ranWithConversation(db, gone, agent, '/logs/shared.jsonl')
    ranWithConversation(db, kept, agent, '/logs/shared.jsonl')

    repo.deleteTask(db, gone)
    expect(savedRows(db, key)).toEqual(EVERYTHING)

    // Once the last one that names it goes, so does the conversation
    repo.deleteTask(db, kept)
    expect(savedRows(db)).toEqual(NOTHING)
  })

  /*
   * Hooks and reports read through the same index without ever being a run
   * (`SessionIndex.requestAuxiliary`), and a hook's history survives the task it ran for.
   * Releasing by "no run names it" alone would empty conversations that can still be opened.
   */
  it('keeps a conversation while a hook\'s history still names its log', () => {
    const task = makeTask(db, project, 'フックが同じログを開いたタスク')
    const key = ranWithConversation(db, task, agent, '/logs/hooked.jsonl')
    hookRan(db, task, project, { sessionLogPath: '/logs/hooked.jsonl' })

    repo.deleteTask(db, task)

    expect(repo.listHookRuns(db, { taskId: task })).toHaveLength(1)
    expect(savedRows(db, key)).toEqual(EVERYTHING)
  })

  it('keeps a hook\'s own conversation, which no run ever named', () => {
    const task = makeTask(db, project, 'フックが走ったタスク')
    ranWithConversation(db, task, agent, '/logs/work.jsonl')
    hookRan(db, task, project, { id: 'hook_own', logPath: '/hooks/hook_own.log', sessionLogPath: '/logs/hook-own.jsonl' })
    saveConversation(db, 'v1:claude:/logs/hook-own.jsonl')
    saveConversation(db, 'v1:stdout:/hooks/hook_own.log')

    repo.deleteTask(db, task)

    expect(savedRows(db, 'v1:claude:/logs/hook-own.jsonl')).toEqual(EVERYTHING)
    expect(savedRows(db, 'v1:stdout:/hooks/hook_own.log')).toEqual(EVERYTHING)
    expect(savedRows(db).session_indexes).toBe(2)
  })

  it('keeps a conversation while a report still names its log', () => {
    const gone = makeTask(db, project, '消えるタスク')
    const reported = makeTask(db, project, 'レポートを書いているタスク')
    const key = ranWithConversation(db, gone, agent, '/logs/reported.jsonl')
    repo.saveTaskReport(db, {
      taskId: reported, status: 'generating', revision: '', path: '', pending: '', logPath: '/reports/r.log', exitPath: '',
      error: '', cwd: '/tmp/p', pid: null, startedAt: '2026-01-01T00:00:00.000Z', endedAt: null,
      conversation: { adapter: 'claude', sessionId: 'writer', input: 'write it', sessionLogPath: '/logs/reported.jsonl' }
    })

    repo.deleteTask(db, gone)

    expect(savedRows(db, key)).toEqual(EVERYTHING)
  })

  /*
   * One store holds every opencode session, so every one of its runs names the same file. The
   * session id is what tells them apart - in the key, and so in deciding whose pages go.
   */
  it('removes only its own session from a store every session shares', () => {
    const gone = makeTask(db, project, '消えるタスク')
    const kept = makeTask(db, project, '残るタスク')
    const goneKey = ranWithConversation(db, gone, agent, '/store/opencode.db', { sessionId: 'ses_gone', mode: 'opencode' })
    const keptKey = ranWithConversation(db, kept, agent, '/store/opencode.db', { sessionId: 'ses_kept', mode: 'opencode' })
    expect(goneKey).not.toBe(keptKey)

    repo.deleteTask(db, gone)

    expect(savedRows(db, goneKey)).toEqual(NOTHING)
    expect(savedRows(db, keptKey)).toEqual(EVERYTHING)
  })

  it('removes the hook conversations too when a conversation is reset without its history', () => {
    const task = makeTask(db, project, 'リセットされる会話')
    ranWithConversation(db, task, agent, '/logs/reset.jsonl')
    hookRan(db, task, project, { id: 'hook_reset', logPath: '/hooks/hook_reset.log', sessionLogPath: '/logs/hook-reset.jsonl' })
    saveConversation(db, 'v1:claude:/logs/hook-reset.jsonl')

    repo.deleteTask(db, task, false)

    expect(repo.listHookRuns(db, { taskId: task })).toHaveLength(0)
    expect(savedRows(db)).toEqual(NOTHING)
  })

  it('does not let saved conversations pile up over repeated create and delete', () => {
    const survivor = makeTask(db, project, '残るタスク')
    ranWithConversation(db, survivor, agent, '/logs/survivor.jsonl')

    for (let round = 0; round < 5; round++) {
      const task = makeTask(db, project, `round ${round}`)
      ranWithConversation(db, task, agent, `/logs/round-${round}.jsonl`)
      expect(savedRows(db).session_indexes).toBe(2)
      repo.deleteTask(db, task)
      expect(savedRows(db)).toEqual(EVERYTHING)
    }
  })

  it('rolls the conversation back with the deletion when the surrounding operation fails', () => {
    const task = makeTask(db, project, '消し損ねたタスク')
    const key = ranWithConversation(db, task, agent, '/logs/rollback.jsonl')

    expect(() => inTransaction(db, () => { repo.deleteTask(db, task); throw new Error('later step failed') })).toThrow('later step failed')

    expect(repo.getTask(db, task)).not.toBeNull()
    expect(savedRows(db, key)).toEqual(EVERYTHING)
  })
})
