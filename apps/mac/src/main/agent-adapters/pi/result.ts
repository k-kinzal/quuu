import { classifyDetachedResult, classifyRunResult, type Classification, type ClassifyInput } from '../result.js'
import { DEFAULT_LIMIT_PATTERNS } from '../../agents/defaults.js'
import { t } from '../../i18n/index.js'
import { object, record } from './records.js'

/** JSON mode can exit zero after a failed assistant turn; only terminal provider evidence counts. */
function terminalResult(output: string): { failed: boolean; message: string } | null {
  let result: { failed: boolean; message: string } | null = null
  const readMessage = (value: unknown): void => {
    const message = object(value)
    if (message.role !== 'assistant') return
    const failed = message.stopReason === 'error' || message.stopReason === 'aborted'
    result = { failed, message: typeof message.errorMessage === 'string' && message.errorMessage
      ? message.errorMessage : message.stopReason === 'aborted' ? t('run.canceled') : t('runErrorKind.nonzero-exit') }
  }
  for (const line of output.split('\n')) {
    const entry = record(line)
    if (entry.type === 'message_end' || entry.type === 'turn_end') readMessage(entry.message)
    if (entry.type === 'agent_end' && Array.isArray(entry.messages)) entry.messages.forEach(readMessage)
    if (entry.type === 'auto_retry_end' && entry.success === false && typeof entry.finalError === 'string') {
      result = { failed: true, message: entry.finalError }
    }
    if (entry.type === 'agent_settled' && entry.aborted === true && !result?.failed) result = { failed: true, message: t('run.canceled') }
  }
  return result
}

export function classifyPiResult(input: ClassifyInput): Classification {
  if (input.canceled || input.timedOut) return classifyRunResult(input)
  const result = terminalResult(input.output)
  if (result?.failed) return classifyRunResult({ ...input, exitCode: input.exitCode || 1, output: result.message,
    limitPatterns: [...DEFAULT_LIMIT_PATTERNS, ...input.limitPatterns] })
  return classifyRunResult(input)
}

export function classifyDetachedPiResult(input: { output: string; limitPatterns: string[] }): Classification {
  const result = terminalResult(input.output)
  if (!result) return classifyDetachedResult(input)
  return classifyRunResult({ ...input, output: result.message, exitCode: result.failed ? 1 : 0, signal: null, canceled: false, timedOut: false,
    limitPatterns: [...DEFAULT_LIMIT_PATTERNS, ...input.limitPatterns] })
}
