import { afterEach, beforeEach, expect, it } from 'vitest'
import { afterCommit, inTransaction, PostCommitError } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { memoryDb, makeAgent, makeProject, makeTask } from './helpers.js'
let db: ReturnType<typeof memoryDb>
let taskId: string
beforeEach(() => { db = memoryDb(); const agent = makeAgent(db, { name: 'a' }); taskId = makeTask(db, makeProject(db, { name: 'p', targetId: agent }), '元の名前') })
afterEach(() => db.close())
it('leaves neither the save nor the notification when the outer transaction fails despite the inner one succeeding', () => {
  const notifications: string[] = []
  expect(() => inTransaction(db, () => {
    inTransaction(db, () => { repo.patchTask(db, taskId, { title: '変更' }); afterCommit(db, () => notifications.push('通知')) })
    expect(notifications).toEqual([])
    throw new Error('failure')
  })).toThrow('failure')
  expect(repo.getTask(db, taskId)?.title).toBe('元の名前')
  expect(notifications).toEqual([])
})
it('does not confuse a committed save with a failure when a notification throws, and runs the remaining notifications', () => {
  const notifications: string[] = []
  expect(() => inTransaction(db, () => {
    repo.patchTask(db, taskId, { title: '確定済み' })
    afterCommit(db, () => { throw new Error('notification failed') })
    afterCommit(db, () => notifications.push(repo.getTask(db, taskId)!.title))
  })).toThrow(PostCommitError)
  expect(repo.getTask(db, taskId)?.title).toBe('確定済み')
  expect(notifications).toEqual(['確定済み'])
})
