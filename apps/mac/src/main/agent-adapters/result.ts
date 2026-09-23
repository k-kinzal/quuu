import type { RunErrorKind } from '../execution/types.js'
// Custom and generic CLI definitions retain their configured text matching.
import { DEFAULT_LIMIT_PATTERNS } from '../agents/defaults.js'
import { t } from '../i18n/index.js'
import { limitLiftsAt } from './limitWindow.js'

const AUTH_PATTERNS = [
  'unauthorized',
  '\\b401\\b',
  '\\b403\\b',
  'authentication',
  'invalid api key',
  'please run .*login',
  'not logged in'
]

function matchAny(text: string, patterns: string[]): boolean {
  for (const p of patterns) {
    let re: RegExp
    try {
      re = new RegExp(p, 'i')
    } catch {
      // An invalid regex falls back to a literal match (so a configuration mistake does not stop
      // the classification entirely)
      if (text.toLowerCase().includes(p.toLowerCase())) return true
      continue
    }
    if (re.test(text)) return true
  }
  return false
}

export interface ClassifyInput {
  exitCode: number | null
  signal: NodeJS.Signals | null
  output: string
  limitPatterns: string[]
  timedOut: boolean
  canceled: boolean
}

export interface Classification {
  kind: RunErrorKind | null
  message: string
  /**
   * For a limit, the moment the CLI said it lifts. null when it never said (or this is not a limit).
   *
   * Carried out of classification rather than re-read later because the output is the only place it
   * exists: the log is rotated and the run record keeps one line.
   */
  retryAt?: string | null
}

/** Classify a run result. A null kind means "succeeded". */
export function classifyRunResult(input: ClassifyInput): Classification {
  if (input.canceled) return { kind: 'canceled', message: t('run.canceled') }
  if (input.timedOut) return { kind: 'timeout', message: t('run.timedOut') }

  const tail = input.output.slice(-8192)
  const patterns = input.limitPatterns.length > 0 ? input.limitPatterns : DEFAULT_LIMIT_PATTERNS

  if (input.exitCode === 0 && input.signal === null) {
    // Even with exit code 0, it may have printed only a limit message and done nothing.
    // That still goes to review, but is not recorded as a limit (it counts as success).
    return { kind: null, message: '' }
  }

  if (matchAny(tail, patterns)) return limitClassification(tail, patterns)
  if (matchAny(tail, AUTH_PATTERNS)) {
    return { kind: 'auth', message: extractReason(tail) || t('runErrorKind.auth') }
  }
  if (input.signal) {
    return { kind: 'nonzero-exit', message: t('run.signalExit', { signal: input.signal }) }
  }
  // 127 is "command not found". Treated as a launch failure, not an agent failure.
  if (input.exitCode === 127) {
    return { kind: 'spawn', message: extractReason(tail) || t('run.commandNotFound') }
  }
  return {
    kind: 'nonzero-exit',
    message: extractReason(tail) || t('run.exitCode', { code: input.exitCode ?? t('run.unknownCode') })
  }
}

/**
 * Classification for a run that ended with no known exit code.
 *
 * Used when a run that outlived a Quuu restart could not leave an exit code (SIGKILL and the like).
 * There is no evidence to declare it failed, so only a limit is picked out of the output and
 * everything else is handed to a human as a success (review). Failing it and re-running does more harm.
 */
export function classifyDetachedResult(input: {
  output: string
  limitPatterns: string[]
}): Classification {
  const tail = input.output.slice(-8192)
  const patterns = input.limitPatterns.length > 0 ? input.limitPatterns : DEFAULT_LIMIT_PATTERNS
  if (matchAny(tail, patterns)) return limitClassification(tail, patterns)
  return { kind: null, message: '' }
}

/**
 * What a limit leaves behind: the line that announced it, and when it says it lifts.
 *
 * The announcement is reported rather than the last line of the output, because CLIs print their
 * own epilogue after it - Codex signs off with the token count, so "1,888,438" is what a human
 * used to be shown as the reason their week of work stopped.
 */
function limitClassification(tail: string, patterns: string[]): Classification {
  const line = matchingLine(tail, patterns)
  const message = line || extractReason(tail) || t('run.limitReached')
  return { kind: 'limit', message, retryAt: limitLiftsAt(line || tail) }
}

/** The last line of the output that matched one of the patterns. */
function matchingLine(text: string, patterns: string[]): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  for (let i = lines.length - 1; i >= 0; i--) {
    if (matchAny(lines[i], patterns)) return lines[i].slice(0, 400)
  }
  return null
}

/** Pull one human-readable line out of the end of the output. */
function extractReason(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return ''
  // For JSON output, prefer the message field
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
    const line = lines[i]
    if (line.startsWith('{')) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>
        const msg = obj.message ?? obj.error ?? obj.result
        if (typeof msg === 'string' && msg.length > 0) return msg.slice(0, 400)
      } catch {
        // Not JSON: just move on
      }
    }
  }
  return lines[lines.length - 1].slice(0, 400)
}
