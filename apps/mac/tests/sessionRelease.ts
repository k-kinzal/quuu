import type { Db } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import type { LogAdapter } from '../src/main/agents/cliAdapter.js'
import type { StoredHookRun } from '../src/main/hooks/stored.js'
import type { SessionMessage } from '../src/main/session/types.js'
import { sessionKey } from '../src/main/session/index.js'
import { occupy } from './helpers.js'

const TABLES = ['session_indexes', 'session_messages', 'session_images', 'session_workdirs'] as const

/** How many rows each session table holds for the key - every one of them, or deletion left something behind. */
export function savedRows(db: Db, key?: string): Record<(typeof TABLES)[number], number> {
  const count = (table: string): number => Number((key === undefined
    ? db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get()
    : db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE log_key = ?`).get(key))?.c)
  return { session_indexes: count(TABLES[0]), session_messages: count(TABLES[1]), session_images: count(TABLES[2]), session_workdirs: count(TABLES[3]) }
}

export const NOTHING = { session_indexes: 0, session_messages: 0, session_images: 0, session_workdirs: 0 }
export const EVERYTHING = { session_indexes: 1, session_messages: 2, session_images: 1, session_workdirs: 1 }

/** Save a conversation the way reading a log does: pages, an image, a working directory, then the index. */
export function saveConversation(db: Db, key: string): void {
  const generation = `gen-${key}`
  const said = (id: string, role: SessionMessage['role'], text: string): SessionMessage =>
    ({ id, role, isSidechain: false, timestamp: null, blocks: [{ kind: 'text', text }], model: null })
  repo.writeSessionMessages(db, key, generation, 0, [said('m0', 'user', 'please'), said('m1', 'assistant', 'done')])
  repo.writeSessionImage(db, key, `image-${key}`, 'data:image/png;base64,AAAA')
  repo.writeSessionWorkDirs(db, key, generation, 0, ['/tmp/work'])
  repo.finishSessionIndex(db, key, { generation, stamp: '1|1', title: null, total: 2, evidenceVersion: 0, updatedAt: '2026-01-01T00:00:00.000Z' })
}

/** A finished run of the task whose conversation was read from `logPath` and saved. Returns the key it was saved under. */
export function ranWithConversation(db: Db, taskId: string, agentId: string, logPath: string, over: { sessionId?: string; mode?: LogAdapter } = {}): string {
  const runId = occupy(db, taskId, agentId, { stdoutLogPath: `${logPath}.stdout` })
  repo.updateRun(db, runId, { status: 'succeeded', sessionLogPath: logPath, ...(over.sessionId ? { sessionId: over.sessionId } : {}) })
  const run = repo.getRun(db, runId)!
  const key = sessionKey({ sessionId: run.sessionId, logPath, mode: over.mode ?? 'claude', awaitingStructured: false })
  saveConversation(db, key)
  return key
}

/** A hook's execution record, as the history keeps it after the hook has ended. */
export function hookRan(db: Db, taskId: string, projectId: string, over: Partial<StoredHookRun>): void {
  const project = repo.getProject(db, projectId)!
  const id = over.id ?? `hook_${Math.random().toString(36).slice(2, 12)}`
  repo.saveHookRun(db, {
    id, taskId, taskTitle: repo.getTask(db, taskId)?.title ?? '', projectId, hookId: 'check', name: 'Check', event: 'review', kind: 'agent', status: 'succeeded',
    cwd: project.path, input: 'check it', agentId: null, createdAt: '2026-01-01T00:00:00.000Z', startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:01:00.000Z', exitCode: 0, error: '', logPath: `/tmp/quuu-hooks/${id}.log`, exitPath: `/tmp/quuu-hooks/${id}.exit`,
    pid: null, authDir: null, sessionId: `sess-${id}`, logAdapter: 'claude', limitPatterns: [], project,
    definition: {} as StoredHookRun['definition'],
    ...over
  })
}
