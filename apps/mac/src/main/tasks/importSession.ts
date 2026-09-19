import { inTransaction, type Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { Run } from '../execution/types.js'
import { newId, truncate } from '../util.js'
import type { Task } from './types.js'
import { t } from '../i18n/index.js'

export interface ImportedSession {
  title: string | null; command: string; sessionId: string; key: string
  cwd: string; logPath: string; startedAt: string; updatedAt: string
}

/** Importing external history. The existing rule that stopped past history counts as done is confined to here. */
export function importExternalSession(db: Db, session: ImportedSession, projectId: string, running: boolean, agentId: string): void {
  inTransaction(db, () => {
    const title =
      session.title ??
      t('importedSession.title', { command: session.command, id: session.sessionId.slice(0, 8) })

    const task = repo.insertTask(db, {
      projectId,
      title: truncate(title, 160),
      prompt: '',
      priority: 2,
      status: running ? 'running' : 'done',
      source: 'imported',
      externalKey: session.key
    })

    if (!running) {
      repo.setTaskStatus(db, task.id, 'done', { doneAt: session.updatedAt })
    }

    const runId = newId('run')
    repo.insertRun(db, {
      id: runId,
      taskId: task.id,
      agentId: agentId,
      resolvedFromGroupId: null,
      sessionId: session.sessionId,
      kind: 'initial',
      status: running ? 'running' : 'succeeded',
      attempt: 1,
      fallbackFromRunId: null,
      pid: null,
      cwd: session.cwd,
      command: session.command,
      args: [],
      promptPreview: session.title ?? '',
      exitCode: running ? null : 0,
      errorKind: null,
      errorMessage: '',
      sessionLogPath: session.logPath,
      stdoutLogPath: session.logPath,
      source: 'imported',
      externalKey: session.key,
      startedAt: session.startedAt,
      endedAt: running ? null : session.updatedAt
    })

    repo.setTaskStatus(db, task.id, running ? 'running' : 'done', {
      currentRunId: runId,
      sessionId: session.sessionId,
      doneAt: running ? null : session.updatedAt
    })
  })
}

/** Reflect the external run state only into what the import owns. */
export function refreshImportedSession(db: Db, run: Run, task: Task, running: boolean, endedAt: string): boolean {
  return inTransaction(db, () => {
    let changed = false

    const wasOrphaned = run.errorKind === 'orphaned'
    const expectedRun = running ? 'running' : 'succeeded'

    if (run.status !== expectedRun || run.errorKind !== null) {
      repo.updateRun(db, run.id, {
        status: expectedRun,
        errorKind: null,
        errorMessage: '',
        endedAt: running ? null : endedAt
      })
      changed = true
    }

    // On the task side, fix only states the import manages.
    // Respect what a human changed to review or draft.
    const owned =
      task.status === 'running' ||
      task.status === 'done' ||
      (task.status === 'failed' && wasOrphaned)
    const expectedTask = running ? 'running' : 'done'

    if (owned && task.status !== expectedTask) {
      // If a reservation was written mid-run, send it here as a continued run now that it finished (reserved send).
      // Even for directly launched sessions, "wait for it to finish, then say the next thing" stays the same experience.
      if (!running && task.reservedMessage.trim().length > 0) {
        repo.setTaskStatus(db, task.id, 'queued', {
          pendingMessage: task.reservedMessage.trim(),
          doneAt: null
        })
        repo.setReservedMessage(db, task.id, '')
      } else {
        repo.setTaskStatus(db, task.id, expectedTask, {
          doneAt: running ? null : endedAt
        })
      }
      changed = true
    }

    return changed

  })
}
