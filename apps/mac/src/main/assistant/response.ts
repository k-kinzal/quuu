import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { Classification } from '../execution/errorClassifier.js'
import type { Run } from '../execution/types.js'
import { t } from '../i18n/index.js'
import { QUUU_PROJECT_ID } from '../projects/types.js'
import { sessionKey, type SessionIndex } from '../session/index.js'
import { sessionReadTarget } from '../session/sessionAttach.js'

function turnMarker(runId: string): string { return `QuuuAI conversation turn: ${runId}` }

export function responsePrompt(db: Db, taskId: string, runId: string): string {
  if (repo.isAssistantCheck(db, taskId)) return ''
  if (!repo.getAssistantTurn(db, runId)) repo.saveAssistantTurn(db, { taskId, runId, noReply: false, outcome: null })
  return `\n\n${turnMarker(runId)}
Decide from the whole conversation whether a user-facing reply is useful. For a closing acknowledgement such as "ありがとう" or "thanks" with no question, request, unresolved issue or needed confirmation, you may deliberately finish without replying. Do not decide by keywords: thanks combined with a question or additional request still needs an answer or action. Never omit a necessary answer, operation result, failure report or confirmation.
To choose no reply, call: quuu call assistant.noReply '{"runId":"${runId}"}'
After that call succeeds, end normally without any user-facing text (no acknowledgement, placeholder, control token, or "I will not reply"). If the call fails, report the failure. Do not emit commentary before choosing silence. Otherwise reply normally; no special call is needed. Empty output without this explicit decision is an error. This option applies only to this QuuuAI conversation turn, not development-task reports or background research.`
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
      : repo.assistantTurnHasReply(db, key, index.generation, turnMarker(run.id)))
    // Real prose wins over an earlier silence decision; never hide an answer or operation result.
    if (reply || turn.noReply) {
      repo.saveAssistantTurn(db, { ...turn, outcome: reply ? 'reply' : 'no-reply' })
      return { kind: null, message: '' }
    }
    return { kind: 'invalid-result', message: t('assistant.missingReply') }
  })()
}
