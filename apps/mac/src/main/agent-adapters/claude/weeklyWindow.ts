/**
 * When a limit on **one model** lifts, worked out from the week it belongs to.
 *
 * "You've reached your Fable limit. Switch to another model, or manage usage credits at
 * claude.ai/settings/usage, to continue." is the whole of it. Claude Code builds that sentence
 * without a moment in it - there is nothing in the output to read, however well
 * [limitWindow.ts](limitWindow.ts) reads. The account is not out; that one model's share is, and
 * the share is a slice of the **weekly** allowance. Anthropic states when that week turns on the
 * usage screen only, and nothing carries it to the CLI.
 *
 * What is certain is its shape. A weekly allowance resets on one weekday and hour fixed per
 * account, so every turn is exactly seven days after the last one. Quuu has watched those turns
 * happen: a limit of this shape followed by a run that went through brackets one - the model was
 * out at the first moment and back by the second. That second moment plus whole weeks is the next
 * turn, and it is the only figure here taken from evidence rather than guessed.
 *
 * What it replaces is the configured cooldown, fifteen minutes by default. A weekly wall does not
 * move for up to seven days, and a quarter-hour guess against it puts the task back in the queue
 * ninety-six times a day - each one taking the project's slot, dying in seconds, and spending one
 * of the task's five attempts, until it is handed to a human who can do nothing until the week
 * turns.
 */

import type { RunOutcome } from '../../execution/types.js'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/**
 * A limit on one model rather than on the account: "You've reached your **Fable** limit."
 *
 * The model's name is what tells it apart from "You've reached your usage limit", which is the
 * account's own five-hour window - a different length of wait entirely, and one that always prints
 * the moment it lifts. A model is a proper noun and those windows are not, so the capital is the
 * test, with the common nouns a message may still capitalize ruled out by name.
 */
const MODEL_LIMIT = /reached your ([A-Z][\w.+-]*) limit/
const NOT_A_MODEL = new Set([
  'Usage', 'Weekly', 'Daily', 'Monthly', 'Hourly', 'Rate', 'Session', 'Account', 'Plan', 'Team',
  'Spend', 'Credit', 'Credits', 'Organization', 'Token', 'Context'
])

/** Does that message say one model is spent, rather than the account? */
export function isModelLimit(message: string): boolean {
  const named = MODEL_LIMIT.exec(message)
  return named !== null && !NOT_A_MODEL.has(named[1])
}

/** A turn of the week Quuu watched happen: out at `limited`, back by `back`. */
interface ObservedTurn {
  limited: number
  back: number
}

/**
 * The next turn of that agent's week, as an ISO string. null while nothing has been watched yet.
 *
 * Takes the agent's runs newest first - the order the store lists them in. Until a turn has been
 * watched the answer is honestly nothing, and the caller falls back to the configured cooldown:
 * probing every quarter of an hour is what buys the first observation, and every later week is
 * predicted off it.
 */
export function weeklyLimitLiftsAt(
  history: readonly RunOutcome[],
  now: Date = new Date()
): string | null {
  const turn = lastObservedTurn(history)
  if (turn === null) return null

  let at = anchor(turn)
  while (at <= now.getTime()) at += WEEK_MS

  // A run that died at the very moment this said the week would turn is that prediction being
  // proved wrong. Answering with another seven days on the same evidence would idle the model for
  // a week, so it goes back to finding out. (The anchor itself is a run that went through, not a
  // prediction, so there is nothing to disprove on the first week after it.)
  const previous = at - WEEK_MS
  if (previous > turn.back && limitedWithinHourAfter(history, previous)) return null

  return new Date(at).toISOString()
}

/**
 * The moment the week turns, read off one observation.
 *
 * A weekly allowance resets on the hour, and the observation is only as sharp as whenever Quuu
 * happened to try again, so the hour it landed in is a better reading of the turn than the minute
 * it was noticed at. Never earlier than the run that was still walled, which is the one thing
 * about the turn that is known rather than rounded.
 */
function anchor(turn: ObservedTurn): number {
  const onTheHour = Math.floor(turn.back / HOUR_MS) * HOUR_MS
  return Math.max(onTheHour, turn.limited)
}

/**
 * The most recent turn in the history: a model limit, then a run that went through.
 *
 * Only a run that succeeded counts as being back. A failure or a timeout says the CLI ran, not
 * that the model answered, and a turn read off one of those would set every later prediction wrong.
 */
function lastObservedTurn(history: readonly RunOutcome[]): ObservedTurn | null {
  let limited: number | null = null
  let turn: ObservedTurn | null = null
  // Oldest first: a turn is a pair in time order, and the store lists runs newest first
  for (let i = history.length - 1; i >= 0; i--) {
    const run = history[i]
    const at = Date.parse(run.startedAt)
    if (Number.isNaN(at)) continue
    if (run.status === 'limited') {
      if (isModelLimit(run.errorMessage)) limited = at
      continue
    }
    if (run.status !== 'succeeded' || limited === null) continue
    // Wider than the week itself, and the pair no longer says where in the week the turn was
    if (at - limited <= WEEK_MS) turn = { limited, back: at }
    limited = null
  }
  return turn
}

/** Did a limit of the same shape land in the hour after that moment? */
function limitedWithinHourAfter(history: readonly RunOutcome[], at: number): boolean {
  return history.some((run) => {
    if (run.status !== 'limited' || !isModelLimit(run.errorMessage)) return false
    const started = Date.parse(run.startedAt)
    return !Number.isNaN(started) && started >= at && started < at + HOUR_MS
  })
}
