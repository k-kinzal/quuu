import { sessionOptions } from '../src/main/agents/sessionOptions.js'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppSnapshot } from '../src/main/snapshot.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { Db } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { SessionImporter } from '../src/main/import/importer.js'
import { resetLivenessMemo } from '../src/main/import/liveness.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { CodexSessionParser } from '../src/main/agent-adapters/codex/parser.js'
import { targetLabel, taskTargetKey, taskTargetLabel } from '../src/renderer/src/model/derive.js'
import { isolateSessionDirs, makeAgent, memoryDb, releaseSessionDirs } from './helpers.js'

let root: string
let claudeDir: string
let codexDir: string
let claudePidDir: string
let codexLockDir: string
let work: string

const line = (o: unknown): string => `${JSON.stringify(o)}\n`

/** The shape the view receives. The run-target display is read from here, so pass the DB contents through unchanged. */
function snapshot(db: Db): AppSnapshot {
  return {
    ...sessionOptions(repo.listTasks(db), [], repo.listAgents(db)),
    projects: repo.listProjects(db),
    tasks: repo.listTasks(db),
    rules: [],
    agents: repo.listAgents(db),
    groups: repo.listGroups(db),
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

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'taskd-import-'))
  const dirs = isolateSessionDirs(root)
  claudeDir = dirs.claude
  codexDir = dirs.codex
  claudePidDir = dirs.claudePids
  codexLockDir = dirs.codexLocks
  work = join(root, 'work')
  mkdirSync(work, { recursive: true })
  resetLivenessMemo()
})

afterEach(() => {
  releaseSessionDirs()
  rmSync(root, { recursive: true, force: true })
})

/** The pid file Claude Code writes only while it is running. */
function writeClaudePid(sessionId: string, pid = process.pid): string {
  mkdirSync(claudePidDir, { recursive: true })
  const path = join(claudePidDir, `${pid}.json`)
  writeFileSync(path, JSON.stringify({ pid, sessionId, cwd: work }))
  return path
}

/** The lock file Codex writes only while it is running. */
function writeCodexLock(sessionId: string): string {
  mkdirSync(codexLockDir, { recursive: true })
  const path = join(codexLockDir, `${sessionId}.lock`)
  writeFileSync(path, '')
  return path
}

/** Have a separate process hold the same BSD exclusive lock the real Codex takes. */
function holdCodexLock(path: string): ChildProcess {
  const holder = spawn('/usr/bin/lockf', ['-k', '-n', '-s', path, '/bin/sleep', '30'], {
    stdio: 'ignore'
  })
  for (let i = 0; i < 100; i += 1) {
    const check = spawnSync(
      '/usr/bin/lockf',
      ['-k', '-n', '-s', '-t', '0', path, '/usr/bin/true'],
      { stdio: 'ignore' }
    )
    if (check.status === 75) return holder
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
  holder.kill()
  throw new Error('could not take the Codex lock for the test')
}

function waitUntilCodexLockReleased(path: string): void {
  for (let i = 0; i < 100; i += 1) {
    const check = spawnSync(
      '/usr/bin/lockf',
      ['-k', '-n', '-s', '-t', '0', path, '/usr/bin/true'],
      { stdio: 'ignore' }
    )
    if (check.status === 0) return
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
  throw new Error('the Codex lock for the test was never released')
}

function writeClaude(
  sessionId: string,
  title: string,
  ageMs: number,
  /** `entrypoint` is who started it (cli = typed by a human / sdk-* = started by a program). */
  over: { entrypoint?: string; startedAt?: string } = {}
): string {
  const dir = join(claudeDir, '-work')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${sessionId}.jsonl`)
  writeFileSync(
    path,
    [
      line({
        type: 'user',
        uuid: 'u1',
        sessionId,
        cwd: work,
        timestamp: over.startedAt ?? new Date(Date.now() - ageMs - 1000).toISOString(),
        ...(over.entrypoint ? { entrypoint: over.entrypoint } : {}),
        message: { role: 'user', content: title }
      }),
      line({ type: 'ai-title', sessionId, aiTitle: title })
    ].join('')
  )
  const when = new Date(Date.now() - ageMs)
  utimesSync(path, when, when)
  return path
}

function writeCodex(
  sessionId: string,
  title: string,
  ageMs: number,
  /** `originator` is who started it (codex-tui and friends = human / codex_exec = program). */
  over: { originator?: string } = {}
): string {
  const dir = join(codexDir, '2026', '08', '16')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `rollout-${sessionId}.jsonl`)
  writeFileSync(
    path,
    [
      line({
        type: 'session_meta',
        payload: {
          session_id: sessionId,
          cwd: work,
          timestamp: new Date().toISOString(),
          ...(over.originator ? { originator: over.originator } : {})
        }
      }),
      line({
        type: 'response_item',
        payload: { type: 'message', role: 'developer', content: [{ text: '# AGENTS.md 前置き' }] }
      }),
      line({
        type: 'response_item',
        payload: { type: 'message', role: 'user', content: [{ text: title }] }
      })
    ].join('')
  )
  const when = new Date(Date.now() - ageMs)
  utimesSync(path, when, when)
  return path
}

const settings = { ...DEFAULT_SETTINGS, importHistoryDays: 30 }

describe('importing external sessions', () => {
  it('imports Claude and Codex sessions as tasks', () => {
    const db = memoryDb()
    writeClaude('11111111-1111-1111-1111-111111111111', 'クロードの作業', 60 * 60 * 1000)
    writeCodex('22222222-2222-2222-2222-222222222222', 'コーデックスの作業', 60 * 60 * 1000)

    const result = new SessionImporter(db).sync(settings)
    expect(result.createdTasks).toBe(2)
    expect(result.createdProjects).toBe(1)

    const tasks = repo.listTasks(db)
    expect(tasks.map((t) => t.title).sort()).toEqual(['クロードの作業', 'コーデックスの作業'])
    // Anything not moving comes in as done
    expect(tasks.every((t) => t.status === 'done')).toBe(true)
    expect(tasks.every((t) => t.source === 'imported')).toBe(true)
  })

  it('brings in a session written recently as running', () => {
    const db = memoryDb()
    writeClaude('33333333-3333-3333-3333-333333333333', 'いま動いている', 5 * 1000)

    const result = new SessionImporter(db).sync(settings)
    expect(result.running).toBe(1)
    expect(repo.listTasks(db)[0].status).toBe('running')
  })

  it('never duplicates no matter how often it syncs (idempotent)', () => {
    const db = memoryDb()
    writeClaude('44444444-4444-4444-4444-444444444444', '重複しないこと', 60 * 60 * 1000)

    const importer = new SessionImporter(db)
    importer.sync(settings)
    importer.sync(settings)
    importer.sync(settings)

    expect(repo.listTasks(db)).toHaveLength(1)
    expect(repo.listProjects(db)).toHaveLength(1)
  })

  /*
   * How a deleted project is handled.
   *
   * The only memory the importer has of "already imported" is runs.external_key, so
   * deleting the row erased that memory too: the same log was picked up as un-imported and always came back.
   * Soft-delete keeps the row, and only sessions that started after the deletion time are picked up.
   */
  it('does not come back from a log written before the deletion', () => {
    const db = memoryDb()
    writeClaude('a1a1a1a1-1111-1111-1111-111111111111', '消す前の作業', 60 * 60 * 1000)

    const importer = new SessionImporter(db)
    importer.sync(settings)
    const project = repo.listProjects(db)[0]

    repo.deleteProject(db, project.id)
    importer.sync(settings)
    importer.sync(settings)

    expect(repo.listProjects(db)).toHaveLength(0)
    expect(repo.listTasks(db)).toHaveLength(0)
  })

  it('brings the same project back when a session started after the deletion arrives', () => {
    const db = memoryDb()
    writeClaude('a2a2a2a2-2222-2222-2222-222222222222', '消す前の作業', 60 * 60 * 1000)

    const importer = new SessionImporter(db)
    importer.sync(settings)
    const before = repo.listProjects(db)[0]
    repo.deleteProject(db, before.id)

    writeClaude('a3a3a3a3-3333-3333-3333-333333333333', '消したあとに始めた作業', 1000, {
      startedAt: new Date(Date.now() + 1000).toISOString()
    })
    const result = importer.sync(settings)

    const revived = repo.listProjects(db)
    expect(revived).toHaveLength(1)
    // No new row is made. The name, color, and settings from before the deletion come back
    expect(revived[0].id).toBe(before.id)
    expect(result.createdTasks).toBe(1)

    // Only the project comes back. The deleted history does not
    const tasks = repo.listTasks(db)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('消したあとに始めた作業')
  })

  it('still does not import pre-deletion sessions after the project comes back', () => {
    const db = memoryDb()
    writeClaude('a4a4a4a4-4444-4444-4444-444444444444', '消す前の作業', 60 * 60 * 1000)

    const importer = new SessionImporter(db)
    importer.sync(settings)
    repo.deleteProject(db, repo.listProjects(db)[0].id)

    writeClaude('a5a5a5a5-5555-5555-5555-555555555555', '消したあとに始めた作業', 1000, {
      startedAt: new Date(Date.now() + 1000).toISOString()
    })
    importer.sync(settings)
    // However many times it runs after the return, it never digs up the pre-deletion log
    importer.sync(settings)

    expect(repo.listTasks(db)).toHaveLength(1)
  })

  /*
   * How sub-agents are handled.
   *
   * A run launched through the Agent SDK by a skill or another agent is not "work that person did",
   * so it is not listed as a task. Measured: 237 of 297 sessions were these.
   */
  it('does not import a session started by a program (a sub-agent)', () => {
    const db = memoryDb()
    writeClaude('b1b1b1b1-1111-1111-1111-111111111111', 'スキルが呼んだ claude', 60 * 60 * 1000, {
      entrypoint: 'sdk-cli'
    })

    const result = new SessionImporter(db).sync(settings)

    expect(result.createdTasks).toBe(0)
    expect(result.createdProjects).toBe(0)
    expect(result.skipped).toBe(1)
    expect(repo.listProjects(db)).toHaveLength(0)
  })

  /** A task in the working directory, standing in for one a report was written about. */
  function reportedTask(db: Db): { id: string; title: string } {
    const agent = makeAgent(db, { name: 'Reporter' })
    const project = repo.insertProject(db, {
      name: 'Quuu', path: work, color: '#fff', priority: 2, targetKind: 'agent',
      targetId: agent, maxConcurrent: 1, enabled: true, sortOrder: 0
    })
    return repo.insertTask(db, { projectId: project.id, title: '色を直す', status: 'review' })
  }

  /** Quuu launches the generator a moment before the CLI opens its session, and bounds the window. */
  const before = (iso: string): string => new Date(Date.parse(iso) - 1000).toISOString()
  const after = (iso: string): string => new Date(Date.parse(iso) + 20 * 60 * 1000).toISOString()

  /*
   * A report being written is an agent too.
   *
   * It runs the same CLI in the same directory and leaves the same trace, so without knowing it
   * was ours, import lists it as work somebody did — a task appearing out of nowhere, and
   * confusingly, while other work is running. That actually happened.
   */
  it('does not import the session a report generator left behind', () => {
    const db = memoryDb()
    const startedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    writeClaude('d1d1d1d1-1111-1111-1111-111111111111', 'レポートを書いていた', 60 * 60 * 1000, {
      startedAt
    })
    const task = reportedTask(db)
    repo.openReportSession(db, work, before(startedAt), after(startedAt))

    const result = new SessionImporter(db).sync(settings)

    expect(result.createdTasks).toBe(0)
    expect(repo.listTasks(db).map((t) => t.title)).toEqual([task.title])
  })

  /*
   * Writing the report again must not hand the previous one to import.
   *
   * A task's report row is replaced every time a report is written, so a window read off it stops
   * covering the generation before. What followed was a task - and, when the report had run in a
   * worktree, a project named after it - appearing seconds after a report was regenerated, which
   * is exactly what it looked like from outside: Quuu filing its own reporter as work somebody did.
   */
  it('still does not import it after the report is written again', () => {
    const db = memoryDb()
    const first = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    writeClaude('d2d2d2d2-2222-2222-2222-222222222222', '前のレポート', 60 * 60 * 1000, {
      startedAt: first
    })
    const task = reportedTask(db)
    repo.openReportSession(db, work, before(first), after(first))
    repo.closeReportSession(db, work, before(first), after(first))

    // The same task reaches review again and a second generation starts, replacing its report row
    const second = new Date().toISOString()
    repo.saveTaskReport(db, {
      taskId: task.id, status: 'generating', revision: '', path: '', logPath: '', error: '',
      cwd: work, pid: null, pending: '', exitPath: '', startedAt: second, endedAt: null
    })
    repo.openReportSession(db, work, second, after(second))

    const result = new SessionImporter(db).sync(settings)

    expect(result.createdTasks).toBe(0)
    expect(repo.listProjects(db)).toHaveLength(1)
    expect(repo.listTasks(db).map((t) => t.title)).toEqual([task.title])
  })

  /*
   * Deleting the task must not hand its reports to import either.
   *
   * The report row goes with the task (ON DELETE CASCADE); what the generator left in the session
   * directory does not.
   */
  it('still does not import it after the task it described is deleted', () => {
    const db = memoryDb()
    const startedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    writeClaude('d3d3d3d3-3333-3333-3333-333333333333', '消されたタスクのレポート', 60 * 60 * 1000, {
      startedAt
    })
    const task = reportedTask(db)
    repo.openReportSession(db, work, before(startedAt), after(startedAt))
    repo.deleteTask(db, task.id)

    const result = new SessionImporter(db).sync(settings)

    expect(result.createdTasks).toBe(0)
    expect(repo.listTasks(db)).toHaveLength(0)
  })

  it('does not import codex exec either (a run driven from a program)', () => {
    const db = memoryDb()
    writeCodex('c1c1c1c1-1111-1111-1111-111111111111', 'スクリプトが回した codex', 60 * 60 * 1000, {
      originator: 'codex_exec'
    })

    const result = new SessionImporter(db).sync(settings)

    expect(result.createdTasks).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('imports codex used interactively (codex-tui)', () => {
    const db = memoryDb()
    writeCodex('c2c2c2c2-2222-2222-2222-222222222222', '自分で打った codex', 60 * 60 * 1000, {
      originator: 'codex-tui'
    })

    const result = new SessionImporter(db).sync(settings)

    expect(result.createdTasks).toBe(1)
    expect(result.skipped).toBe(0)
  })

  it('imports a session a human typed (cli)', () => {
    const db = memoryDb()
    writeClaude('b2b2b2b2-2222-2222-2222-222222222222', '自分で打った作業', 60 * 60 * 1000, {
      entrypoint: 'cli'
    })

    const result = new SessionImporter(db).sync(settings)

    expect(result.createdTasks).toBe(1)
    expect(result.skipped).toBe(0)
  })

  it('falls to done on the next sync once it stops moving', () => {
    const db = memoryDb()
    const path = writeClaude('55555555-5555-5555-5555-555555555555', '止まる作業', 1000)

    const importer = new SessionImporter(db)
    importer.sync(settings)
    expect(repo.listTasks(db)[0].status).toBe('running')

    const old = new Date(Date.now() - 60 * 60 * 1000)
    utimesSync(path, old, old)
    importer.sync(settings)

    const task = repo.listTasks(db)[0]
    expect(task.status).toBe('done')
    expect(task.doneAt).not.toBeNull()
  })

  it('does not overwrite a state a human touched', () => {
    const db = memoryDb()
    const path = writeClaude('66666666-6666-6666-6666-666666666666', '人間が触る', 1000)

    const importer = new SessionImporter(db)
    importer.sync(settings)
    const id = repo.listTasks(db)[0].id
    repo.setTaskStatus(db, id, 'review')

    const old = new Date(Date.now() - 60 * 60 * 1000)
    utimesSync(path, old, old)
    importer.sync(settings)

    expect(repo.getTask(db, id)?.status).toBe('review')
  })

  it('does not import a session Quuu itself started', () => {
    const db = memoryDb()
    const sessionId = '77777777-7777-7777-7777-777777777777'
    writeClaude(sessionId, '自前の実行', 60 * 60 * 1000)

    const agent = repo.insertAgent(db, {
      name: 'a',
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
      enabled: true,
      sortOrder: 0
    })
    const project = repo.insertProject(db, {
      name: 'work',
      path: work,
      color: '#fff',
      priority: 2,
      targetKind: 'agent',
      targetId: agent.id,
      maxConcurrent: 1,
      enabled: true,
      sortOrder: 0
    })
    const task = repo.insertTask(db, { projectId: project.id, title: '自前', status: 'draft' })
    repo.insertRun(db, {
      id: 'run_own',
      taskId: task.id,
      agentId: agent.id,
      resolvedFromGroupId: null,
      sessionId,
      kind: 'initial',
      status: 'succeeded',
      attempt: 1,
      fallbackFromRunId: null,
      pid: null,
      cwd: work,
      command: 'claude',
      args: [],
      promptPreview: '',
      exitCode: 0,
      errorKind: null,
      errorMessage: '',
      sessionLogPath: null,
      stdoutLogPath: '/tmp/x.log'
    })

    new SessionImporter(db).sync(settings)
    expect(repo.listTasks(db)).toHaveLength(1)
  })

  it('assigns no run target to an imported project (never runs it unasked)', () => {
    const db = memoryDb()
    writeClaude('88888888-8888-8888-8888-888888888888', '安全確認', 60 * 60 * 1000)
    new SessionImporter(db).sync(settings)

    const project = repo.listProjects(db)[0]
    expect(project.source).toBe('imported')
    expect(project.targetId).toBeNull()

    // The import agent is always disabled
    expect(repo.listAgents(db).every((a) => !a.enabled)).toBe(true)
    // Mark it as Quuu's own (the grounds for keeping it out of settings)
    expect(repo.listAgents(db).every((a) => a.source === 'imported')).toBe(true)
  })

  it('shows the CLI that ran it in the run-target column, not the assignment', () => {
    /*
     * A project created by import has an empty run target (so the scheduler never launches it).
     * Showing that as-is listed both externally run Codex and Claude as "unassigned",
     * and what had actually run them became unreadable.
     */
    const db = memoryDb()
    writeClaude('99999999-1111-1111-1111-111111111111', 'クロードの作業', 60 * 60 * 1000)
    writeCodex('01999999-2222-2222-2222-222222222222', 'コデックスの作業', 60 * 60 * 1000)
    new SessionImporter(db).sync(settings)

    const project = repo.listProjects(db)[0]
    expect(targetLabel(snapshot(db), project)).toBe('Unassigned')

    const byTitle = new Map(repo.listTasks(db).map((t) => [t.title, t]))
    const labelOf = (title: string): string =>
      taskTargetLabel(snapshot(db), byTitle.get(title)!, project)
    expect(labelOf('クロードの作業')).toBe('Claude Code (external)')
    expect(labelOf('コデックスの作業')).toBe('Codex (external)')

    // Use the same words as the name shown in the run history (column and history never diverge)
    const run = repo.listRunsByTask(db, byTitle.get('コデックスの作業')!.id)[0]
    expect(repo.getAgent(db, run.agentId)?.name).toBe('Codex (external)')

    // Filtering groups by CLI
    expect(taskTargetKey(byTitle.get('コデックスの作業')!, project)).toBe('external:codex')
    expect(taskTargetKey(byTitle.get('クロードの作業')!, project)).toBe('external:claude')
  })

  it('does not grab a user definition of the same name as the import agent', () => {
    const db = memoryDb()
    // A user definition sharing only the name. It is a different thing, so import must not use it
    const decoy = makeAgent(db, { name: 'Claude Code (external)', enabled: true })

    writeClaude('77777777-7777-7777-7777-777777777777', '同名', 60 * 60 * 1000)
    new SessionImporter(db).sync(settings)

    const run = repo.listRunsByTask(db, repo.listTasks(db)[0].id)[0]
    expect(run.agentId).not.toBe(decoy)
    expect(repo.getAgent(db, run.agentId)?.source).toBe('imported')
    // The user's own definition is not dragged into the import
    expect(repo.getAgent(db, decoy)?.source).toBe('user')
  })

  it('re-imports a title that gets assigned later', () => {
    const db = memoryDb()
    const sessionId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const dir = join(claudeDir, '-work')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, `${sessionId}.jsonl`)
    // Right after start: only cwd and sessionId exist
    writeFileSync(path, line({ type: 'user', uuid: 'u', sessionId, cwd: work, message: {} }))

    const importer = new SessionImporter(db)
    importer.sync(settings)
    expect(repo.listTasks(db)[0].title).toMatch(/^claude session /)

    // The title has been assigned
    writeFileSync(
      path,
      line({ type: 'user', uuid: 'u', sessionId, cwd: work, message: {} }) +
      line({ type: 'ai-title', sessionId, aiTitle: '後から付いた名前' })
    )
    importer.sync(settings)
    expect(repo.listTasks(db)[0].title).toBe('後から付いた名前')
  })

  /*
   * Databases written before this repository moved to English hold placeholder titles
   * with the Japanese word. Stop recognizing those and the tasks look renamed by hand,
   * so import silently stops replacing their titles once the CLI assigns a real one.
   */
  it('still treats a placeholder title stored by an older build as unrenamed', () => {
    const db = memoryDb()
    const sessionId = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    const dir = join(claudeDir, '-work')
    mkdirSync(dir, { recursive: true })
    const path = join(dir, `${sessionId}.jsonl`)
    writeFileSync(path, line({ type: 'user', uuid: 'u', sessionId, cwd: work, message: {} }))

    const importer = new SessionImporter(db)
    importer.sync(settings)

    // Put the row back the way an older build would have written it
    const task = repo.listTasks(db)[0]
    repo.patchTask(db, task.id, { title: `claude セッション ${sessionId.slice(0, 8)}` })

    writeFileSync(
      path,
      line({ type: 'user', uuid: 'u', sessionId, cwd: work, message: {} }) +
      line({ type: 'ai-title', sessionId, aiTitle: 'the name assigned afterwards' })
    )
    importer.sync(settings)

    expect(repo.listTasks(db)[0].title).toBe('the name assigned afterwards')
  })

  it('does not fail an imported session during startup reconciliation', () => {
    const db = memoryDb()
    writeClaude('cccccccc-cccc-cccc-cccc-cccccccccccc', '動いている取り込み', 1000)
    new SessionImporter(db).sync(settings)
    expect(repo.listTasks(db)[0].status).toBe('running')

    // An imported Run is not a Quuu child process, so it is never treated as a ghost
    new Scheduler(db, new Runner(db)).reconcile()

    expect(repo.listTasks(db)[0].status).toBe('running')
    expect(repo.listRunsByTask(db, repo.listTasks(db)[0].id)[0].status).toBe('running')
  })

  it('repairs an import that was wrongly failed on the next sync', () => {
    const db = memoryDb()
    const path = writeClaude('dddddddd-dddd-dddd-dddd-dddddddddddd', '直る', 1000)
    const importer = new SessionImporter(db)
    importer.sync(settings)

    const taskId = repo.listTasks(db)[0].id
    const runId = repo.listRunsByTask(db, taskId)[0].id
    repo.updateRun(db, runId, { status: 'failed', errorKind: 'orphaned', errorMessage: 'x' })
    repo.setTaskStatus(db, taskId, 'failed')

    const old = new Date(Date.now() - 60 * 60 * 1000)
    utimesSync(path, old, old)
    importer.sync(settings)

    expect(repo.getTask(db, taskId)?.status).toBe('done')
    expect(repo.getRun(db, runId)?.errorKind).toBeNull()
  })

  it('realigns on the next sync even when the Run and task states disagree', () => {
    const db = memoryDb()
    writeClaude('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'ちぐはぐ', 1000)
    const importer = new SessionImporter(db)
    importer.sync(settings)

    const taskId = repo.listTasks(db)[0].id
    const runId = repo.listRunsByTask(db, taskId)[0].id
    // Build the state where the Run is still running but only the task was failed
    repo.updateRun(db, runId, { status: 'running', errorKind: 'orphaned' })
    repo.setTaskStatus(db, taskId, 'failed')

    importer.sync(settings)

    expect(repo.getTask(db, taskId)?.status).toBe('running')
    expect(repo.getRun(db, runId)?.errorKind).toBeNull()
  })

  it('does nothing when import is disabled', () => {
    const db = memoryDb()
    writeClaude('99999999-9999-9999-9999-999999999999', '無効', 60 * 60 * 1000)
    new SessionImporter(db).sync({ ...settings, importExternalSessions: false })
    expect(repo.listTasks(db)).toHaveLength(0)
  })

  it('does not import a log older than the window', () => {
    const db = memoryDb()
    writeClaude('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '古い', 40 * 24 * 60 * 60 * 1000)
    new SessionImporter(db).sync({ ...settings, importHistoryDays: 7 })
    expect(repo.listTasks(db)).toHaveLength(0)
  })
})

describe('liveness checks for running sessions', () => {
  const sid = 'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0'

  it('becomes done after the grace period alone once the process is gone', () => {
    const db = memoryDb()
    writeClaude(sid, '動いている', 1000)
    const pidPath = writeClaudePid(sid)

    const importer = new SessionImporter(db)
    importer.sync(settings)
    expect(repo.listTasks(db)[0].status).toBe('running')

    // The CLI exited. The log's mtime is still fresh.
    rmSync(pidPath)
    // Inside the grace period it still waits
    expect(importer.refreshRunning(Date.now() + 5_000)).toBe(0)
    expect(repo.listTasks(db)[0].status).toBe('running')

    // Settles without waiting out the mtime window (3 minutes)
    expect(importer.refreshRunning(Date.now() + 20_000)).toBe(1)
    const task = repo.listTasks(db)[0]
    expect(task.status).toBe('done')
    expect(task.doneAt).not.toBeNull()
    expect(repo.listRunsByTask(db, task.id)[0].status).toBe('succeeded')
  })

  it('re-queues as a continuation instead of done when a reserved message was written', () => {
    const db = memoryDb()
    writeClaude(sid, '動いている', 1000)
    const pidPath = writeClaudePid(sid)

    const importer = new SessionImporter(db)
    importer.sync(settings)
    const taskId = repo.listTasks(db)[0].id
    // A follow-up was written while it ran (reserved send)
    repo.setReservedMessage(db, taskId, 'ついでにこれも')

    rmSync(pidPath)
    expect(importer.refreshRunning(Date.now() + 20_000)).toBe(1)

    const task = repo.getTask(db, taskId)!
    expect(task.status).toBe('queued')
    expect(task.pendingMessage).toBe('ついでにこれも')
    expect(task.reservedMessage).toBe('')
    expect(task.doneAt).toBeNull()
  })

  it('stays running through silence while alive (a long tool run does not finish it)', () => {
    const db = memoryDb()
    writeClaude(sid, '1 時間無言のビルド中', 60 * 60 * 1000)
    writeClaudePid(sid)

    const importer = new SessionImporter(db)
    importer.sync(settings)

    expect(repo.listTasks(db)[0].status).toBe('running')
    expect(importer.refreshRunning()).toBe(0)
    expect(repo.listTasks(db)[0].status).toBe('running')
  })

  it('marks Codex done once the lock is gone', () => {
    const db = memoryDb()
    const codexSid = '019a009a-ddf4-7c71-bbae-73a42f78cc02'
    writeCodex(codexSid, 'コーデックスの作業', 10 * 60 * 1000)
    const lock = writeCodexLock(codexSid)

    const importer = new SessionImporter(db)
    importer.sync(settings)
    expect(repo.listTasks(db)[0].status).toBe('running')

    rmSync(lock)
    expect(importer.refreshRunning(Date.now() + 20_000)).toBe(1)
    expect(repo.listTasks(db)[0].status).toBe('done')
  })

  it('keeps Codex running through long silence as long as the process holds the lock', () => {
    const db = memoryDb()
    const codexSid = '019a009a-ddf4-7c71-bbae-73a42f78cc03'
    writeCodex(codexSid, '長いツールを実行中', 60 * 60 * 1000)
    const lock = writeCodexLock(codexSid)
    const holder = holdCodexLock(lock)

    const importer = new SessionImporter(db)
    try {
      importer.sync(settings)
      expect(repo.listTasks(db)[0].status).toBe('running')
      expect(importer.refreshRunning()).toBe(0)
      expect(repo.listTasks(db)[0].status).toBe('running')
    } finally {
      holder.kill()
      waitUntilCodexLockReleased(lock)
    }

    // Even if the file alone remains, once its writer is gone it is debris and can be closed as done.
    expect(importer.refreshRunning()).toBe(1)
    expect(repo.listTasks(db)[0].status).toBe('done')
  })

  it('stays running while the process is alive even after the log disappears', () => {
    const db = memoryDb()
    const path = writeClaude(sid, '発見されなくなる', 1000)
    const pidPath = writeClaudePid(sid)

    const importer = new SessionImporter(db)
    importer.sync(settings)
    expect(repo.listTasks(db)[0].status).toBe('running')

    // The log itself is gone (deleted, moved, or outside the import window). sync will never find it again.
    rmSync(path)
    importer.sync(settings)

    expect(importer.refreshRunning()).toBe(0)
    expect(repo.listTasks(db)[0].status).toBe('running')

    // Only when the liveness marker is gone too, not just the log, is it judged done.
    rmSync(pidPath)
    expect(importer.refreshRunning()).toBe(1)
    expect(repo.listTasks(db)[0].status).toBe('done')
  })

  it('falls back to mtime as before in an environment without liveness checks', () => {
    const db = memoryDb()
    // The pid file directory itself does not exist (a version without that mechanism)
    const path = writeClaude(sid, '更新時刻だけが頼り', 1000)

    const importer = new SessionImporter(db)
    importer.sync(settings)
    expect(repo.listTasks(db)[0].status).toBe('running')

    // Passing the grace period alone does not drop it
    expect(importer.refreshRunning(Date.now() + 30_000)).toBe(0)
    expect(repo.listTasks(db)[0].status).toBe('running')

    const old = new Date(Date.now() - 5 * 60 * 1000)
    utimesSync(path, old, old)
    expect(importer.refreshRunning()).toBe(1)
    expect(repo.listTasks(db)[0].status).toBe('done')
  })

  it('does not let the liveness check overwrite a state a human touched either', () => {
    const db = memoryDb()
    writeClaude(sid, '人間が触る', 1000)
    const pidPath = writeClaudePid(sid)

    const importer = new SessionImporter(db)
    importer.sync(settings)
    const id = repo.listTasks(db)[0].id
    repo.setTaskStatus(db, id, 'review')

    rmSync(pidPath)
    importer.refreshRunning(Date.now() + 20_000)

    expect(repo.getTask(db, id)?.status).toBe('review')
    expect(repo.listRunsByTask(db, id)[0].status).toBe('succeeded')
  })

  it('leaves a Run Quuu itself started out of the liveness check', () => {
    const db = memoryDb()
    const project = repo.insertProject(db, {
      name: 'work',
      path: work,
      color: '#fff',
      priority: 2,
      targetKind: 'agent',
      targetId: null,
      maxConcurrent: 1,
      enabled: true,
      sortOrder: 0
    })
    const task = repo.insertTask(db, { projectId: project.id, title: '自前', status: 'running' })
    repo.insertRun(db, {
      id: 'run_own',
      taskId: task.id,
      agentId: 'agent_x',
      resolvedFromGroupId: null,
      sessionId: sid,
      kind: 'initial',
      status: 'running',
      attempt: 1,
      fallbackFromRunId: null,
      pid: null,
      cwd: work,
      command: 'claude',
      args: [],
      promptPreview: '',
      exitCode: null,
      errorKind: null,
      errorMessage: '',
      sessionLogPath: null,
      stdoutLogPath: '/tmp/does-not-exist.log'
    })

    // The Runner watches whether its child process is alive. Import must not close it on its own.
    expect(new SessionImporter(db).refreshRunning()).toBe(0)
    expect(repo.getTask(db, task.id)?.status).toBe('running')
  })
})

describe('parsing Codex logs', () => {
  it('reads messages, thinking, and tool runs', () => {
    const parser = new CodexSessionParser()
    parser.pushLines([
      line({
        type: 'response_item',
        payload: { type: 'message', role: 'user', content: [{ text: 'これを直して' }] }
      }),
      line({
        type: 'response_item',
        payload: { type: 'reasoning', summary: [{ text: 'まず読む' }] }
      }),
      line({
        type: 'response_item',
        payload: { type: 'custom_tool_call', call_id: 'c1', name: 'exec', input: 'ls -la' }
      }),
      line({
        type: 'response_item',
        payload: { type: 'custom_tool_call_output', call_id: 'c1', output: 'a.ts\nb.ts' }
      }),
      line({
        type: 'response_item',
        payload: { type: 'message', role: 'assistant', content: [{ text: '直しました' }] }
      })
    ])

    expect(parser.title).toBe('これを直して')
    expect(parser.messages.map((m) => m.blocks[0].kind)).toEqual([
      'text',
      'thinking',
      'tool',
      'text'
    ])

    const tool = parser.messages[2].blocks[0]
    if (tool.kind !== 'tool') throw new Error('not a tool')
    expect(tool.tool.name).toBe('exec')
    expect(tool.tool.result).toBe('a.ts\nb.ts')
  })

  it('does not emit the developer-role preamble', () => {
    const parser = new CodexSessionParser()
    parser.pushLines([
      line({
        type: 'response_item',
        payload: { type: 'message', role: 'developer', content: [{ text: '前置き' }] }
      })
    ])
    expect(parser.messages).toHaveLength(0)
  })
})
