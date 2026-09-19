import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import { makeAgent } from './helpers.js'

/**
 * The group a new project starts with.
 *
 * Every project used to arrive with no run target, so adding one meant a detour through
 * its settings before a single task could run. One group can be marked as the default;
 * a project added without naming a target is assigned to it.
 */

let workdir: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'taskd-default-group-'))
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

function makeGroup(app: QuuuApp, name: string, memberIds: string[], isDefault = false): string {
  return app.agents.createGroup({
    name,
    description: '',
    strategy: 'priority',
    memberIds,
    sortOrder: 0,
    isDefault
  }).id
}

describe('the default agent group', () => {
  it('is assigned to a project added without a run target', () => {
    const app = makeApp()
    const claude = makeAgent(app.db, { name: 'Claude' })
    const everyday = makeGroup(app, 'Everyday', [claude], true)

    const project = app.projects.createProject({ name: 'new', path: join(workdir, 'new') })

    expect(project.targetKind).toBe('group')
    expect(project.targetId).toBe(everyday)
  })

  it('gives way to a target named at creation', () => {
    const app = makeApp()
    const claude = makeAgent(app.db, { name: 'Claude' })
    makeGroup(app, 'Everyday', [claude], true)

    const project = app.projects.createProject({
      name: 'new',
      path: join(workdir, 'new'),
      targetKind: 'agent',
      targetId: claude
    })

    expect(project.targetKind).toBe('agent')
    expect(project.targetId).toBe(claude)
  })

  it('leaves a new project unassigned while no group is marked', () => {
    const app = makeApp()
    const claude = makeAgent(app.db, { name: 'Claude' })
    makeGroup(app, 'Everyday', [claude])

    const project = app.projects.createProject({ name: 'new', path: join(workdir, 'new') })

    expect(project.targetKind).toBe('agent')
    expect(project.targetId).toBeNull()
  })

  it('is not written into a group that leaves the mark out', () => {
    const app = makeApp()
    const claude = makeAgent(app.db, { name: 'Claude' })
    const group = app.agents.createGroup({
      name: 'Everyday',
      description: '',
      strategy: 'priority',
      memberIds: [claude],
      sortOrder: 0
    })

    expect(group.isDefault).toBe(false)
    expect(repo.getDefaultGroup(app.db)).toBeNull()
  })

  it('moves to the group marked last, so at most one group carries it', () => {
    const app = makeApp()
    const claude = makeAgent(app.db, { name: 'Claude' })
    const first = makeGroup(app, 'First', [claude], true)
    const second = makeGroup(app, 'Second', [claude])

    app.agents.updateGroup(second, { isDefault: true })

    const marked = repo.listGroups(app.db).filter((g) => g.isDefault).map((g) => g.id)
    expect(marked).toEqual([second])
    expect(repo.getGroup(app.db, first)?.isDefault).toBe(false)
    expect(app.projects.createProject({ name: 'new', path: join(workdir, 'new') }).targetId).toBe(second)
  })

  it('survives edits to the group that do not mention it', () => {
    const app = makeApp()
    const claude = makeAgent(app.db, { name: 'Claude' })
    const everyday = makeGroup(app, 'Everyday', [claude], true)

    const renamed = app.agents.updateGroup(everyday, { name: 'Daily', strategy: 'round-robin' })

    expect(renamed.isDefault).toBe(true)
    expect(repo.getDefaultGroup(app.db)?.id).toBe(everyday)
  })

  it('can be taken off again, after which new projects arrive unassigned', () => {
    const app = makeApp()
    const claude = makeAgent(app.db, { name: 'Claude' })
    const everyday = makeGroup(app, 'Everyday', [claude], true)

    app.agents.updateGroup(everyday, { isDefault: false })

    expect(repo.getDefaultGroup(app.db)).toBeNull()
    expect(app.projects.createProject({ name: 'new', path: join(workdir, 'new') }).targetId).toBeNull()
  })

  it('stops applying once the group is deleted', () => {
    const app = makeApp()
    const claude = makeAgent(app.db, { name: 'Claude' })
    const everyday = makeGroup(app, 'Everyday', [claude], true)

    app.agents.deleteGroup(everyday)

    const project = app.projects.createProject({ name: 'new', path: join(workdir, 'new') })
    expect(project.targetId).toBeNull()
  })

  it('reaches the screen through the snapshot', () => {
    const app = makeApp()
    const claude = makeAgent(app.db, { name: 'Claude' })
    const everyday = makeGroup(app, 'Everyday', [claude], true)
    makeGroup(app, 'Other', [claude])

    const flags = app.snapshot().groups.map((g) => [g.id, g.isDefault])
    expect(flags).toContainEqual([everyday, true])
    expect(flags.filter(([, isDefault]) => isDefault)).toHaveLength(1)
  })
})
