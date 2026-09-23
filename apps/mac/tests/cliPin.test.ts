import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import { fallbackHolds, taskLineage } from '../src/main/execution/agentResolver.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { isoPlusSeconds } from '../src/main/util.js'
import { makeAgent, makeProject, makeTask, memoryDb, occupy, sessioned } from './helpers.js'

/**
 * A task never changes CLI.
 *
 * A Codex conversation was continued by a send-back, the run was killed, the follow-up was
 * discarded and the prompt rewritten to "please continue", and the re-run went out as a first run
 * on Claude - a fresh session with two words in it, in a working tree Codex had left mid-work. The
 * follow-up alone had decided "resume or start over", and a first run was anybody's to take.
 *
 * Now the CLI that first read a task takes every run after it, and a conversation that can be
 * resumed is resumed whatever the text box holds.
 */

let workdir: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'taskd-cli-pin-'))
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

/** Codex and Claude Code in one least-busy group, Claude listed first so it wins any tie. */
function frontier(db: Db, over: { codexResume?: string[]; path?: string; enabled?: boolean } = {}): {
  codex: string
  claude: string
  project: string
} {
  const claude = makeAgent(db, {
    name: 'Fable',
    command: 'claude',
    resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '{{prompt}}'],
    sortOrder: 0
  })
  const codex = makeAgent(db, {
    name: 'Codex',
    command: 'codex',
    resumeArgsTemplate: over.codexResume ?? ['exec', 'resume', '{{sessionId}}', '{{prompt}}'],
    sortOrder: 1
  })
  const group = repo.insertGroup(db, {
    name: 'Frontier Agents',
    description: '',
    strategy: 'least-busy',
    memberIds: [claude, codex],
    sortOrder: 0
  }).id
  const project = makeProject(db, {
    name: 'ztd-query-php',
    targetId: group,
    targetKind: 'group',
    maxConcurrent: 2,
    path: over.path,
    enabled: over.enabled
  })
  return { codex, claude, project }
}

describe('which CLI a task belongs to', () => {
  it('resumes the conversation with the prompt when the follow-up was discarded (the incident)', () => {
    const app = new QuuuApp(':memory:')
    // Disabled while operating: an operation wakes the scheduler, which would launch a real CLI
    const { codex, project } = frontier(app.db, { enabled: false })
    const task = makeTask(app.db, project, 'sql-semanticsの対応範囲の変更')
    const opened = sessioned(app.db, task, codex, 'failed', { pendingMessage: '続きをお願いします。' })
    const session = repo.getTask(app.db, task)!.sessionId

    // Discard the follow-up, rewrite the prompt, queue it again
    app.tasks.updateTask(task, { pendingMessage: '' })
    app.tasks.updateTask(task, { prompt: 'please continue' })
    app.tasks.enqueueTask(task)

    repo.updateProject(app.db, project, { enabled: true })
    const claim = app.scheduler.claimNext()
    expect(claim?.agentId).toBe(codex)
    expect(claim?.run.kind).toBe('followup')
    expect(claim?.run.sessionId).toBe(session)
    expect(claim?.run.promptPreview).toBe('please continue')
    expect(repo.getRun(app.db, opened)?.sessionId).toBe(session)
    app.shutdown()
  })

  it('waits for the CLI that read it rather than handing a first run to the free member of another CLI', () => {
    const db = memoryDb()
    const { codex, claude, project } = frontier(db)
    const task = makeTask(db, project, 't')
    sessioned(db, task, codex, 'queued')
    repo.setCooldown(db, codex, isoPlusSeconds(600), 'Limit')

    const s = scheduler(db)
    expect(s.claimNext()).toBeNull()
    expect(repo.countActiveRunsByAgent(db, claude)).toBe(0)

    repo.clearCooldown(db, codex)
    const claim = s.claimNext()
    expect(claim?.agentId).toBe(codex)
    expect(claim?.run.kind).toBe('followup')
  })

  it('does not let an explicit pick of another CLI move the task', () => {
    const db = memoryDb()
    const { codex, claude, project } = frontier(db)
    const task = makeTask(db, project, 't')
    sessioned(db, task, codex, 'queued')
    repo.patchTask(db, task, { agentOverrideId: claude })

    expect(scheduler(db).claimNext()?.agentId).toBe(codex)
  })

  it('starts over on the same CLI when the conversation cannot be read back, never on another', () => {
    const app = new QuuuApp(':memory:')
    // Codex without resume arguments: nothing can continue its sessions
    const { codex, claude, project } = frontier(app.db, { codexResume: [], path: workdir, enabled: false })
    const task = makeTask(app.db, project, 't')
    sessioned(app.db, task, codex, 'review')

    expect(app.tasks.send(task, '続き').ok).toBe(true)
    const after = repo.getTask(app.db, task)!
    // Folded into a new session ...
    expect(after.sessionId).toBeNull()
    expect(after.prompt).toBe('t\n\n続き')

    // ... that still opens on Codex, though Claude is listed first and just as free
    repo.updateProject(app.db, project, { enabled: true })
    const claim = app.scheduler.claimNext()
    expect(claim?.agentId).toBe(codex)
    expect(claim?.run.kind).toBe('initial')
    expect(repo.countActiveRunsByAgent(app.db, claude)).toBe(0)
    app.shutdown()
  })

  it('keeps the conversation and names the wait when no agent of its CLI could open a new one', () => {
    const app = new QuuuApp(':memory:')
    const { codex, project } = frontier(app.db, { codexResume: [], path: workdir, enabled: false })
    const task = makeTask(app.db, project, 't')
    sessioned(app.db, task, codex, 'review')
    const session = repo.getTask(app.db, task)!.sessionId
    repo.updateAgent(app.db, codex, { enabled: false })

    expect(app.tasks.send(task, '続き').ok).toBe(true)
    const after = repo.getTask(app.db, task)!
    expect(after.sessionId).toBe(session)
    expect(after.pendingMessage).toBe('続き')
    expect(after.status).toBe('queued')

    repo.updateProject(app.db, project, { enabled: true })
    expect(app.scheduler.claimNext()).toBeNull()
    expect(app.scheduler.status().warnings.join('\n')).toContain(
      'This task belongs to Codex, and no Codex agent can take it'
    )
    app.shutdown()
  })

  it('is settled by the first run the CLI accepted, not by one it turned away', () => {
    const db = memoryDb()
    const { codex, claude, project } = frontier(db)
    const task = makeTask(db, project, 't')
    const lineage = (): string => taskLineage(db, repo.getTask(db, task)!).command
    expect(lineage()).toBe('')

    const limited = occupy(db, task, claude)
    repo.updateRun(db, limited, { status: 'limited', errorKind: 'limit', endedAt: '2026-09-23T09:56:48.383Z' })
    repo.setTaskStatus(db, task, 'queued')
    expect(lineage()).toBe('')

    const read = occupy(db, task, codex)
    repo.updateRun(db, read, { status: 'failed', errorKind: 'nonzero-exit', endedAt: '2026-09-23T09:56:17.413Z' })
    repo.setTaskStatus(db, task, 'queued')
    expect(taskLineage(db, repo.getTask(db, task)!)).toEqual({ agentId: codex, command: 'codex' })
  })

  it('is kept by the run history after the session has been let go of', () => {
    const db = memoryDb()
    const { codex, project } = frontier(db)
    const task = makeTask(db, project, 't')
    sessioned(db, task, codex, 'review')
    repo.clearTaskSession(db, task)

    expect(taskLineage(db, repo.getTask(db, task)!).command).toBe('codex')
  })

  it('does not hold a lane on a fallback of another CLI', () => {
    const db = memoryDb()
    const claude = makeAgent(db, { name: 'Fable', command: 'claude' })
    const codex = makeAgent(db, { name: 'Codex', command: 'codex', fallbackAgentId: claude })
    const project = makeProject(db, { name: 'p', targetId: codex })
    const task = makeTask(db, project, 't')
    occupy(db, task, codex)

    expect(fallbackHolds(db).get(claude) ?? 0).toBe(0)
  })
})

describe('the launch itself', () => {
  it('refuses to start another CLI on a task that belongs to one', () => {
    const db = memoryDb()
    const { codex, claude, project } = frontier(db)
    const taskId = makeTask(db, project, 't')
    sessioned(db, taskId, codex, 'queued')
    const task = repo.getTask(db, taskId)!

    expect(() => new Runner(db).prepare({
      task,
      project: repo.getProject(db, project)!,
      agent: repo.getAgent(db, claude)!,
      groupId: null,
      kind: 'initial',
      fallbackFromRunId: null
    })).toThrow(/belongs to codex/)
    expect(repo.listRunsByTask(db, taskId)).toHaveLength(1)
  })

  it('does not retry a failed run on a fallback of another CLI', async () => {
    const db = memoryDb()
    const runner = new Runner(db)
    const s = new Scheduler(db, runner)
    const backup = makeAgent(db, { name: 'backup', command: '/bin/echo', argsTemplate: ['ok'] })
    const primary = makeAgent(db, {
      name: 'primary',
      command: '/bin/sh',
      argsTemplate: ['-c', 'exit 1'],
      fallbackAgentId: backup
    })
    const project = makeProject(db, { name: 'p', targetId: primary, path: workdir })
    const task = makeTask(db, project, 't')

    await new Promise<void>((resolve) => {
      runner.once('finished', () => setTimeout(resolve, 30))
      void s.tick()
    })

    // The failure asks for another agent, and the only other one runs another CLI: a human's call
    expect(repo.getTask(db, task)?.status).toBe('failed')
    expect(repo.listRunsByTask(db, task).map((r) => r.agentId)).toEqual([primary])
    s.stop()
    runner.shutdown()
  })
})

describe('what a human is told while the conversation waits', () => {
  it('names the agent it is waiting for when a continuation is held by its cooldown', async () => {
    const db = memoryDb()
    const { codex, project } = frontier(db)
    const task = makeTask(db, project, 't')
    sessioned(db, task, codex, 'failed', { pendingMessage: '続きをお願いします。' })
    repo.setCooldown(db, codex, isoPlusSeconds(600), 'Limit')

    const result = await scheduler(db).runNow(task)

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/^The Codex that opened this session is in Limit cooldown \(back at /)
  })
})
