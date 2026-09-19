import { describe, expect, it } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

/**
 * Deleting a project is a **soft delete**.
 *
 * The row is kept not out of kindness but so the importer can tell "this one was deleted".
 * A hard delete takes the already-imported marker (runs.external_key) with it, so
 * the same session log was picked up as un-imported again and what had been deleted came back.
 *
 * Three things are pinned down here.
 *   - it disappears from the list (it looks deleted)
 *   - the contents (tasks and run history) really are deleted
 *   - the row and the deletion time remain (what the importer judges by)
 */

describe('deleting a project', () => {
  it('disappears from the list while the row remains', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const id = makeProject(db, { name: 'tmp', path: '/private/tmp', targetId: agent })

    repo.deleteProject(db, id)

    expect(repo.listProjects(db)).toHaveLength(0)
    const row = repo.getProject(db, id)
    expect(row?.deletedAt).not.toBeNull()
    expect(row?.importSince).not.toBeNull()
  })

  it('deletes the tasks and the run history', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const id = makeProject(db, { name: 'tmp', targetId: agent })
    const task = makeTask(db, id, '消えるタスク')

    repo.deleteProject(db, id)

    expect(repo.getTask(db, task)).toBeNull()
    expect(repo.listTasks(db)).toHaveLength(0)
  })

  it('does not pick up the tasks of a deleted project from the queue', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const alive = makeProject(db, { name: 'alive', path: '/tmp/alive', targetId: agent })
    const gone = makeProject(db, { name: 'gone', path: '/tmp/gone', targetId: agent })
    makeTask(db, gone, '消えた方のタスク')
    const waiting = makeTask(db, alive, '生きている方のタスク')

    // Delete one of them first and check that the other can still be picked up
    repo.deleteProject(db, gone)
    const queued = repo.listTasks(db).filter((t) => t.status === 'queued')
    expect(queued.map((t) => t.id)).toEqual([waiting])
  })

  it('still finds a deleted one when looking it up by path (the route by which import notices)', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const id = makeProject(db, { name: 'tmp', path: '/private/tmp', targetId: agent })
    repo.deleteProject(db, id)

    expect(repo.findProjectByPath(db, '/private/tmp')?.id).toBe(id)
  })

  it('shows up in the list again when restored, while the import boundary stays', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const id = makeProject(db, { name: 'tmp', path: '/private/tmp', targetId: agent })
    repo.deleteProject(db, id)
    const since = repo.getProject(db, id)?.importSince

    const revived = repo.reviveProject(db, id)

    expect(revived.deletedAt).toBeNull()
    expect(repo.listProjects(db)).toHaveLength(1)
    // The boundary is kept so sessions from before the deletion are never dug up
    expect(revived.importSince).toBe(since)
  })
})
