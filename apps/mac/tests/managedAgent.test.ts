import { userAgents } from '../src/renderer/src/model/agents.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import { candidateAgentsFor } from '../src/renderer/src/model/derive.js'
import { makeAgent, makeProject, makeTask, occupy } from './helpers.js'

let workdir: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'taskd-managed-'))
  process.env.QUUU_USER_DATA = workdir
})

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

function makeApp(): QuuuApp {
  const app = new QuuuApp(':memory:')
  app.scheduler.pause()
  return app
}

describe('agents managed behind the scenes', () => {
  it('is excluded from the candidates shown in the settings list', () => {
    const app = makeApp()
    makeAgent(app.db, { name: 'ユーザーの定義' })
    makeAgent(app.db, { name: 'Codex（外部）', source: 'imported', enabled: false })

    const names = userAgents(app.snapshot().agents).map((a) => a.name)
    expect(names).toEqual(['ユーザーの定義'])
  })

  it('does not appear in the task agent picker either', () => {
    const app = makeApp()
    const mine = makeAgent(app.db, { name: 'ユーザーの定義' })
    makeAgent(app.db, { name: 'Codex（外部）', source: 'imported', enabled: false })
    makeProject(app.db, { name: 'p', targetId: mine, path: workdir })

    const snapshot = app.snapshot()
    const project = snapshot.projects[0]
    const names = candidateAgentsFor(snapshot, project, null).map((a) => a.name)
    expect(names).toEqual(['ユーザーの定義'])
  })

  it('is not counted as a run slot (not shown in the monitoring strip)', () => {
    const app = makeApp()
    makeAgent(app.db, { name: 'ユーザーの定義', concurrency: 2 })
    makeAgent(app.db, { name: 'Codex（外部）', source: 'imported', enabled: false })

    const status = app.scheduler.status()
    expect(status.agents.map((a) => a.agentName)).toEqual(['ユーザーの定義'])
  })

  it('cannot be edited or deleted from the UI', () => {
    const app = makeApp()
    const managed = makeAgent(app.db, {
      name: 'Codex（外部）',
      source: 'imported',
      enabled: false
    })

    expect(() => app.agents.updateAgent(managed, { enabled: true })).toThrow()
    expect(() => app.agents.deleteAgent(managed)).toThrow()

    const after = repo.getAgent(app.db, managed)!
    expect(after.enabled).toBe(false)
    expect(after.source).toBe('imported')
  })

  it('an agent created from the UI belongs to the user even if the imported mark is passed', () => {
    const app = makeApp()
    const created = app.agents.createAgent({
      name: '新しいエージェント',
      description: '',
      command: 'claude',
      argsTemplate: [],
      resumeArgsTemplate: [],
      env: {},
      concurrency: 1,
      fallbackAgentId: null,
      limitPatterns: [],
      cooldownSeconds: 0,
      timeoutSeconds: 0,
      logAdapter: 'claude',
      enabled: false,
      source: 'imported',
      sortOrder: 0
    })

    expect(created.source).toBe('user')
  })

  it('a user definition cannot be rewritten into a managed one (cannot vanish from the UI)', () => {
    const app = makeApp()
    const mine = makeAgent(app.db, { name: 'ユーザーの定義' })

    app.agents.updateAgent(mine, { source: 'imported' })

    expect(repo.getAgent(app.db, mine)?.source).toBe('user')
  })

  it('is dropped even when mixed into group members', () => {
    const app = makeApp()
    const mine = makeAgent(app.db, { name: 'ユーザーの定義' })
    const managed = makeAgent(app.db, {
      name: 'Codex（外部）',
      source: 'imported',
      enabled: false
    })

    const group = app.agents.createGroup({
      name: 'g',
      description: '',
      strategy: 'priority',
      memberIds: [mine, managed],
      sortOrder: 0
    })
    expect(group.memberIds).toEqual([mine])

    const updated = app.agents.updateGroup(group.id, { memberIds: [managed, mine] })
    expect(updated.memberIds).toEqual([mine])
  })

  it('imported tasks stay readable as run history even while the definition stays managed', () => {
    const app = makeApp()
    const mine = makeAgent(app.db, { name: 'ユーザーの定義' })
    const managed = makeAgent(app.db, {
      name: 'Codex（外部）',
      source: 'imported',
      enabled: false
    })
    const project = makeProject(app.db, { name: 'p', targetId: mine, path: workdir })
    const task = makeTask(app.db, project, 't')
    occupy(app.db, task, managed)

    // Only the settings hide it. If the agent name could no longer be resolved
    // from run history, imported task history would show up as "(deleted)"
    const run = repo.listRunsByTask(app.db, task)[0]
    const snapshot = app.snapshot()
    expect(snapshot.agents.find((a) => a.id === run.agentId)?.name).toBe('Codex（外部）')
  })
})
