import { describe, expect, it } from 'vitest'
import { limitLiftsAt } from '../src/main/agent-adapters/limitWindow.js'

/**
 * Reading a limit's own statement of when it lifts.
 *
 * The times CLIs print carry no zone, so everything here is built with local-time constructors -
 * the same reading a human on that machine would make.
 */
function local(year: number, month: number, day: number, hour: number, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString()
}

describe('when a limit lifts', () => {
  const now = new Date(2026, 8, 18, 11, 16, 0, 0) // 2026-09-18 11:16 local

  it('reads the date and time Codex prints', () => {
    const out = "ERROR: You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage" +
      ' to purchase more credits or try again at Sep 19th, 2026 7:13 PM.'
    expect(limitLiftsAt(out, now)).toBe(local(2026, 9, 19, 19, 13))
  })

  it('reads the date joined to the clock with at in a Claude weekly limit', () => {
    const out = "You've hit your weekly limit · resets Sep 28 at 7pm (Asia/Tokyo)"
    expect(limitLiftsAt(out, now)).toBe(local(2026, 9, 28, 19))
    expect(limitLiftsAt('resets September 28, 2026 at 7:30 PM', now))
      .toBe(local(2026, 9, 28, 19, 30))
  })

  it('reads a bare clock time as the next time that clock comes round', () => {
    expect(limitLiftsAt('Claude usage limit reached. Your limit will reset at 3pm', now))
      .toBe(local(2026, 9, 18, 15))
    // 9am has already gone by today, so it means tomorrow's
    expect(limitLiftsAt('5-hour limit reached ∙ resets 9am', now)).toBe(local(2026, 9, 19, 9))
  })

  it('reads the 24-hour and machine-date notations', () => {
    expect(limitLiftsAt('rate limited, retry at 19:13', now)).toBe(local(2026, 9, 18, 19, 13))
    expect(limitLiftsAt('quota exhausted, try again at 2026-09-20 07:00', now))
      .toBe(local(2026, 9, 20, 7))
  })

  it('reads a wait written as a duration', () => {
    expect(limitLiftsAt('Too many requests. Try again in 30 minutes', now))
      .toBe(new Date(now.getTime() + 30 * 60_000).toISOString())
    expect(limitLiftsAt('usage limit; retry after 2h 15m', now))
      .toBe(new Date(now.getTime() + (2 * 60 + 15) * 60_000).toISOString())
  })

  it('takes the earliest moment still ahead when the output says several times', () => {
    // Codex prints its ERROR line twice, and the tail may still hold an older attempt
    const out = 'try again at Sep 20th, 2026 7:13 PM\ntry again at Sep 19th, 2026 7:13 PM\n'
    expect(limitLiftsAt(out, now)).toBe(local(2026, 9, 19, 19, 13))
  })

  it('ignores a moment that has already gone by', () => {
    expect(limitLiftsAt('try again at Sep 17th, 2026 7:13 PM', now)).toBeNull()
  })

  it('says nothing when the output never named a time', () => {
    expect(limitLiftsAt("You've hit your usage limit.\ntokens used\n1,888,438", now)).toBeNull()
    // A bare number after the cue is not a time
    expect(limitLiftsAt('try again at 4', now)).toBeNull()
    expect(limitLiftsAt('', now)).toBeNull()
  })

  it('rolls a year-less date that has gone by into next year', () => {
    expect(limitLiftsAt('try again at Jan 4th 7:13 PM', now)).toBe(local(2027, 1, 4, 19, 13))
  })
})
