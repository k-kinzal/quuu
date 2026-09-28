import { describe, expect, it } from 'vitest'
import type { RunOutcome } from '../src/main/execution/types.js'
import { weeklyLimitLiftsAt } from '../src/main/agent-adapters/claude/weeklyWindow.js'
import { adapterFor } from '../src/main/agent-adapters/registry.js'

/**
 * Working out when a limit on one model lifts, from the week it belongs to.
 *
 * Claude Code prints "You've reached your Fable limit. Switch to another model" and no moment,
 * because that model's share is a slice of the weekly allowance and only the usage screen says
 * when the week turns. Quuu watches the turn instead: a limit of that shape, then a run that went
 * through.
 */

const FABLE_LIMIT =
  "You've reached your Fable limit. Switch to another model, or manage usage credits at" +
  ' claude.ai/settings/usage?from=cc_cli_limit_message, to continue.'

function at(iso: string, status: RunOutcome['status'], errorMessage = ''): RunOutcome {
  return { status, errorMessage, startedAt: iso }
}

/** Newest first, the order the store lists an agent's runs in. */
function history(...runs: RunOutcome[]): RunOutcome[] {
  return [...runs].reverse()
}

describe('telling a model limit from the account being out', () => {
  const scope = (message: string): unknown => adapterFor('claude').limitScope(message)

  it('reads the model named in the message', () => {
    expect(scope(FABLE_LIMIT)).toEqual({ kind: 'model', model: 'Fable' })
    expect(scope("You've reached your Opus limit. Switch to another model.")).toEqual({ kind: 'model', model: 'Opus' })
  })

  it('leaves the account-wide windows alone, which name their own moment', () => {
    expect(scope('Claude usage limit reached. Your limit will reset at 3pm')).toEqual({ kind: 'account' })
    expect(scope("You've reached your weekly usage limit")).toEqual({ kind: 'account' })
    expect(scope("You've hit your usage limit. Try again at Sep 19th, 2026 7:13 PM")).toEqual({ kind: 'account' })
  })

  it('names no allowance for an overload, which passes and may be one model\'s trouble', () => {
    expect(scope('API Error: 529 Overloaded. This is a server-side issue')).toEqual({ kind: 'unstated' })
    expect(scope('API Error: 429 rate limit exceeded')).toEqual({ kind: 'unstated' })
  })
})

describe('when a limit on one model lifts', () => {
  const now = new Date('2026-09-23T04:30:00.000Z') // Wednesday

  it('says nothing until it has watched the week turn once', () => {
    // The first wall of all: probing on the configured cooldown is what buys the observation
    expect(weeklyLimitLiftsAt(history(at('2026-09-19T07:56:00.000Z', 'limited', FABLE_LIMIT)), 'Fable', now))
      .toBeNull()
    expect(weeklyLimitLiftsAt([], 'Fable', now)).toBeNull()
  })

  it('answers seven days after the turn it watched', () => {
    const runs = history(
      at('2026-09-19T07:56:00.000Z', 'limited', FABLE_LIMIT),
      at('2026-09-22T05:12:00.000Z', 'succeeded'), // Monday: back
      at('2026-09-23T04:00:00.000Z', 'limited', FABLE_LIMIT) // spent again, mid-week
    )
    // Monday 05:12 is when it was noticed; the allowance turned on the hour it landed in
    expect(weeklyLimitLiftsAt(runs, 'Fable', now)).toBe('2026-09-29T05:00:00.000Z')
  })

  it('never reads the turn as earlier than a run that was still walled', () => {
    const runs = history(
      at('2026-09-22T05:40:00.000Z', 'limited', FABLE_LIMIT),
      at('2026-09-22T05:48:00.000Z', 'succeeded')
    )
    // Rounding to 05:00 would claim it was back while it was demonstrably still out
    expect(weeklyLimitLiftsAt(runs, 'Fable', now)).toBe('2026-09-29T05:40:00.000Z')
  })

  it('keeps stepping by weeks until the answer is ahead of now', () => {
    const runs = history(
      at('2026-08-31T09:10:00.000Z', 'limited', FABLE_LIMIT),
      at('2026-09-01T02:00:00.000Z', 'succeeded')
    )
    // Three weeks of nobody running it does not make the turn three weeks old
    expect(weeklyLimitLiftsAt(runs, 'Fable', now)).toBe('2026-09-29T02:00:00.000Z')
  })

  it('ignores a turn nobody was there to see', () => {
    const runs = history(
      at('2026-09-01T09:10:00.000Z', 'limited', FABLE_LIMIT),
      at('2026-09-20T02:00:00.000Z', 'succeeded') // nineteen days later
    )
    // A gap wider than the week itself says nothing about where in the week it turned
    expect(weeklyLimitLiftsAt(runs, 'Fable', now)).toBeNull()
  })

  it('does not read the account being out, or a run that merely failed, as the turn', () => {
    const other = history(
      at('2026-09-21T09:10:00.000Z', 'limited', 'Claude usage limit reached. Resets at 3pm'),
      at('2026-09-21T15:02:00.000Z', 'succeeded')
    )
    expect(weeklyLimitLiftsAt(other, 'Fable', now)).toBeNull()

    const failed = history(
      at('2026-09-22T05:12:00.000Z', 'limited', FABLE_LIMIT),
      at('2026-09-22T06:00:00.000Z', 'failed', 'exit code 1')
    )
    expect(weeklyLimitLiftsAt(failed, 'Fable', now)).toBeNull()
  })

  it('reads only that model\'s own limits, not another model\'s week', () => {
    const runs = history(
      at('2026-09-19T07:56:00.000Z', 'limited', "You've reached your Opus limit. Switch to another model."),
      at('2026-09-22T05:12:00.000Z', 'succeeded')
    )
    expect(weeklyLimitLiftsAt(runs, 'Fable', now)).toBeNull()
    expect(weeklyLimitLiftsAt(runs, 'Opus', now)).toBe('2026-09-29T05:00:00.000Z')
  })

  it('goes back to finding out when the week it predicted did not turn', () => {
    const runs = history(
      at('2026-09-08T07:56:00.000Z', 'limited', FABLE_LIMIT),
      at('2026-09-15T05:12:00.000Z', 'succeeded'), // the turn it watched, a Tuesday
      at('2026-09-20T03:00:00.000Z', 'limited', FABLE_LIMIT),
      at('2026-09-22T05:00:00.000Z', 'limited', FABLE_LIMIT) // waited for the turn; still walled
    )
    // Another seven days on evidence that just failed would idle the model for a week
    expect(weeklyLimitLiftsAt(runs, 'Fable', now)).toBeNull()
  })

  it('still predicts when the limit came round again later in the same week', () => {
    const runs = history(
      at('2026-09-15T05:12:00.000Z', 'limited', FABLE_LIMIT),
      at('2026-09-21T03:00:00.000Z', 'limited', FABLE_LIMIT),
      at('2026-09-22T09:00:00.000Z', 'succeeded'), // the week turned, and it was watched
      at('2026-09-23T04:00:00.000Z', 'limited', FABLE_LIMIT) // spent again a day later
    )
    expect(weeklyLimitLiftsAt(runs, 'Fable', now)).toBe('2026-09-29T09:00:00.000Z')
  })
})
