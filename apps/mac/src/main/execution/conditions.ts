import type { Project } from '../projects/types.js'
import type { Task } from '../tasks/types.js'
import type { Run, RunErrorKind } from './types.js'

/** An automatic run's result can never reach done. That is a separate contract from a human's done action. */
export type RunDisposition =
  | { kind: 'send-reserved'; status: 'queued'; pendingMessage: string }
  | { kind: 'review'; status: 'review'; pendingMessage: '' }
  | { kind: 'interrupted'; status: 'review' }
  | { kind: 'retry'; status: 'queued' }
  | { kind: 'failed'; status: 'failed' }

export function runDisposition(
  task: Pick<Task, 'reservedMessage'>,
  error: RunErrorKind | null,
  retry: boolean
): RunDisposition {
  if (error === null) {
    const message = task.reservedMessage.trim()
    // Only an instruction a human reserved mid-run may be sent on after a normal finish.
    return message
      ? { kind: 'send-reserved', status: 'queued', pendingMessage: message }
      : { kind: 'review', status: 'review', pendingMessage: '' }
  }
  if (error === 'canceled') return { kind: 'interrupted', status: 'review' }
  return retry ? { kind: 'retry', status: 'queued' } : { kind: 'failed', status: 'failed' }
}

/**
 * What a resume says when the agent already has everything that was waiting to be sent.
 *
 * Every CLI's resume takes a message, so "just carry on" has to be written out. It is addressed to
 * the agent, not drawn on a screen, so it stays in English in code like the report writer's
 * instructions - and it names what to continue, because the instruction it refers to is the one
 * already sitting at the end of that conversation.
 */
export const CONTINUE_INSTRUCTION =
  'Continue the instruction above. It reached you, but the run ended before it was answered.'

/**
 * What is left of an instruction once the parts the agent already has are taken off the front.
 *
 * Follow-ups written one after another are joined in writing order, so what was handed over is
 * always the front of what is waiting. Anything that does not match is left alone: mistaking a new
 * instruction for one already sent would drop it without a trace.
 */
export function undelivered(message: string, delivered: string[]): string {
  let rest = message.trim()
  for (const text of delivered) {
    const sent = text.trim()
    if (sent.length > 0 && rest.startsWith(sent)) rest = rest.slice(sent.length).trim()
  }
  return rest
}

/** What a resume sends: whatever the agent has not been given, or a nudge to answer what it has. */
export function resumeMessage(pending: string, delivered: string[]): string {
  return undelivered(pending, delivered) || CONTINUE_INSTRUCTION
}

export const MAX_AUTO_ATTEMPTS = 5

export type RetryRequirement = 'never' | 'usable-agent' | 'other-agent'

/** The run side takes this condition and looks only for the candidates it needs. */
export function retryRequirement(error: RunErrorKind, failures: number): RetryRequirement {
  if (failures >= MAX_AUTO_ATTEMPTS) return 'never'
  switch (error) {
    case 'limit':
    case 'timeout':
      return 'usable-agent'
    case 'auth':
    case 'spawn':
    case 'nonzero-exit':
      return 'other-agent'
    default:
      return 'never'
  }
}

export function shouldRetryRun(
  error: RunErrorKind,
  failures: number,
  hasUsableCandidate: boolean,
  hasOtherCandidate: boolean
): boolean {
  const requirement = retryRequirement(error, failures)
  return requirement !== 'never' && hasUsableCandidate &&
    (requirement === 'usable-agent' || hasOtherCandidate)
}

/** Takes the run history newest first. A success or a cancel closes off the retry count. */
export function consecutiveFailures(runs: ReadonlyArray<Pick<Run, 'status'>>): number {
  let count = 0
  for (const run of runs) {
    if (run.status === 'succeeded' || run.status === 'canceled') break
    if (run.status === 'limited' || run.status === 'failed' || run.status === 'timeout') count++
  }
  return count
}

export type SlotAvailability = 'available' | 'busy' | 'reserved'

export function slotAvailability(
  active: number,
  reserved: number,
  limit: number,
  ownsReservation = false
): SlotAvailability {
  if (active >= limit) return 'busy'
  // Keeps two reserving tasks from blocking each other's free slot into a standstill.
  return active + (ownsReservation ? 0 : reserved) >= limit ? 'reserved' : 'available'
}

/** The cooldown is a decision. Reading the clock and saving it are left to the run side. */
export function cooldownSeconds(error: RunErrorKind | null, configured: number | undefined): number | null {
  if (error === 'limit') return configured ?? 900
  if (error === 'auth') return 300
  return null
}

/** A misread date must not park an agent for a year. Anything beyond this is not believed. */
export const MAX_LIMIT_COOLDOWN_SECONDS = 7 * 24 * 60 * 60

/** Never come straight back, even when the stated moment has all but arrived. */
const MIN_LIMIT_COOLDOWN_SECONDS = 60

/**
 * The moment the agent may be tried again, as an absolute time. null when nothing is owed.
 *
 * `retryAt` is what the CLI itself said, and it is believed over the configured cooldown in both
 * directions. The configured number is a guess made before anyone knew which limit was hit; a
 * 15-minute guess against a limit that lifts tomorrow retries 96 times for nothing, and against one
 * that lifts in two minutes it idles an account that is already back.
 */
export function cooldownUntil(
  error: RunErrorKind | null,
  configured: number | undefined,
  retryAt: string | null | undefined,
  now: string
): string | null {
  const seconds = cooldownSeconds(error, configured)
  if (seconds === null) return null

  const from = Date.parse(now)
  const stated = error === 'limit' && retryAt ? Date.parse(retryAt) : Number.NaN
  if (Number.isNaN(from) || Number.isNaN(stated)) return plusSeconds(now, seconds)

  const bounded = Math.min(
    Math.max(stated, from + MIN_LIMIT_COOLDOWN_SECONDS * 1000),
    from + MAX_LIMIT_COOLDOWN_SECONDS * 1000
  )
  return new Date(bounded).toISOString()
}

function plusSeconds(now: string, seconds: number): string {
  const from = Date.parse(now)
  return new Date((Number.isNaN(from) ? Date.now() : from) + seconds * 1000).toISOString()
}

/** The time is passed in by the run side. It defines what may be claimed automatically, whatever the UI or storage. */
export function canClaimTask(
  task: Pick<Task, 'status' | 'archived' | 'scheduledAt'>,
  project: Pick<Project, 'enabled' | 'deletedAt'>,
  now: string
): boolean {
  return task.status === 'queued' && !task.archived && project.enabled && project.deletedAt === null &&
    (task.scheduledAt === null || task.scheduledAt <= now)
}
