import type { Run } from '../../../preload/api/execution.js'
import type { SessionMessage } from '../../../preload/api/session.js'
import { t } from './i18n/index.js'

/** Never mistake an older utterance from a resumed session for this run's response. */
export function executionFeedback(run: Run, messages: SessionMessage[]) {
  const started = Date.parse(run.startedAt)
  // Some logs have only second precision. Match on the text as well, so the sent copy isn't cleared by a previous instruction.
  const current = messages.filter((message) => message.timestamp !== null && Date.parse(message.timestamp) >= Math.floor(started / 1000) * 1000)
  const promptLogged = current.some((message) => message.role === 'user' && message.blocks.some((block) => block.kind === 'text' && block.text.includes(run.promptPreview)))
  const hasResponse = current.some((message) => message.role === 'assistant')
  // An imported run's preview is a summary, not an instruction Quuu sent.
  // Even if a long conversation pushes the instruction outside the loaded window, a response
  // from this run means the copy has done its job.
  const needsPreview = run.source === 'user' && !promptLogged && !hasResponse
  return {
    active: run.status === 'starting' || run.status === 'running',
    preview: needsPreview && run.promptPreview ? run.promptPreview + (run.promptPreview.length === 500 ? '…' : '') : null,
    // Log silence does not mean the process stopped or tell us what it is doing.
    label: run.status === 'starting' ? t('executionFeedback.starting') : t('executionFeedback.running')
  }
}
