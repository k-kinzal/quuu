import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { Run } from '../src/main/execution/types.js'
import type { Db } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { SessionImporter } from '../src/main/import/importer.js'
import { resetLivenessMemo } from '../src/main/import/liveness.js'
import { sessionLogDir } from '../src/main/session/claudePaths.js'
import { attachActiveRuns, attachSessionLog } from '../src/main/session/sessionAttach.js'
import { isolateSessionDirs, makeAgent, makeProject, memoryDb, releaseSessionDirs } from './helpers.js'

/**
 * When the agent definition does not pass `--session-id`, the CLI picks its own
 * session ID and writes the log there. A file with the ID Quuu assigned never
 * appears, so the conversation stays invisible to the end (actual bug).
 */

let root: string
let work: string

const line = (o: unknown): string => `${JSON.stringify(o)}\n`
const PROMPT = 'タスクの自動読み込みで呼び出したタスクが終了しません。'

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'taskd-attach-'))
  work = join(root, 'work')
  mkdirSync(work, { recursive: true })
  isolateSessionDirs(root)
  resetLivenessMemo()
})

afterEach(() => {
  releaseSessionDirs()
  rmSync(root, { recursive: true, force: true })
})

/** A log the CLI wrote under an ID it picked itself. */
function writeCliLog(sessionId: string, prompt = PROMPT): string {
  const dir = sessionLogDir(work)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${sessionId}.jsonl`)
  writeFileSync(
    path,
    [
      line({ type: 'ai-title', sessionId, aiTitle: '自動読み込みの調査' }),
      line({
        type: 'user',
        uuid: 'u1',
        sessionId,
        cwd: work,
        timestamp: new Date().toISOString(),
        message: { role: 'user', content: prompt }
      })
    ].join('')
  )
  return path
}

/** A Run launched by Quuu. The session ID is still the one Quuu assigned. */
function makeRun(
  db: Db,
  over: { sessionId: string; taskId: string; agentId: string; startedAt?: string } & Partial<Run>
): Run {
  const id = over.id ?? `run_${over.sessionId.slice(0, 8)}`
  return repo.insertRun(db, {
    id,
    taskId: over.taskId,
    agentId: over.agentId,
    resolvedFromGroupId: null,
    sessionId: over.sessionId,
    kind: 'initial',
    status: over.status ?? 'running',
    attempt: 1,
    fallbackFromRunId: null,
    pid: null,
    cwd: work,
    command: 'claude',
    args: ['-p', PROMPT],
    promptPreview: over.promptPreview ?? PROMPT,
    exitCode: null,
    errorKind: null,
    errorMessage: '',
    sessionLogPath: over.sessionLogPath ?? null,
    stdoutLogPath: join(root, `${id}.log`),
    startedAt: over.startedAt ?? new Date().toISOString(),
    source: over.source
  })
}

function fixture(db: Db): { taskId: string; agentId: string } {
  const agentId = makeAgent(db, { name: 'Claude Code', command: 'claude' })
  const projectId = makeProject(db, { name: 'work', targetId: agentId, path: work })
  const taskId = repo.insertTask(db, {
    projectId,
    title: '読み込んだタスクが終了しない問題の修正',
    prompt: PROMPT,
    status: 'running'
  }).id
  return { taskId, agentId }
}

describe('reattaching session logs', () => {
  it('finds the real log and attaches it to the Run even when the CLI wrote under a different ID', () => {
    const db = memoryDb()
    const { taskId, agentId } = fixture(db)
    const run = makeRun(db, { taskId, agentId, sessionId: 'quuu-が採番した-id' })
    repo.setTaskStatus(db, taskId, 'running', {
      currentRunId: run.id,
      sessionId: run.sessionId
    })
    const path = writeCliLog('cli-1111')

    const attached = attachSessionLog(db, run)

    expect(attached.sessionLogPath).toBe(path)
    expect(attached.sessionId).toBe('cli-1111')
    // Continuation (--resume) uses the task's ID, so that one must match reality too.
    expect(repo.getTask(db, taskId)?.sessionId).toBe('cli-1111')
  })

  it('does not attach to a log whose prompt does not match (another session in the same cwd)', () => {
    const db = memoryDb()
    const { taskId, agentId } = fixture(db)
    const run = makeRun(db, { taskId, agentId, sessionId: 'quuu-2222' })
    writeCliLog('cli-2222', '人間が直接起動した別の作業')

    const attached = attachSessionLog(db, run)

    expect(attached.sessionLogPath).toBeNull()
    expect(attached.sessionId).toBe('quuu-2222')
  })

  it('does not steal a session another Run is using', () => {
    const db = memoryDb()
    const { taskId, agentId } = fixture(db)
    // Ran twice with the same prompt. The first is already attached to its log.
    writeCliLog('cli-3333')
    const first = makeRun(db, { taskId, agentId, sessionId: 'quuu-3333', id: 'run_first' })
    expect(attachSessionLog(db, first).sessionId).toBe('cli-3333')

    const second = makeRun(db, { taskId, agentId, sessionId: 'quuu-4444', id: 'run_second' })
    expect(attachSessionLog(db, second).sessionLogPath).toBeNull()

    // Once the second run's log appears, it attaches to that one
    const path = writeCliLog('cli-4444')
    const attached = attachSessionLog(db, repo.getRun(db, second.id)!)
    expect(attached.sessionLogPath).toBe(path)
  })

  it('does not pick up a log that predates the Run', () => {
    const db = memoryDb()
    const { taskId, agentId } = fixture(db)
    writeCliLog('cli-5555')
    // A Run that started after the log existed (i.e. some other process wrote this log)
    const run = makeRun(db, {
      taskId,
      agentId,
      sessionId: 'quuu-5555',
      startedAt: new Date(Date.now() + 60_000).toISOString()
    })

    expect(attachSessionLog(db, run).sessionLogPath).toBeNull()
  })

  it('can reattach to the rightful Run even when import already picked the session up as external', () => {
    const db = memoryDb()
    const { taskId, agentId } = fixture(db)
    const run = makeRun(db, { taskId, agentId, sessionId: 'quuu-6666' })
    writeCliLog('cli-6666')
    // State where our own session got imported as external because attaching failed.
    // The import side now has a safeguard too (hasOwnRunCovering) so it normally never
    // gets this far, but the behavior to protect is: even with an earlier imported
    // record left behind, it yields to the rightful Run.
    const external = repo.insertTask(db, {
      projectId: repo.getTask(db, taskId)!.projectId,
      title: '外部として取り込まれた同じセッション',
      prompt: PROMPT,
      status: 'running',
      source: 'imported'
    })
    makeRun(db, {
      taskId: external.id,
      agentId,
      sessionId: 'cli-6666',
      id: 'run_imported',
      source: 'imported'
    })

    expect(attachSessionLog(db, run).sessionId).toBe('cli-6666')
  })

  it('reattaching while running keeps import from double-registering our own session', () => {
    const db = memoryDb()
    const { taskId, agentId } = fixture(db)
    const run = makeRun(db, { taskId, agentId, sessionId: 'quuu-7777' })
    repo.setTaskStatus(db, taskId, 'running', { currentRunId: run.id, sessionId: run.sessionId })
    writeCliLog('cli-7777')

    expect(attachActiveRuns(db)).toBe(1)
    const result = new SessionImporter(db).sync({ ...DEFAULT_SETTINGS, importHistoryDays: 30 })

    expect(result.createdTasks).toBe(0)
    expect(repo.listTasks(db)).toHaveLength(1)
  })

  it('leaves agents that read logs from stdout alone', () => {
    const db = memoryDb()
    const agentId = makeAgent(db, { name: 'Codex', command: 'codex', logAdapter: 'stdout' })
    const projectId = makeProject(db, { name: 'work', targetId: agentId, path: work })
    const taskId = repo.insertTask(db, { projectId, title: 'stdout', prompt: PROMPT }).id
    const run = makeRun(db, { taskId, agentId, sessionId: 'quuu-8888' })
    writeCliLog('cli-8888')

    expect(attachSessionLog(db, run).sessionLogPath).toBeNull()
  })
})
