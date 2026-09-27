import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import type { FinishedEvent } from '../src/main/execution/runner.js'
import { quuuWorkspaceDir } from '../src/main/projects/builtIn.js'
import { QUUU_PROJECT_ID } from '../src/main/projects/types.js'
import { projectsByName } from '../src/renderer/src/model/projectOptions.js'
import { makeAgent, makeProject, makeTask } from './helpers.js'

/**
 * QuuuAI, the project whose tasks operate Quuu itself.
 *
 * It has to be there from the first launch, stay where the running app keeps its workspace,
 * and survive every way a project can be removed or moved - the CLI and MCP included, since
 * they reach the same operations as the screen.
 */

let workdir: string
let workspace: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'taskd-built-in-'))
  process.env.QUUU_USER_DATA = workdir
  workspace = join(workdir, 'Resources', 'quuu-ai')
  mkdirSync(workspace, { recursive: true })
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

describe('the built-in QuuuAI project', () => {
  it('is created at the app workspace, runs on the default group and keeps worktrees and reports off', () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'Claude' })
    const group = app.agents.createGroup({ name: 'Everyday', description: '', strategy: 'priority', memberIds: [agent], sortOrder: 0, isDefault: true })

    const project = app.projects.ensureBuiltIn(workspace)

    expect(project).toMatchObject({
      id: QUUU_PROJECT_ID, name: 'QuuuAI', path: workspace, builtIn: true,
      targetKind: 'group', targetId: group.id, worktreeMode: 'off', reportEnabled: false, commitIdentityMode: 'off'
    })
    expect(app.projects.listProjects().filter(p => p.builtIn)).toHaveLength(1)
  })

  it('is the same row on every launch, following the app when its workspace moves', () => {
    const app = makeApp()
    const first = app.projects.ensureBuiltIn(workspace)
    app.projects.updateProject(first.id, { name: 'Operate Quuu', priority: 3 })

    const moved = join(workdir, 'Applications', 'Quuu.app', 'Contents', 'Resources', 'quuu-ai')
    const again = app.projects.ensureBuiltIn(moved)

    expect(again.id).toBe(first.id)
    expect(again.path).toBe(moved)
    // What the human configured is theirs to keep
    expect(again).toMatchObject({ name: 'Operate Quuu', priority: 3 })
    expect(app.projects.listProjects().filter(p => p.builtIn)).toHaveLength(1)
  })

  it('cannot be deleted, moved or given worktrees, but can be configured and disabled', async () => {
    const app = makeApp()
    const project = app.projects.ensureBuiltIn(workspace)

    expect(() => app.projects.deleteProject(project.id)).toThrow(/cannot be deleted/)
    expect(() => app.projects.updateProject(project.id, { path: workdir })).toThrow(/cannot be changed/)
    expect(() => app.projects.updateProject(project.id, { worktreeMode: 'on' })).toThrow(/worktrees/)
    expect(app.projects.updateProject(project.id, { enabled: false, maxConcurrent: 2 })).toMatchObject({ enabled: false, maxConcurrent: 2 })
    await Promise.resolve()
    expect(repo.getProject(app.db, project.id)?.deletedAt).toBeNull()
  })

  it('comes back when its row was marked deleted outside the operations', () => {
    const app = makeApp()
    app.projects.ensureBuiltIn(workspace)
    repo.deleteProject(app.db, QUUU_PROJECT_ID)

    expect(app.projects.ensureBuiltIn(workspace).deletedAt).toBeNull()
    expect(app.projects.listProjects().map(p => p.id)).toContain(QUUU_PROJECT_ID)
  })

  it('leaves ordinary projects deletable and unmarked', async () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    const id = makeProject(app.db, { name: 'plain', targetId: agent, path: workdir })

    expect(repo.getProject(app.db, id)?.builtIn).toBe(false)
    await app.projects.deleteProject(id)
    expect(repo.getProject(app.db, id)?.deletedAt).not.toBeNull()
  })

  it('heads the project navigation, ahead of names that sort first', () => {
    const app = makeApp()
    const agent = makeAgent(app.db, { name: 'a' })
    makeProject(app.db, { name: 'Alpha', targetId: agent, path: join(workdir, 'alpha') })
    app.projects.ensureBuiltIn(workspace)

    expect(projectsByName(app.projects.listProjects()).map(p => p.name)).toEqual(['QuuuAI', 'Alpha'])
  })

  it('lives inside the packaged app, next to the bundled CLI', () => {
    expect(quuuWorkspaceDir(true, '/Applications/Quuu.app/Contents/Resources', '/ignored')).toBe('/Applications/Quuu.app/Contents/Resources/quuu-ai')
  })
})

describe('a run in QuuuAI', () => {
  function prepare(app: QuuuApp, projectId: string, kind: 'initial' | 'followup'): string[] {
    const agent = makeAgent(app.db, { name: `echo-${kind}`, argsTemplate: ['{{prompt}}'], resumeArgsTemplate: ['{{prompt}}'] })
    const task = repo.getTask(app.db, makeTask(app.db, projectId, 'Add a project'))!
    return app.runner.prepare({
      task: { ...task, prompt: 'Register ~/src/api as a project' },
      project: repo.getProject(app.db, projectId)!,
      agent: repo.getAgent(app.db, agent)!,
      groupId: null,
      kind,
      fallbackFromRunId: null
    }).args
  }

  it('tells a fresh conversation where the bundled skill is', () => {
    const app = makeApp()
    const project = app.projects.ensureBuiltIn(workspace)

    const [prompt] = prepare(app, project.id, 'initial')

    expect(prompt.startsWith('Register ~/src/api as a project\n')).toBe(true)
    expect(prompt).toContain(join(workspace, 'skills', 'quuu', 'SKILL.md'))
    expect(prompt).toContain(join(workdir, 'Resources', 'bin', 'quuu'))
  })

  it('sends follow-ups and other projects’ prompts exactly as written', () => {
    const app = makeApp()
    const project = app.projects.ensureBuiltIn(workspace)
    const agent = makeAgent(app.db, { name: 'plain' })
    const plain = makeProject(app.db, { name: 'plain', targetId: agent, path: workdir })

    expect(prepare(app, project.id, 'followup')).toEqual(['Register ~/src/api as a project'])
    expect(prepare(app, plain, 'initial')).toEqual(['Register ~/src/api as a project'])
  })

  it('finds the bundled quuu first on PATH', async () => {
    const app = makeApp()
    const bin = join(workdir, 'Resources', 'bin')
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(bin, 'quuu'), '#!/bin/sh\necho bundled\n')
    chmodSync(join(bin, 'quuu'), 0o755)
    const project = app.projects.ensureBuiltIn(workspace)
    const agent = repo.getAgent(app.db, makeAgent(app.db, { name: 'sh', command: '/bin/sh', argsTemplate: ['-c', 'command -v quuu'], logAdapter: 'stdout' }))!
    const task = repo.getTask(app.db, makeTask(app.db, project.id, 'Which quuu'))!

    const finished = new Promise<FinishedEvent>(resolve => app.runner.once('finished', resolve))
    await app.runner.start({ task, project, agent, groupId: null, kind: 'initial', fallbackFromRunId: null })
    const { run } = await finished

    expect(readFileSync(run.stdoutLogPath, 'utf8')).toContain(join(bin, 'quuu'))
    app.runner.shutdown()
  })
})
