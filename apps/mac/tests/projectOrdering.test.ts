import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import type { Run } from '../src/main/execution/types.js'
import { projectOptions, projectsByName } from '../src/renderer/src/model/projectOptions.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

const NOW = Date.parse('2026-09-28T12:00:00.000Z')
const WEEK = 7 * 24 * 60 * 60 * 1000
let db: Db
let agentId: string
let sequence = 0

beforeEach(() => {
  db = memoryDb()
  agentId = makeAgent(db, { name: 'Agent' })
  sequence = 0
})
afterEach(() => db.close())

function run(taskId: string, startedAt: number, over: Partial<Run> = {}): void {
  const id = `run-${++sequence}`
  repo.insertRun(db, {
    id, taskId, agentId, startedAt: new Date(startedAt).toISOString(),
    resolvedFromGroupId: null, sessionId: id, kind: 'initial', status: 'succeeded',
    attempt: 1, fallbackFromRunId: null, promptPreview: '', errorKind: null,
    errorMessage: '', pid: null, cwd: '/tmp', command: 'true', args: [],
    exitCode: 0, sessionLogPath: null, stdoutLogPath: '', ...over
  })
}

describe('recent project usage', () => {
  it('counts all runs in the rolling week, including follow-ups and archived or imported work', () => {
    const first = makeProject(db, { name: 'Alpha', targetId: agentId })
    const second = makeProject(db, { name: 'Beta', path: '/tmp/beta', targetId: agentId })
    const taskId = makeTask(db, first, 'Repeated work')
    run(taskId, NOW - WEEK - 1)
    run(taskId, NOW - WEEK)
    run(taskId, NOW - 1000, { kind: 'followup', status: 'failed', errorKind: 'nonzero-exit' })
    run(taskId, NOW, { kind: 'followup', status: 'running' })
    run(taskId, NOW + WEEK)
    repo.setTaskStatus(db, taskId, 'done')
    repo.setTaskArchived(db, taskId, true)
    const imported = makeTask(db, second, 'Imported work')
    run(imported, NOW - 1000, { source: 'imported', externalKey: 'external-session' })
    makeTask(db, second, 'Never run')

    expect(repo.recentRunCountsByProject(db, NOW)).toEqual({ [first]: 3, [second]: 1 })
    expect(repo.recentRunCountsByProject(db, NOW + 1)).toEqual({ [first]: 2, [second]: 1 })
  })

  it('omits projects with no recent runs and removes deleted projects from usage', () => {
    const id = makeProject(db, { name: 'Alpha', targetId: agentId })
    const taskId = makeTask(db, id, 'Old work')
    run(taskId, NOW - WEEK - 1)
    expect(repo.recentRunCountsByProject(db, NOW)).toEqual({})
    run(taskId, NOW)
    expect(repo.recentRunCountsByProject(db, NOW)).toEqual({ [id]: 1 })
    repo.deleteProject(db, id)
    expect(repo.recentRunCountsByProject(db, NOW)).toEqual({})
  })
})

describe('project display order', () => {
  it('uses natural name order for navigation and recent usage for choices, with stable ties', () => {
    const specs = [
      { name: 'Zulu', path: '/tmp/z', priority: 0 },
      { name: 'Alpha 10', path: '/tmp/a10', priority: 1 },
      { name: 'alpha 2', path: '/tmp/b', priority: 2 },
      { name: 'Alpha 2', path: '/tmp/a', priority: 3 },
      { name: 'Unused', path: '/tmp/unused', priority: 4 }
    ]
    const ids = specs.map(spec => makeProject(db, { ...spec, targetId: agentId }))
    const projects = repo.listProjects(db)
    const original = structuredClone(projects)
    const counts = { [ids[0]]: 5, [ids[1]]: 2, [ids[2]]: 2, [ids[3]]: 2 }
    expect(projectsByName(projects).map(p => p.id)).toEqual([ids[3], ids[2], ids[1], ids[4], ids[0]])
    expect(projectOptions(projects, counts).map(p => p.id)).toEqual([ids[0], ids[3], ids[2], ids[1], ids[4]])
    expect(projectOptions(projects).map(p => p.id)).toEqual(projectsByName(projects).map(p => p.id))
    expect(projects).toEqual(original)
    expect(repo.listProjects(db)).toEqual(original)
  })
})
