import { stripVTControlCharacters } from 'node:util'
import { limitLiftsAt } from '../limitWindow.js'
import { classifyDetachedResult, classifyRunResult, type Classification, type ClassifyInput } from '../result.js'

// Claude prints account, session and model limits with different nouns. These are
// native diagnostics, independent of the extra patterns in an agent definition.
const LIMIT = /^(?:Error:\s*)?You(?:'ve|’ve| have) (?:hit|reached) your .+?limit\b/i
const API_LIMIT = /^API Error:\s*(?:429\b|.*\brate.?limit\b)/i

interface ResultEnvelope { failed: boolean; text: string }

function resultEnvelope(output: string): ResultEnvelope | null {
  const lines = output.trim().split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const value: unknown = JSON.parse(lines[i])
      if (!value || typeof value !== 'object') continue
      const row = value as Record<string, unknown>
      if (row.type !== 'result' || typeof row.is_error !== 'boolean') continue
      const errors = Array.isArray(row.errors) ? row.errors.filter((error): error is string => typeof error === 'string') : []
      return { failed: row.is_error, text: typeof row.result === 'string' ? row.result : errors.join('\n') }
    } catch { /* Plain text and incomplete stream records carry no result envelope. */ }
  }
  return null
}

function nativeLimit(output: string): Classification | null {
  const lines = stripVTControlCharacters(output).split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (LIMIT.test(line) || API_LIMIT.test(line)) {
      return { kind: 'limit', message: line.slice(0, 400), retryAt: limitLiftsAt(line) }
    }
  }
  return null
}

/** An explicit failed result outranks exit zero; successful prose is not a diagnostic. */
export function classifyClaudeResult(input: ClassifyInput): Classification {
  if (input.canceled || input.timedOut) return classifyRunResult(input)
  const envelope = resultEnvelope(input.output)
  if (envelope?.failed) {
    return nativeLimit(envelope.text) ?? classifyRunResult({
      ...input, output: envelope.text, exitCode: input.exitCode || 1
    })
  }
  if (input.exitCode === 0 && input.signal === null) return classifyRunResult(input)
  return nativeLimit(envelope?.text ?? input.output) ?? classifyRunResult(input)
}

/** Restart recovery uses the same provider evidence without inventing a missing exit code. */
export function classifyDetachedClaudeResult(input: { output: string; limitPatterns: string[] }): Classification {
  const envelope = resultEnvelope(input.output)
  if (envelope && !envelope.failed) return { kind: null, message: '' }
  const output = envelope?.text ?? input.output
  return nativeLimit(output) ?? classifyDetachedResult({ ...input, output })
}
