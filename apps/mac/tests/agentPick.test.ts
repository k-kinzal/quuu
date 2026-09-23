import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { isoPlusSeconds } from '../src/main/util.js'
import { makeAgent, makeProject, makeTask, memoryDb, occupy } from './helpers.js'

/**
 * The agent a task is set to is the agent it runs on.
 *
 * A task was set to Codex in a project whose group held Fable and Codex. Codex's one slot was
 * taken, so the first run went to Fable as if nothing had been chosen - and from then on the
 * task belonged to Claude, pick or no pick. A choice a human made is waited for, never traded
 * for whoever happens to be free.
 */

let workdir: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'taskd-agent-pick-'))
  process.env.QUUU_USER_DATA = workdir
})

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

type Db = ReturnType<typeof memoryDb>

function scheduler(db: Db): Scheduler {
  return new Scheduler(db, new Runner(db))
}

/** Fable and Codex in one least-busy group, Fable listed first so it wins any tie. Codex has one slot. */
function frontier(db: Db): { codex: string; claude: string; project: string } {
  const claude = makeAgent(db, { name: 'Fable', command: 'claude', concurrency: 10, sortOrder: 0 })
  const codex = makeAgent(db, { name: 'Codex', command: 'codex', concurrency: 1, sortOrder: 1 })
  const group = repo.insertGroup(db, {
    name: 'Frontier Agents',
    description: '',
    strategy: 'least-busy',
    memberIds: [claude, codex],
    sortOrder: 0
  }).id
  const project = makeProject(db, { name: 'p', targetId: group, targetKind: 'group', maxConcurrent: 10 })
  return { codex, claude, project }
}

describe('a per-task agent pick', () => {
  it('waits for the picked agent instead of running on a free group member of another CLI', () => {
    const db = memoryDb()
    const { codex, claude, project } = frontier(db)
    occupy(db, makeTask(db, project, 'busy'), codex)
    const task = makeTask(db, project, 't')
    repo.patchTask(db, task, { agentOverrideId: codex })

    const s = scheduler(db)
    expect(s.claimNext()).toBeNull()
    expect(repo.countActiveRunsByAgent(db, claude)).toBe(0)
  })

  it('takes the picked agent the moment its slot frees, and does not credit the group with the choice', () => {
    const db = memoryDb()
    const { codex, project } = frontier(db)
    const task = makeTask(db, project, 't')
    repo.patchTask(db, task, { agentOverrideId: codex })

    const claim = scheduler(db).claimNext()
    expect(claim?.agentId).toBe(codex)
    expect(claim?.groupId).toBeNull()
  })

  it('names the picked agent in the reason for waiting', async () => {
    const db = memoryDb()
    const { codex, project } = frontier(db)
    occupy(db, makeTask(db, project, 'busy'), codex)
    const task = makeTask(db, project, 't')
    repo.patchTask(db, task, { agentOverrideId: codex })

    const result = await scheduler(db).runNow(task)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('Codex')
  })

  it('moves along the picked agent’s own fallback during cooldown, never to the project’s target', () => {
    const db = memoryDb()
    const { codex, claude, project } = frontier(db)
    const spare = makeAgent(db, { name: 'Codex (spare)', command: 'codex', sortOrder: 2 })
    repo.updateAgent(db, codex, { fallbackAgentId: spare })
    const task = makeTask(db, project, 't')
    repo.patchTask(db, task, { agentOverrideId: codex })
    repo.setCooldown(db, codex, isoPlusSeconds(600), 'Limit')

    const claim = scheduler(db).claimNext()
    expect(claim?.agentId).toBe(spare)
    expect(repo.countActiveRunsByAgent(db, claude)).toBe(0)
  })

  it('stalls with the agent’s name when the picked agent is disabled', () => {
    const db = memoryDb()
    const { codex, claude, project } = frontier(db)
    repo.updateAgent(db, codex, { enabled: false })
    const task = makeTask(db, project, 't')
    repo.patchTask(db, task, { agentOverrideId: codex })

    const s = scheduler(db)
    expect(s.claimNext()).toBeNull()
    expect(repo.countActiveRunsByAgent(db, claude)).toBe(0)
    expect(s.status().warnings.join('\n')).toContain('This task is set to Codex, which is disabled')
  })

  it('is cleared from every task when the agent is deleted', () => {
    const db = memoryDb()
    const { codex, project } = frontier(db)
    const task = makeTask(db, project, 't')
    repo.patchTask(db, task, { agentOverrideId: codex })

    repo.deleteAgent(db, codex)
    expect(repo.getTask(db, task)?.agentOverrideId).toBeNull()
  })
})
