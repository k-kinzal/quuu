import { describe, expect, it } from 'vitest'
import type { Agent } from '../src/main/agents/types.js'
import type { AppSnapshot } from '../src/main/snapshot.js'
import type { Project } from '../src/main/projects/types.js'
import type { AgentGroup } from '../src/main/agents/types.js'
import { projectIssues } from '../src/renderer/src/model/derive.js'
import { resolveAgentForProject } from '../src/main/execution/agentResolver.js'
import * as repo from '../src/main/db/repo.js'
import { makeAgent, makeProject, memoryDb } from './helpers.js'

function agent(over: Partial<Agent> & { id: string }): Agent {
  return {
    name: over.id,
    description: '',
    command: 'echo',
    argsTemplate: [],
    resumeArgsTemplate: [],
    env: {},
    concurrency: 1,
    fallbackAgentId: null,
    limitPatterns: [],
    cooldownSeconds: 0,
    timeoutSeconds: 0,
    logAdapter: 'claude',
    enabled: true,
    source: 'user',
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    ...over
  }
}

function group(id: string, memberIds: string[]): AgentGroup {
  return {
    id,
    name: id,
    description: '',
    strategy: 'priority',
    memberIds,
    isDefault: false,
    sortOrder: 0,
    createdAt: '',
    updatedAt: ''
  }
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p',
    name: 'p',
    path: '/tmp',
    color: '#4EA8DE',
    priority: 2,
    targetKind: 'agent',
    targetId: 'a1',
    maxConcurrent: 1,
    enabled: true,
    deletedAt: null,
    importSince: null,
    commitIdentityMode: 'inherit',
    editorApp: '',
    reportEnabled: true,
    commitIdentity: { appSlug: '', botUserId: '' },
    source: 'user',
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    ...over
  }
}

function snapshot(agents: Agent[], groups: AgentGroup[] = []): AppSnapshot {
  return {
    projects: [],
    tasks: [],
    rules: [],
    agents,
    groups,
    runs: [],
    scheduler: {
      running: true,
      activeRuns: 0,
      totalSlots: 0,
      queued: 0,
      review: 0,
      failed: 0,
      agents: [],
      holds: [],
      warnings: [],
      lastTickAt: null
    }
  }
}

const kinds = (snap: AppSnapshot, p: Project, override: string | null = null): string[] =>
  projectIssues(snap, p, override).map((i) => i.kind)

describe('deciding when project settings need changing', () => {
  it('reports nothing when the settings can run', () => {
    expect(kinds(snapshot([agent({ id: 'a1' })]), project())).toEqual([])
  })

  it('reports that a stopped project leaves its tasks unpicked', () => {
    expect(kinds(snapshot([agent({ id: 'a1' })]), project({ enabled: false }))).toEqual(['disabled'])
  })

  it('reports an unassigned run target', () => {
    expect(kinds(snapshot([agent({ id: 'a1' })]), project({ targetId: null }))).toEqual([
      'no-target'
    ])
  })

  it('reports a target that has been deleted', () => {
    expect(kinds(snapshot([agent({ id: 'a1' })]), project({ targetId: 'gone' }))).toEqual([
      'target-missing'
    ])
  })

  it('reports a disabled target agent', () => {
    expect(kinds(snapshot([agent({ id: 'a1', enabled: false })]), project())).toEqual([
      'no-usable-agent'
    ])
  })

  it('can still run when a fallback behind a disabled one is enabled', () => {
    const snap = snapshot([
      agent({ id: 'a1', enabled: false, fallbackAgentId: 'a2' }),
      agent({ id: 'a2' })
    ])
    expect(kinds(snap, project())).toEqual([])
  })

  it('reports a group whose members are all disabled', () => {
    const snap = snapshot(
      [agent({ id: 'a1', enabled: false }), agent({ id: 'a2', enabled: false })],
      [group('g1', ['a1', 'a2'])]
    )
    expect(kinds(snap, project({ targetKind: 'group', targetId: 'g1' }))).toEqual([
      'no-usable-agent'
    ])
  })

  it('does not treat an unassigned project as a problem when the task pins an agent', () => {
    const snap = snapshot([agent({ id: 'a9' })])
    expect(kinds(snap, project({ targetId: null }), 'a9')).toEqual([])
    // If the pinned agent itself is disabled, it still cannot run
    const disabled = snapshot([agent({ id: 'a9', enabled: false })])
    expect(kinds(disabled, project({ targetId: null }), 'a9')).toEqual(['no-usable-agent'])
  })

  it('reports being stopped together with the run target problem', () => {
    expect(
      kinds(snapshot([]), project({ enabled: false, targetId: null })).sort()
    ).toEqual(['disabled', 'no-target'])
  })

  /**
   * This decision retraces the resolution rules of main on the renderer side.
   * If only the display drifts from reality you get "opening settings shows nothing to fix", so
   * it is pinned down that the same input reaches the same conclusion as the scheduler.
   */
  it('reaches the same conclusion as the agent resolution in main', () => {
    // 1. The target agent is disabled and there is no fallback
    {
      const db = memoryDb()
      const a1 = makeAgent(db, { name: 'a1', enabled: false })
      const pid = makeProject(db, { name: 'p', targetId: a1 })
      const p = repo.getProject(db, pid)!
      const snap = snapshot(repo.listAgents(db), repo.listGroups(db))
      expect(resolveAgentForProject(db, p)).toEqual({ ok: false, reason: 'no-usable-agent' })
      expect(kinds(snap, p)).toEqual(['no-usable-agent'])
    }

    // 2. The target agent is disabled but a fallback is enabled -> main can resolve it
    {
      const db = memoryDb()
      const a2 = makeAgent(db, { name: 'a2' })
      const a1 = makeAgent(db, { name: 'a1', enabled: false, fallbackAgentId: a2 })
      const pid = makeProject(db, { name: 'p', targetId: a1 })
      const p = repo.getProject(db, pid)!
      const snap = snapshot(repo.listAgents(db), repo.listGroups(db))
      expect(resolveAgentForProject(db, p).ok).toBe(true)
      expect(kinds(snap, p)).toEqual([])
    }

    // 3. Every member of the group is disabled
    {
      const db = memoryDb()
      const a1 = makeAgent(db, { name: 'a1', enabled: false })
      const g = repo.insertGroup(db, {
        name: 'g',
        description: '',
        strategy: 'priority',
        memberIds: [a1],
        sortOrder: 0
      })
      const pid = makeProject(db, { name: 'p', targetKind: 'group', targetId: g.id })
      const p = repo.getProject(db, pid)!
      const snap = snapshot(repo.listAgents(db), repo.listGroups(db))
      expect(resolveAgentForProject(db, p)).toEqual({ ok: false, reason: 'no-usable-agent' })
      expect(kinds(snap, p)).toEqual(['no-usable-agent'])
    }

    // 4. The target has been deleted
    {
      const db = memoryDb()
      const a1 = makeAgent(db, { name: 'a1' })
      const pid = makeProject(db, { name: 'p', targetId: a1 })
      repo.updateProject(db, pid, { targetId: 'gone' })
      const p = repo.getProject(db, pid)!
      const snap = snapshot(repo.listAgents(db), repo.listGroups(db))
      expect(resolveAgentForProject(db, p)).toEqual({ ok: false, reason: 'target-missing' })
      expect(kinds(snap, p)).toEqual(['target-missing'])
    }
  })
})
