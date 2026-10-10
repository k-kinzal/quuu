import { createRequire } from 'node:module'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { afterCommit, inTransaction, PostCommitError } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { memoryDb, makeAgent, makeProject, makeTask } from './helpers.js'
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
let db: ReturnType<typeof memoryDb>
let taskId: string
beforeEach(() => { db = memoryDb(); const agent = makeAgent(db, { name: 'a' }); taskId = makeTask(db, makeProject(db, { name: 'p', targetId: agent }), '元の名前') })
afterEach(() => { vi.restoreAllMocks(); db.close() })

function thrownBy(operation: () => unknown): unknown {
  try { operation() } catch (error) { return error }
  throw new Error('expected the operation to throw')
}
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

it('rolls back only a failed savepoint and keeps the outer transaction and its notifications', () => {
  const notifications: string[] = []
  const failure = new Error('inner failure')
  inTransaction(db, () => {
    repo.patchTask(db, taskId, { title: 'outer' })
    afterCommit(db, () => notifications.push('outer'))
    expect(thrownBy(() => inTransaction(db, () => {
      repo.patchTask(db, taskId, { title: 'inner' })
      afterCommit(db, () => notifications.push('inner'))
      throw failure
    }))).toBe(failure)
    expect(db.isTransaction).toBe(true)
    expect(repo.getTask(db, taskId)?.title).toBe('outer')
    inTransaction(db, () => afterCommit(db, () => notifications.push('sibling')))
    expect(notifications).toEqual([])
  })
  expect(db.isTransaction).toBe(false)
  expect(repo.getTask(db, taskId)?.title).toBe('outer')
  expect(notifications).toEqual(['outer', 'sibling'])
})

it.each(['standalone', 'nested'])('preserves SQLITE_FULL after automatic rollback of a %s transaction and recovers', (kind) => {
  const limitedDb = new DatabaseSync(':memory:')
  const notifications: string[] = []
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    limitedDb.exec('CREATE TABLE repro(data BLOB); PRAGMA max_page_count=2')
    let original: unknown
    const fail = (): void => {
      afterCommit(limitedDb, () => notifications.push('failed'))
      try {
        limitedDb.exec('INSERT INTO repro VALUES(zeroblob(100000))')
      } catch (error) {
        original = error
        throw error
      }
    }
    const caught = thrownBy(() => inTransaction(limitedDb, () => {
      limitedDb.exec('INSERT INTO repro VALUES(zeroblob(1))')
      afterCommit(limitedDb, () => notifications.push('outer'))
      if (kind === 'nested') {
        inTransaction(limitedDb, () => afterCommit(limitedDb, () => notifications.push('sibling')))
        inTransaction(limitedDb, fail)
      } else fail()
    }))
    expect(original).toBeInstanceOf(Error)
    expect(caught).toBe(original)
    expect(caught).toMatchObject({ message: 'database or disk is full', code: 'ERR_SQLITE_ERROR', errcode: 13 })
    expect(caught).not.toBeInstanceOf(PostCommitError)
    expect(limitedDb.isTransaction).toBe(false)
    expect(limitedDb.prepare('SELECT * FROM repro').all()).toEqual([])
    expect(notifications).toEqual([])
    expect(log).not.toHaveBeenCalled()

    expect(inTransaction(limitedDb, () => {
      limitedDb.exec('INSERT INTO repro VALUES(zeroblob(1))')
      inTransaction(limitedDb, () => afterCommit(limitedDb, () => notifications.push('recovered')))
      return 'committed'
    })).toBe('committed')
    expect(limitedDb.isTransaction).toBe(false)
    expect(limitedDb.prepare('SELECT * FROM repro').all()).toHaveLength(1)
    expect(notifications).toEqual(['recovered'])
  } finally { limitedDb.close() }
})

it.each(['ROLLBACK', 'ROLLBACK TO operation_0', 'RELEASE operation_0'])('reports a failed %s without replacing the original error or its cause', (statement) => {
  const cause = new Error('underlying failure')
  const original: Error = Object.freeze(Object.assign(new Error('write failed', { cause }), { code: 'ERR_SQLITE_ERROR', errcode: 10 }))
  const cleanupError = new Error('cleanup failed')
  const notifications: string[] = []
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const exec = db.exec.bind(db)
  vi.spyOn(db, 'exec').mockImplementation((sql) => {
    if (sql === statement) throw cleanupError
    exec(sql)
  })
  const fail = (): never => {
    repo.patchTask(db, taskId, { title: 'uncommitted' })
    afterCommit(db, () => notifications.push('failed'))
    throw original
  }
  const caught = thrownBy(() => inTransaction(db, () => {
    afterCommit(db, () => notifications.push('outer'))
    if (statement === 'ROLLBACK') fail()
    else inTransaction(db, fail)
  }))
  expect(caught).toBe(original)
  expect(original.cause).toBe(cause)
  expect(log).toHaveBeenCalledTimes(1)
  expect(log).toHaveBeenCalledWith('Transaction rollback failed', cleanupError)
  expect(notifications).toEqual([])

  // A failed outer rollback can leave SQLite active; explicitly clean up the injected failure.
  if (db.isTransaction) exec('ROLLBACK')
  expect(repo.getTask(db, taskId)?.title).toBe('元の名前')
  inTransaction(db, () => afterCommit(db, () => notifications.push('recovered')))
  expect(notifications).toEqual(['recovered'])
})
