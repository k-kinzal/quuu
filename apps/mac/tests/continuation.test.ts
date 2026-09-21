import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ToastPayload } from '../src/main/snapshot.js'
import * as repo from '../src/main/db/repo.js'
import { QuuuApp } from '../src/main/bootstrap.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { isoPlusSeconds } from '../src/main/util.js'
import { canContinueSession, canReadSession, sessionOwner } from '../src/main/execution/agentResolver.js'
import { attachSessionLog } from '../src/main/session/sessionAttach.js'
import { makeAgent, makeProject, makeTask, memoryDb, occupy, sessioned } from './helpers.js'

/**
 * A continuation (a follow-up) goes back to the very agent that opened that session.
 *
 * Crossing CLIs makes `claude --resume <a Codex session id>` a valid command line, and it
 * dies with "No conversation found with session ID" (it actually did).
 * A free slot alone never changes models. A cooldown may use the configured fallback chain,
 * provided the next definition can resume the same CLI's session.
 */

let workdir: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'taskd-continuation-'))
  process.env.QUUU_USER_DATA = workdir
})

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

function scheduler(db: ReturnType<typeof memoryDb>): Scheduler {
  return new Scheduler(db, new Runner(db))
}

/** A group holding Codex and Claude Code. The less occupied one is picked. */
function mixedGroup(
  db: ReturnType<typeof memoryDb>,
  over: { codexConcurrency?: number } = {}
): { codex: string; claude: string; project: string } {
  const codex = makeAgent(db, {
    name: 'Codex',
    command: 'codex',
    concurrency: over.codexConcurrency ?? 10,
    resumeArgsTemplate: ['resume', '{{sessionId}}'],
    sortOrder: 0
  })
  const claude = makeAgent(db, {
    name: 'Claude Code',
    command: 'claude',
    concurrency: 10,
    resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '{{prompt}}'],
    sortOrder: 1
  })
  const group = repo.insertGroup(db, {
    name: 'Frontier Agents',
    description: '',
    strategy: 'least-busy',
    memberIds: [codex, claude],
    sortOrder: 0
  }).id
  const project = makeProject(db, {
    name: 'demo-app',
    targetId: group,
    targetKind: 'group',
    maxConcurrent: 10
  })
  return { codex, claude, project }
}

/** Two definitions of the same CLI (claude) differing only in model. They are also each other's fallback. */
function opusSonnet(db: ReturnType<typeof memoryDb>): {
  opus: string
  sonnet: string
  project: string
} {
  const sonnet = makeAgent(db, {
    name: 'Claude Sonnet',
    command: '/opt/homebrew/bin/claude',
    concurrency: 2,
    resumeArgsTemplate: ['--resume', '{{sessionId}}'],
    sortOrder: 1
  })
  const opus = makeAgent(db, {
    name: 'Claude Opus',
    command: 'claude',
    concurrency: 1,
    fallbackAgentId: sonnet,
    resumeArgsTemplate: ['--resume', '{{sessionId}}'],
    sortOrder: 0
  })
  const group = repo.insertGroup(db, {
    name: 'Claude (Opus → Sonnet)',
    description: '',
    strategy: 'priority',
    memberIds: [opus, sonnet],
    sortOrder: 0
  }).id
  const project = makeProject(db, {
    name: 'p',
    targetId: group,
    targetKind: 'group',
    maxConcurrent: 10
  })
  return { opus, sonnet, project }
}

describe('who a continuation goes to', () => {
  it('hands it to the CLI that opened the session (never to another CLI with a free slot)', () => {
    const db = memoryDb()
    const { codex, claude, project } = mixedGroup(db)

    // A follow-up is queued on a session Codex opened
    const task = makeTask(db, project, 'ai-toolkit の導入')
    sessioned(db, task, codex, 'queued', { pendingMessage: '適用内容をください' })

    // From least-busy's point of view Codex is the fuller one (it is running another task)
    occupy(db, makeTask(db, project, '別の作業'), codex)

    const claim = scheduler(db).claimNext()
    expect(claim?.task.id).toBe(task)
    expect(claim?.agentId).toBe(codex)
    expect(claim?.agentId).not.toBe(claude)
  })

  it('waits rather than diverting to another CLI when the opening CLI is full', () => {
    const db = memoryDb()
    const { codex, project } = mixedGroup(db, { codexConcurrency: 1 })

    const task = makeTask(db, project, 'ai-toolkit の導入')
    sessioned(db, task, codex, 'queued', { pendingMessage: '適用内容をください' })
    occupy(db, makeTask(db, project, '別の作業'), codex)

    // Claude Code has a free slot, but it cannot read a Codex session
    expect(scheduler(db).claimNext()).toBeNull()
  })

  it('waits for a busy opener instead of changing models just for a free slot', () => {
    const db = memoryDb()
    const { opus, project } = opusSonnet(db)

    const task = makeTask(db, project, 't')
    sessioned(db, task, opus, 'queued', { pendingMessage: '続き' })
    // Fill Opus's slot. Sonnet is free, but Opus opened it, so it waits
    occupy(db, makeTask(db, project, '別の作業'), opus)

    expect(scheduler(db).claimNext()).toBeNull()
  })

  it('picks a free member of the group for a first run (only continuations are narrowed)', () => {
    const db = memoryDb()
    const { opus, sonnet, project } = opusSonnet(db)

    occupy(db, makeTask(db, project, '別の作業'), opus)
    const fresh = makeTask(db, project, 'はじめて走る')

    const claim = scheduler(db).claimNext()
    expect(claim?.task.id).toBe(fresh)
    expect(claim?.agentId).toBe(sonnet)
  })

  it('continues on the configured compatible fallback after a Limit stop', () => {
    const db = memoryDb()
    const { opus, sonnet, project } = opusSonnet(db)
    // The fallback need not also be a member of the project's group.
    repo.updateProject(db, project, { targetKind: 'agent', targetId: opus })
    const task = makeTask(db, project, 't')
    sessioned(db, task, opus, 'queued', { pendingMessage: '続き' })
    repo.setCooldown(db, opus, isoPlusSeconds(600), 'Limit')

    const sessionId = repo.getTask(db, task)!.sessionId
    const claim = scheduler(db).claimNext()
    expect(claim?.agentId).toBe(sonnet)
    expect(claim?.run.kind).toBe('followup')
    expect(claim?.run.sessionId).toBe(sessionId)
    expect(claim?.run.args).toContain(sessionId)
  })

  it('uses the configured fallback order instead of the group order', () => {
    const db = memoryDb()
    const { opus, sonnet, project } = opusSonnet(db)
    const last = makeAgent(db, { name: 'last', command: 'claude', resumeArgsTemplate: ['--resume', '{{sessionId}}'] })
    repo.updateAgent(db, sonnet, { fallbackAgentId: last })
    repo.updateGroup(db, repo.getProject(db, project)!.targetId!, { memberIds: [last, opus, sonnet] })
    const task = makeTask(db, project, 't')
    sessioned(db, task, opus, 'queued', { pendingMessage: 'continue' })
    repo.setCooldown(db, opus, isoPlusSeconds(600), 'Limit')

    expect(scheduler(db).claimNext()?.agentId).toBe(sonnet)
  })

  it.each(['incompatible CLI', 'missing resume arguments', 'unconfigured fallback'])(
    'waits out a Limit when the other agent has an %s', (reason) => {
      const db = memoryDb()
      const { opus, sonnet, project } = opusSonnet(db)
      if (reason === 'incompatible CLI') repo.updateAgent(db, sonnet, { command: 'codex' })
      if (reason === 'missing resume arguments') repo.updateAgent(db, sonnet, { resumeArgsTemplate: [] })
      if (reason === 'unconfigured fallback') repo.updateAgent(db, opus, { fallbackAgentId: null })
      const task = makeTask(db, project, 't')
      sessioned(db, task, opus, 'queued', { pendingMessage: 'continue' })
      repo.setCooldown(db, opus, isoPlusSeconds(600), 'Limit')

      expect(scheduler(db).claimNext()).toBeNull()
    }
  )

  it.each([false, true])('includes the task override fallback outside the project (continuation: %s)', (continuation) => {
    const db = memoryDb()
    const { opus, sonnet, project } = opusSonnet(db)
    const other = makeAgent(db, { name: 'other', command: 'codex' })
    repo.updateProject(db, project, { targetKind: 'agent', targetId: other })
    const task = makeTask(db, project, 't')
    if (continuation) sessioned(db, task, opus, 'queued', { pendingMessage: 'continue' })
    repo.patchTask(db, task, { agentOverrideId: opus })
    repo.setCooldown(db, opus, isoPlusSeconds(600), 'Limit')

    expect(scheduler(db).claimNext()?.agentId).toBe(sonnet)
  })

  it('hands it to the target a human chose for that task (as long as it is the same CLI)', () => {
    const db = memoryDb()
    const { opus, sonnet, project } = opusSonnet(db)
    const task = makeTask(db, project, 't')
    sessioned(db, task, opus, 'queued', { pendingMessage: '続き' })
    // "Sonnet for this one task" is the human's decision, not a switch made behind their back
    repo.patchTask(db, task, { agentOverrideId: sonnet })

    expect(scheduler(db).claimNext()?.agentId).toBe(sonnet)
  })

  it('refuses even a human choice that crosses CLIs and returns to the one that opened it', () => {
    const db = memoryDb()
    const { codex, claude, project } = mixedGroup(db)
    const task = makeTask(db, project, 't')
    sessioned(db, task, codex, 'queued', { pendingMessage: '続き' })
    // The choice means "fall back to normal resolution when no slot is free". A target that cannot read falls back the same way
    repo.patchTask(db, task, { agentOverrideId: claude })

    expect(scheduler(db).claimNext()?.agentId).toBe(codex)
  })

  it('does not hand it to an agent whose continuation argument is empty (the CLI would come up with no argument)', () => {
    const db = memoryDb()
    const codex = makeAgent(db, { name: 'Codex', command: 'codex', concurrency: 10 })
    const project = makeProject(db, { name: 'p', targetId: codex, maxConcurrent: 10 })

    const task = makeTask(db, project, 't')
    sessioned(db, task, codex, 'queued', { pendingMessage: '続き' })

    expect(scheduler(db).claimNext()).toBeNull()
  })

  it('names the target the continuation is waiting on in the stall reason', () => {
    const db = memoryDb()
    const codex = makeAgent(db, { name: 'Codex', command: 'codex', concurrency: 10 })
    const project = makeProject(db, { name: 'p', targetId: codex, maxConcurrent: 10 })
    const task = makeTask(db, project, 't')
    sessioned(db, task, codex, 'queued', { pendingMessage: '続き' })

    const s = scheduler(db)
    s.claimNext()
    const warnings = s.status().warnings.join('\n')
    expect(warnings).toContain('The Codex that opened this session is unavailable')
  })

  it('reports a stall that waiting will not clear even while other tasks are running', () => {
    const db = memoryDb()
    const codex = makeAgent(db, { name: 'Codex', command: 'codex', concurrency: 10 })
    const claude = makeAgent(db, {
      name: 'Claude Code',
      command: 'claude',
      concurrency: 10,
      resumeArgsTemplate: ['--resume', '{{sessionId}}']
    })
    const group = repo.insertGroup(db, {
      name: 'g',
      description: '',
      strategy: 'priority',
      memberIds: [codex, claude],
      sortOrder: 0
    }).id
    const project = makeProject(db, {
      name: 'p',
      targetId: group,
      targetKind: 'group',
      maxConcurrent: 10
    })
    const stuckTask = makeTask(db, project, '止まっている方')
    sessioned(db, stuckTask, codex, 'queued', { pendingMessage: '続き' })
    // Another task is running (it must still be reported when no slot is free)
    occupy(db, makeTask(db, project, '走っている方'), claude)

    const s = scheduler(db)
    s.claimNext()
    const warnings = s.status().warnings.join('\n')
    expect(warnings).toContain('止まっている方')
    expect(warnings).toContain('The Codex that opened this session is unavailable')
  })

  it('treats the Run that first opened the session as the owner, not the latest one that died on the wrong target', () => {
    const db = memoryDb()
    const { codex, claude, project } = mixedGroup(db)
    const task = makeTask(db, project, 't')
    const runId = sessioned(db, task, codex, 'queued', { pendingMessage: '続き' })
    const sessionId = repo.getRun(db, runId)!.sessionId

    // The state where a Run that tried to continue on another CLI and died is left behind
    repo.insertRun(db, {
      id: 'run_wrong',
      taskId: task,
      agentId: claude,
      resolvedFromGroupId: null,
      sessionId,
      kind: 'followup',
      status: 'failed',
      attempt: 2,
      fallbackFromRunId: null,
      pid: null,
      cwd: '/tmp',
      command: 'claude',
      args: ['--resume', sessionId],
      promptPreview: '',
      exitCode: 1,
      errorKind: 'nonzero-exit',
      errorMessage: `No conversation found with session ID: ${sessionId}`,
      sessionLogPath: null,
      stdoutLogPath: '/tmp/x.log'
    })

    // Treating the latest as the owner would make it try to continue on claude forever
    expect(sessionOwner(db, repo.getTask(db, task)!)).toEqual({
      agentId: codex,
      command: 'codex'
    })
  })
})

describe('continuing a CLI whose id comes from stdout (Codex)', () => {
  /** The header Codex prints on stdout to announce itself (as measured on codex-cli 0.149.0). */
  function codexStdout(sessionId: string): string {
    const path = join(workdir, `${sessionId}.log`)
    writeFileSync(
      path,
      [
        '# Quuu run run_x',
        'OpenAI Codex v0.149.0',
        '--------',
        'workdir: /tmp',
        `session id: ${sessionId}`,
        '--------',
        'user',
        ''
      ].join('\n')
    )
    return path
  }

  it('reconciles the id we assigned with the real one, then continues on that same agent', () => {
    const db = memoryDb()
    const codex = makeAgent(db, {
      name: 'Codex',
      command: 'codex',
      logAdapter: 'stdout',
      concurrency: 10,
      // An old definition, or one where the user chose stdout, can be continued too
      resumeArgsTemplate: ['exec', 'resume', '{{sessionId}}', '{{prompt}}']
    })
    const project = makeProject(db, { name: 'p', targetId: codex, maxConcurrent: 10 })
    const task = makeTask(db, project, 't')

    // A Run that finished still carrying the id Quuu assigned (which does not exist on the Codex side)
    const real = '01a03143-aa86-7442-9bfd-e362b34f4947'
    const runId = sessioned(db, task, codex, 'queued', {
      pendingMessage: '続き',
      stdoutLogPath: codexStdout(real)
    })
    expect(repo.getRun(db, runId)!.sessionId).not.toBe(real)

    // Once the conversation view or the periodic re-binding runs, it lines up with the real id
    expect(attachSessionLog(db, repo.getRun(db, runId)!).sessionId).toBe(real)
    expect(repo.getTask(db, task)?.sessionId).toBe(real)

    // The continuation goes to that same agent (Codex), with the real id
    const claim = scheduler(db).claimNext()
    expect(claim?.agentId).toBe(codex)
    expect(sessionOwner(db, repo.getTask(db, task)!).command).toBe('codex')
  })

  it('can continue a Codex session too as long as the continuation argument is filled in', () => {
    const db = memoryDb()
    const withResume = makeAgent(db, {
      name: 'Codex',
      command: 'codex',
      logAdapter: 'stdout',
      resumeArgsTemplate: ['exec', 'resume', '{{sessionId}}', '{{prompt}}']
    })
    const agent = repo.getAgent(db, withResume)!

    expect(canContinueSession(agent, { agentId: withResume, command: 'codex' })).toBe(true)
  })
})

describe('deciding whether a follow-up can be written', () => {
  it('lets the same CLI read it, but trusts only the agent that opened it', () => {
    const db = memoryDb()
    const id = makeAgent(db, {
      name: 'a',
      command: '/opt/homebrew/bin/claude',
      resumeArgsTemplate: ['--resume', '{{sessionId}}']
    })
    const agent = repo.getAgent(db, id)!

    expect(canContinueSession(agent, { agentId: id, command: 'claude' })).toBe(true)
    // Another definition of the same CLI can read it, but is never trusted with it automatically
    expect(canReadSession(agent, { agentId: 'agt_other', command: 'claude' })).toBe(true)
    expect(canContinueSession(agent, { agentId: 'agt_other', command: 'claude' })).toBe(false)
    // A different CLI cannot read it even while claiming to be that agent (the definition's command was changed later)
    expect(canReadSession(agent, { agentId: id, command: 'codex' })).toBe(false)
    // A session with no known owner cannot be continued by anyone
    expect(canReadSession(agent, { agentId: '', command: '' })).toBe(false)
  })

  it('refuses even the owning agent when the continuation argument is empty', () => {
    const db = memoryDb()
    const id = makeAgent(db, { name: 'Codex', command: 'codex' })
    const agent = repo.getAgent(db, id)!

    expect(canContinueSession(agent, { agentId: id, command: 'codex' })).toBe(false)
  })

  it('reports no owner for a task that holds no session', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const project = makeProject(db, { name: 'p', targetId: agent })
    const task = makeTask(db, project, 't')

    expect(sessionOwner(db, repo.getTask(db, task)!)).toEqual({ agentId: '', command: '' })
  })
})

describe('the entry point for sending', () => {
  it('starts a new session instead of a follow-up when nobody can continue', () => {
    const app = new QuuuApp(':memory:')
    const codex = makeAgent(app.db, { name: 'Codex', command: 'codex' })
    const claude = makeAgent(app.db, {
      name: 'Claude Code',
      command: 'claude',
      resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '{{prompt}}']
    })
    const group = repo.insertGroup(app.db, {
      name: 'g',
      description: '',
      strategy: 'least-busy',
      memberIds: [codex, claude],
      sortOrder: 0
    }).id
    // Do not let the scheduler pick it up; look only at what was written
    const project = makeProject(app.db, {
      name: 'p',
      targetId: group,
      targetKind: 'group',
      path: workdir,
      enabled: false
    })
    const task = makeTask(app.db, project, 't')
    sessioned(app.db, task, codex, 'review')
    const toasts: ToastPayload[] = []
    app.on('notify', (t: ToastPayload) => toasts.push(t))

    const result = app.tasks.send(task, '適用内容をください')

    expect(result.ok).toBe(true)
    const after = repo.getTask(app.db, task)!
    // Let go of the continuation target and fold what was written into the prompt (never discard it)
    expect(after.sessionId).toBeNull()
    expect(after.pendingMessage).toBe('')
    expect(after.prompt).toBe('t\n\n適用内容をください')
    expect(after.status).toBe('queued')
    // Never swap the conversation out silently
    expect(toasts.map((t) => t.detail).join('\n')).toContain(
      'The Codex that opened this session is unavailable'
    )
    app.shutdown()
  })

  it('carries an unsent follow-up into the prompt when folding', () => {
    const app = new QuuuApp(':memory:')
    const codex = makeAgent(app.db, { name: 'Codex', command: 'codex' })
    const project = makeProject(app.db, {
      name: 'p',
      targetId: codex,
      path: workdir,
      enabled: false
    })
    const task = makeTask(app.db, project, 't')
    sessioned(app.db, task, codex, 'failed')
    repo.setPendingMessage(app.db, task, '前に書いた分')

    expect(app.tasks.send(task, 'いま書いた分').ok).toBe(true)
    expect(repo.getTask(app.db, task)?.prompt).toBe('t\n\n前に書いた分\n\nいま書いた分')
    app.shutdown()
  })

  it('can re-run a failed task with "run now"', async () => {
    const app = new QuuuApp(':memory:')
    const codex = makeAgent(app.db, { name: 'Codex', command: 'codex' })
    const project = makeProject(app.db, { name: 'p', targetId: codex, path: workdir })
    const task = makeTask(app.db, project, 't')
    sessioned(app.db, task, codex, 'failed')
    repo.setPendingMessage(app.db, task, '適用内容をください')
    const dead = repo.getTask(app.db, task)!.sessionId

    const result = await app.tasks.runNow(task)

    expect(result).toEqual({ ok: true })
    const after = repo.getTask(app.db, task)!
    expect(after.status).toBe('running')
    // It runs on a fresh session, not the one that could not be continued
    expect(after.sessionId).not.toBe(dead)
    const latest = repo.listRunsByTask(app.db, task)[0]
    expect(latest.kind).toBe('initial')
    expect(latest.promptPreview).toBe('t\n\n適用内容をください')
    app.shutdown()
  })

  it('turns a send-back into a new session too when the session cannot be continued', () => {
    const app = new QuuuApp(':memory:')
    const codex = makeAgent(app.db, { name: 'Codex', command: 'codex' })
    const project = makeProject(app.db, {
      name: 'p',
      targetId: codex,
      path: workdir,
      enabled: false
    })
    const task = makeTask(app.db, project, 't')
    sessioned(app.db, task, codex, 'review')

    app.tasks.sendBack(task, 'ここを直して')

    const after = repo.getTask(app.db, task)!
    expect(after.sessionId).toBeNull()
    expect(after.pendingMessage).toBe('')
    expect(after.prompt).toBe('t\n\nここを直して')
    app.shutdown()
  })

  it('does not take the message even while running when no CLI can continue', () => {
    const app = new QuuuApp(':memory:')
    const codex = makeAgent(app.db, { name: 'Codex', command: 'codex' })
    const project = makeProject(app.db, { name: 'p', targetId: codex, path: workdir })
    const task = makeTask(app.db, project, 't')
    occupy(app.db, task, codex)

    const result = app.tasks.send(task, 'あとで送りたい')

    expect(result.ok).toBe(false)
    expect(result.reason).toBe('The Codex that opened this session is unavailable')
    expect(repo.getTask(app.db, task)?.reservedMessage).toBe('')
    app.shutdown()
  })

  it('can send when the agent that opened it is among the candidates', () => {
    const app = new QuuuApp(':memory:')
    const opus = makeAgent(app.db, {
      name: 'Claude Opus',
      command: 'claude',
      resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '{{prompt}}']
    })
    const sonnet = makeAgent(app.db, {
      name: 'Claude Sonnet',
      command: 'claude',
      resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '{{prompt}}']
    })
    const group = repo.insertGroup(app.db, {
      name: 'g',
      description: '',
      strategy: 'priority',
      memberIds: [opus, sonnet],
      sortOrder: 0
    }).id
    // Do not let the scheduler pick it up; look only at what was written
    const project = makeProject(app.db, {
      name: 'p',
      targetId: group,
      targetKind: 'group',
      path: workdir,
      enabled: false
    })
    const task = makeTask(app.db, project, 't')
    sessioned(app.db, task, opus, 'review')

    expect(app.tasks.send(task, '続き').ok).toBe(true)
    expect(repo.getTask(app.db, task)?.pendingMessage).toBe('続き')
    app.shutdown()
  })

  it('does not make it a follow-up when the opening agent is disabled, even if another definition of the same CLI exists', () => {
    const app = new QuuuApp(':memory:')
    const opus = makeAgent(app.db, {
      name: 'Claude Opus',
      command: 'claude',
      resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '{{prompt}}']
    })
    const sonnet = makeAgent(app.db, {
      name: 'Claude Sonnet',
      command: 'claude',
      resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '{{prompt}}']
    })
    const group = repo.insertGroup(app.db, {
      name: 'g',
      description: '',
      strategy: 'priority',
      memberIds: [opus, sonnet],
      sortOrder: 0
    }).id
    const project = makeProject(app.db, {
      name: 'p',
      targetId: group,
      targetKind: 'group',
      path: workdir,
      enabled: false
    })
    const task = makeTask(app.db, project, 't')
    sessioned(app.db, task, opus, 'review')
    repo.updateAgent(app.db, opus, { enabled: false })
    const toasts: ToastPayload[] = []
    app.on('notify', (t: ToastPayload) => toasts.push(t))

    expect(app.tasks.send(task, '続き').ok).toBe(true)
    expect(repo.getTask(app.db, task)?.sessionId).toBeNull()
    expect(toasts.map((t) => t.detail).join('\n')).toContain(
      'The Claude Opus that opened this session is unavailable'
    )
    app.shutdown()
  })
})
