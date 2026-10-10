import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { Classification } from '../execution/errorClassifier.js'
import type { Run } from '../execution/types.js'
import { t } from '../i18n/index.js'
import { QUUU_PROJECT_ID } from '../projects/types.js'
import { sessionKey, type SessionIndex } from '../session/index.js'
import { sessionReadTarget } from '../session/sessionAttach.js'
import { snapshotStamp } from '../session/sessionWatcher.js'
import type { AssistantTurn } from './types.js'

function turnMarker(runId: string): string { return `QuuuAI conversation turn: ${runId}` }

/** Record the existing conversation boundary without putting control text in the user's message. */
export function registerTurn(db: Db, run: Run): void {
  const task = repo.getTask(db, run.taskId)
  if (task?.projectId !== QUUU_PROJECT_ID || repo.isAssistantCheck(db, task.id)) return
  const previous = repo.listRunsByTask(db, task.id).find(other => other.id !== run.id && other.sessionId === run.sessionId)
  let boundary: NonNullable<AssistantTurn['boundary']> = { verified: !previous, afterMessageId: null }
  if (previous) {
    const target = sessionReadTarget(db, previous)
    const key = sessionKey(target)
    const index = repo.getSessionIndex(db, key)
    if (index && index.stamp === snapshotStamp(target.logPath)) {
      const last = repo.readSessionMessages(db, key, index.generation, Math.max(0, index.total - 1), 1)[0]
      boundary = { verified: true, afterMessageId: last?.id ?? null }
    }
  }
  repo.saveAssistantTurn(db, { taskId: task.id, runId: run.id, noReply: false, outcome: null, boundary })
}

export function chooseNoReply(db: Db, runId: string): void {
  const run = repo.getRun(db, runId)
  const task = run ? repo.getTask(db, run.taskId) : null
  const turn = repo.getAssistantTurn(db, runId)
  if (!run || !task || !turn || task.projectId !== QUUU_PROJECT_ID || repo.isAssistantCheck(db, task.id) ||
    task.currentRunId !== run.id || task.status !== 'running' || !['starting', 'running'].includes(run.status)) {
    throw new Error(t('assistant.noReplyUnavailable'))
  }
  repo.saveAssistantTurn(db, { ...turn, noReply: true })
}

/** Leave non-conversation runs synchronous. Every opted-in turn must prove its result before settlement. */
export function validateResponse(db: Db, sessions: SessionIndex, run: Run): Promise<Classification> | null {
  if (!repo.getAssistantTurn(db, run.id)) return null
  return (async () => {
    if (run.exitCode !== 0) return { kind: 'invalid-result', message: t('assistant.unconfirmedExit') }
    const target = sessionReadTarget(db, run)
    const key = sessionKey(target)
    sessions.request(run, target, true)
    await sessions.ready(key)
    const index = repo.getSessionIndex(db, key)
    const turn = repo.getAssistantTurn(db, run.id)
    if (!turn) throw new Error('Assistant turn disappeared during validation')
    const reply = index && (target.mode === 'stdout' && run.logAdapter === 'stdout'
      ? repo.readSessionMessages(db, key, index.generation, 0, 1).length > 0
      : turn.boundary
        ? repo.assistantReplyAfter(db, key, index.generation, turn.boundary, run.startedAt)
        : repo.assistantTurnHasReply(db, key, index.generation, turnMarker(run.id)))
    // Real prose wins over an earlier silence decision; never hide an answer or operation result.
    if (reply || turn.noReply) {
      repo.saveAssistantTurn(db, { ...turn, outcome: reply ? 'reply' : 'no-reply' })
      return { kind: null, message: '' }
    }
    return { kind: 'invalid-result', message: t('assistant.missingReply') }
  })()
}
