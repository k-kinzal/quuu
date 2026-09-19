import { describe, expect, it } from 'vitest'
import { isValidCron, nextCronIso, parseCron } from '../src/main/automation/cron.js'

/**
 * Cron expressions exist only to decide when an automatic task may next be enqueued.
 * The parser is home-grown instead of a dependency, so misreadings get stopped here.
 */

/** Build in local time (expressions are interpreted in local time). */
function local(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

function next(expr: string, from: Date): Date | null {
  const iso = nextCronIso(expr, from)
  return iso ? new Date(iso) : null
}

describe('cron expressions', () => {
  it('daily at 3:00 rolls to the next day once 3 AM has passed', () => {
    expect(next('0 3 * * *', local(2026, 8, 19, 1, 0))).toEqual(local(2026, 8, 19, 3, 0))
    expect(next('0 3 * * *', local(2026, 8, 19, 3, 0))).toEqual(local(2026, 8, 20, 3, 0))
    expect(next('0 3 * * *', local(2026, 8, 19, 23, 59))).toEqual(local(2026, 8, 20, 3, 0))
  })

  it('reads steps (*/15) and lists (1,2)', () => {
    expect(next('*/15 * * * *', local(2026, 8, 19, 10, 1))).toEqual(local(2026, 8, 19, 10, 15))
    expect(next('0 9,18 * * *', local(2026, 8, 19, 10, 0))).toEqual(local(2026, 8, 19, 18, 0))
  })

  it('weekdays can be written by name', () => {
    // 2026-08-19 is a Wednesday; the next Monday is the 24th
    expect(next('0 0 * * mon', local(2026, 8, 19, 12, 0))).toEqual(local(2026, 8, 24, 0, 0))
    expect(next('0 0 * * 1', local(2026, 8, 19, 12, 0))).toEqual(local(2026, 8, 24, 0, 0))
  })

  it('specifying both day-of-month and weekday means OR (same as standard cron)', () => {
    // The 1st, or a Friday. From the 19th (Wed) the next match is the 21st (Fri)
    expect(next('0 0 1 * fri', local(2026, 8, 19, 12, 0))).toEqual(local(2026, 8, 21, 0, 0))
    // With only one of them specified, only that condition applies
    expect(next('0 0 1 * *', local(2026, 8, 19, 12, 0))).toEqual(local(2026, 9, 1, 0, 0))
  })

  it('accepts aliases (@daily)', () => {
    expect(next('@daily', local(2026, 8, 19, 12, 0))).toEqual(local(2026, 8, 20, 0, 0))
    expect(next('@hourly', local(2026, 8, 19, 12, 30))).toEqual(local(2026, 8, 19, 13, 0))
  })

  it('an unreadable expression is null (the grounds for refusing to save)', () => {
    expect(parseCron('')).toBeNull()
    expect(parseCron('0 3 * *')).toBeNull()
    expect(parseCron('60 * * * *')).toBeNull()
    expect(parseCron('* * * * 8')).toBeNull()
    expect(parseCron('毎日')).toBeNull()
    expect(isValidCron('0 3 * * *')).toBe(true)
  })

  it('an expression that never fires returns no next time (never create an unbounded search)', () => {
    // February 31st
    expect(next('0 0 31 2 *', local(2026, 8, 19))).toBeNull()
  })
})
