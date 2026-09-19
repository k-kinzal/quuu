import { join } from 'node:path'
import type { AgentInput } from '../src/main/agents/types.js'
import type { ProjectInput } from '../src/main/projects/types.js'
import type { RunKind } from '../src/main/execution/types.js'
import type { TaskStatus } from '../src/main/tasks/status.js'
import { openDatabase } from '../src/main/db/database.js'
import type { Db } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { nowIso } from '../src/main/util.js'

export function memoryDb(): Db {
  return openDatabase(':memory:')
}

export function makeAgent(db: Db, over: Partial<AgentInput> & { name: string }): string {
  const input: AgentInput = {
    name: over.name,
    description: '',
    command: over.command ?? 'echo',
    argsTemplate: over.argsTemplate ?? ['{{prompt}}'],
    resumeArgsTemplate: over.resumeArgsTemplate ?? [],
    env: over.env ?? {},
    concurrency: over.concurrency ?? 1,
    fallbackAgentId: over.fallbackAgentId ?? null,
    limitPatterns: over.limitPatterns ?? [],
    cooldownSeconds: over.cooldownSeconds ?? 900,
    timeoutSeconds: over.timeoutSeconds ?? 0,
    logAdapter: over.logAdapter ?? 'claude',
    enabled: over.enabled ?? true,
    source: over.source ?? 'user',
    sortOrder: over.sortOrder ?? 0
  }
  return repo.insertAgent(db, input).id
}

export function makeProject(
  db: Db,
  over: Partial<ProjectInput> & { name: string; targetId: string }
): string {
  const input: ProjectInput = {
    name: over.name,
    path: over.path ?? '/tmp',
    color: over.color ?? '#4EA8DE',
    priority: over.priority ?? 2,
    targetKind: over.targetKind ?? 'agent',
    targetId: over.targetId,
    maxConcurrent: over.maxConcurrent ?? 1,
    enabled: over.enabled ?? true,
    commitIdentityMode: over.commitIdentityMode ?? 'inherit',
    commitIdentity: over.commitIdentity ?? { appSlug: '', botUserId: '' },
    sortOrder: over.sortOrder ?? 0
  }
  return repo.insertProject(db, input).id
}

export function makeTask(
  db: Db,
  projectId: string,
  title: string,
  priority = 2,
  status: 'draft' | 'queued' = 'queued'
): string {
  return repo.insertTask(db, {
    projectId,
    title,
    prompt: title,
    priority: priority as 0 | 1 | 2 | 3,
    status
  }).id
}

/**
 * Create a task waiting for review (the run finished and awaits a follow-up).
 * The latest Run stays behind, so slot reservation must keep this agent free.
 */
export function reviewed(db: Db, projectId: string, title: string, agentId: string): string {
  const taskId = makeTask(db, projectId, title)
  const runId = occupy(db, taskId, agentId)
  repo.updateRun(db, runId, { status: 'succeeded', endedAt: nowIso() })
  repo.setTaskStatus(db, taskId, 'review', { currentRunId: runId })
  return taskId
}

/**
 * Fabricate a running Run to occupy an execution slot.
 *
 * Record the command and session ID in the same shape as `Runner.start`.
 * **Only the Run records who opened the session**, so leaving this out makes
 * continuation tests face a "session with no known owner".
 */
export function occupy(
  db: Db,
  taskId: string,
  agentId: string,
  over: { stdoutLogPath?: string; kind?: RunKind } = {}
): string {
  const id = `run_${Math.random().toString(36).slice(2, 12)}`
  const sessionId = `sess-${id}`
  repo.insertRun(db, {
    id,
    taskId,
    agentId,
    resolvedFromGroupId: null,
    sessionId,
    kind: over.kind ?? 'initial',
    status: 'running',
    attempt: 1,
    fallbackFromRunId: null,
    pid: null,
    cwd: '/tmp',
    command: repo.getAgent(db, agentId)?.command ?? 'echo',
    args: [],
    promptPreview: '',
    exitCode: null,
    errorKind: null,
    errorMessage: '',
    sessionLogPath: null,
    stdoutLogPath: over.stdoutLogPath ?? '/tmp/x.log'
  })
  repo.setTaskStatus(db, taskId, 'running', { currentRunId: id, sessionId })
  return id
}

/**
 * Put a task in the "ran once, has a session" state (ready to receive a follow-up).
 *
 * Writing a session ID onto the task alone is not enough. A continuation runs
 * **only with the CLI of the Run that opened the session**, so a session ID with
 * no Run is treated as an ownerless session (a real run always leaves a Run).
 */
export function sessioned(
  db: Db,
  taskId: string,
  agentId: string,
  status: TaskStatus,
  extra: { pendingMessage?: string; stdoutLogPath?: string } = {}
): string {
  const runId = occupy(db, taskId, agentId, { stdoutLogPath: extra.stdoutLogPath })
  repo.updateRun(db, runId, { status: 'succeeded', endedAt: nowIso() })
  repo.setTaskStatus(db, taskId, status, {
    currentRunId: runId,
    pendingMessage: extra.pendingMessage
  })
  return runId
}

/**
 * Point every session-log location at a test directory.
 *
 * Miss even one and the tests **read real logs on the dev machine**.
 * Import tests count "how many were found", so mixed-in real data fails them
 * (this actually happened when adding a supported CLI). New locations get
 * added here; test code should only have to call this.
 */
export function isolateSessionDirs(root: string): {
  claude: string
  claudePids: string
  codex: string
  codexLocks: string
  cursor: string
  cursorAgentLogs: string
  grok: string
  copilot: string
  agy: string
  opencodeDb: string
} {
  const dirs = {
    claude: join(root, 'claude'),
    claudePids: join(root, 'claude-sessions'),
    codex: join(root, 'codex'),
    codexLocks: join(root, 'codex-locks'),
    cursor: join(root, 'cursor'),
    cursorAgentLogs: join(root, 'cursor-agent-logs'),
    grok: join(root, 'grok'),
    copilot: join(root, 'copilot'),
    agy: join(root, 'agy'),
    // opencode keeps every session in one store, so what is redirected is a file, not a directory
    opencodeDb: join(root, 'opencode', 'opencode.db')
  }
  process.env.QUUU_CLAUDE_PROJECTS_DIR = dirs.claude
  process.env.QUUU_CLAUDE_SESSIONS_DIR = dirs.claudePids
  process.env.QUUU_CODEX_SESSIONS_DIR = dirs.codex
  process.env.QUUU_CODEX_LOCKS_DIR = dirs.codexLocks
  process.env.QUUU_CURSOR_CHATS_DIR = dirs.cursor
  process.env.QUUU_CURSOR_AGENT_LOGS_DIR = dirs.cursorAgentLogs
  process.env.QUUU_GROK_SESSIONS_DIR = dirs.grok
  process.env.QUUU_COPILOT_SESSIONS_DIR = dirs.copilot
  process.env.QUUU_AGY_DIR = dirs.agy
  process.env.QUUU_OPENCODE_DB = dirs.opencodeDb
  return dirs
}

/** Undo what isolateSessionDirs pointed elsewhere. */
export function releaseSessionDirs(): void {
  delete process.env.QUUU_CLAUDE_PROJECTS_DIR
  delete process.env.QUUU_CLAUDE_SESSIONS_DIR
  delete process.env.QUUU_CODEX_SESSIONS_DIR
  delete process.env.QUUU_CODEX_LOCKS_DIR
  delete process.env.QUUU_CURSOR_CHATS_DIR
  delete process.env.QUUU_CURSOR_AGENT_LOGS_DIR
  delete process.env.QUUU_GROK_SESSIONS_DIR
  delete process.env.QUUU_COPILOT_SESSIONS_DIR
  delete process.env.QUUU_AGY_DIR
  delete process.env.QUUU_OPENCODE_DB
}
