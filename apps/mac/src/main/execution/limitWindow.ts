/**
 * When a usage limit lifts, read out of what the CLI printed.
 *
 * A limit is not a failure retrying fixes: the account is away until a stated moment, and every CLI
 * states it. Codex prints "try again at Sep 19th, 2026 7:13 PM", Claude "your limit will reset at
 * 3pm". Throwing that away and guessing a fixed cooldown is what turns one limit into a retry every
 * quarter hour, each of which takes the project's slot, dies in seconds, and spends one of the
 * task's attempts on an account that cannot answer for another day.
 *
 * The times CLIs print carry no zone (the parenthetical "(Asia/Tokyo)" Claude adds is the machine's
 * own), so they are read as local time - the same clock the human reading that line is on.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * The phrases that come right before the moment: "try again at", "resets 3pm", "will reset in".
 *
 * Global, because the line is often printed more than once and the tail may hold older attempts.
 */
const CUE = /(?:try again|retry|available again|(?:will\s+)?resets?)\s*(?:at|in|after|on)?\s+/gi

/** Durations: "4 hours", "2h 15m", "90 seconds". */
const DURATION = /^(\d+)\s*(d(?:ays?)?|h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)(?![a-z])/i

/** A date ahead of the time: "Sep 19th, 2026", "September 19". The year is optional. */
const NAMED_DATE = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})?[\s,]*/i

/** The same thing written as a machine date: "2026-09-19 19:13". */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})[T\s]+/

/** "7:13 PM", "3pm", "19:13". A bare number with neither colon nor meridiem is not a time. */
const CLOCK = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?/i

/**
 * The moment the limit lifts, as an ISO string. null when the output never said.
 *
 * Of several statements, the **earliest still in the future** wins. Reading it too early costs one
 * retry that fails in seconds; reading it too late leaves the account idle for hours.
 */
export function limitLiftsAt(output: string, now: Date = new Date()): string | null {
  CUE.lastIndex = 0
  let earliest: number | null = null
  for (let cue = CUE.exec(output); cue !== null; cue = CUE.exec(output)) {
    const at = parseMoment(output.slice(cue.index + cue[0].length), now)
    if (at === null || at <= now.getTime()) continue
    if (earliest === null || at < earliest) earliest = at
  }
  return earliest === null ? null : new Date(earliest).toISOString()
}

/** Whichever of the two notations the text is in. A duration is relative to `now`. */
function parseMoment(text: string, now: Date): number | null {
  const after = parseDuration(text)
  if (after !== null) return now.getTime() + after
  return parseClockTime(text, now)
}

function unitMs(unit: string): number {
  switch (unit[0].toLowerCase()) {
    case 'd': return 86_400_000
    case 'h': return 3_600_000
    case 'm': return 60_000
    default: return 1000
  }
}

function parseDuration(text: string): number | null {
  let cursor = text
  let total = 0
  let found = false
  for (;;) {
    const m = DURATION.exec(cursor)
    if (!m) break
    found = true
    total += Number(m[1]) * unitMs(m[2])
    // "2h and 15m" and "2h, 15m" are the same reading, so the joiner is skipped either way
    cursor = cursor.slice(m[0].length).replace(/^(?:\s|,|and\b)*/i, '')
  }
  return found ? total : null
}

interface CalendarDate {
  year: number
  month: number
  day: number
  rest: string
}

function parseDate(text: string, now: Date): CalendarDate | null {
  const iso = ISO_DATE.exec(text)
  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]) - 1,
      day: Number(iso[3]),
      rest: text.slice(iso[0].length)
    }
  }
  const named = NAMED_DATE.exec(text)
  if (!named) return null
  const month = MONTHS.indexOf(named[1].slice(0, 3).toLowerCase())
  if (month < 0) return null
  const day = Number(named[2])
  if (day < 1 || day > 31) return null
  return {
    // A limit never lifts in the past, so a year-less date that already went by means next year
    year: named[3] ? Number(named[3]) : yearFor(month, day, now),
    month,
    day,
    rest: text.slice(named[0].length)
  }
}

function yearFor(month: number, day: number, now: Date): number {
  const thisYear = now.getFullYear()
  return new Date(thisYear, month, day, 23, 59, 59).getTime() < now.getTime() ? thisYear + 1 : thisYear
}

function parseClockTime(text: string, now: Date): number | null {
  const date = parseDate(text, now)
  const m = CLOCK.exec(date ? date.rest : text)
  if (!m) return null
  const meridiem = m[3]?.toLowerCase()
  // Without a meridiem, only the "19:13" form is a time. "reset in 4" says nothing on its own
  if (m[2] === undefined && !meridiem) return null

  let hour = Number(m[1])
  const minute = m[2] === undefined ? 0 : Number(m[2])
  if (minute > 59) return null
  if (meridiem) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0)
  } else if (hour > 23) return null

  if (date) return new Date(date.year, date.month, date.day, hour, minute, 0, 0).getTime()

  // A bare clock time means the next time that clock comes round
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0)
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1)
  return at.getTime()
}
