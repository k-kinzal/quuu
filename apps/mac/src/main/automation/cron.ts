/**
 * Cron expressions. Used only so an automated task can decide "when it may next enqueue".
 *
 * We have a rule against adding dependencies, so it is hand-rolled. It handles the standard five
 * fields (minute hour day month weekday) and aliases like `@daily`; no seconds, no years.
 * Everything is judged in **local time** (a human writes these off a clock, so no UTC conversion).
 */

export interface CronSpec {
  minutes: Set<number>
  hours: Set<number>
  /** Day of month (1-31). */
  days: Set<number>
  /** Month (1-12). */
  months: Set<number>
  /** Weekday (0=Sunday). */
  weekdays: Set<number>
  /** Day and weekday are **ORed when both are given** (as in standard cron). Used for that check. */
  daysRestricted: boolean
  weekdaysRestricted: boolean
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const ALIASES: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *'
}

/**
 * Where the search gives up.
 *
 * A non-matching day is skipped in one step, so five years of days plus the minutes in a day is enough.
 * An expression that never comes (`31 2 * * *`, February 31st) falls through to null here.
 */
const MAX_STEPS = 4000

/** null when it cannot be read. Validity of an expression is judged by this return value alone. */
export function parseCron(expression: string): CronSpec | null {
  const raw = expression.trim().toLowerCase()
  if (raw.length === 0) return null
  const normalized = ALIASES[raw] ?? raw

  const fields = normalized.split(/\s+/)
  if (fields.length !== 5) return null

  const minutes = parseField(fields[0], 0, 59)
  const hours = parseField(fields[1], 0, 23)
  const days = parseField(fields[2], 1, 31)
  const months = parseField(fields[3], 1, 12, MONTH_NAMES, 1)
  const weekdays = parseField(fields[4], 0, 7, DAY_NAMES, 0)
  if (!minutes || !hours || !days || !months || !weekdays) return null

  // 7 is Sunday too. Standard cron accepts both, so it is folded onto 0 before being stored
  if (weekdays.has(7)) {
    weekdays.delete(7)
    weekdays.add(0)
  }

  return {
    minutes,
    hours,
    days,
    months,
    weekdays,
    daysRestricted: fields[2] !== '*',
    weekdaysRestricted: fields[4] !== '*'
  }
}

/**
 * Turn one field into a set of values. Handles all (asterisk), a single value, a range and a step
 * (`/n`), plus any of those listed with `,`.
 * A field with `names` also accepts three-letter names (`mon`, `jan`).
 */
function parseField(
  field: string,
  min: number,
  max: number,
  names?: string[],
  nameBase = 0
): Set<number> | null {
  const out = new Set<number>()
  for (const part of field.split(',')) {
    if (part.length === 0) return null
    const [range, stepText] = part.split('/')
    if (stepText !== undefined && !/^\d+$/.test(stepText)) return null
    const step = stepText === undefined ? 1 : Number(stepText)
    if (step < 1) return null

    let from: number
    let to: number
    if (range === '*') {
      from = min
      to = max
    } else {
      const bounds = range.split('-')
      if (bounds.length > 2) return null
      const start = parseValue(bounds[0], names, nameBase)
      if (start === null) return null
      from = start
      if (bounds.length === 1) {
        // `5/15` means `5-max/15`. Without a step it is a single value
        to = stepText === undefined ? start : max
      } else {
        const end = parseValue(bounds[1], names, nameBase)
        if (end === null) return null
        to = end
      }
    }
    if (from < min || to > max || from > to) return null
    for (let v = from; v <= to; v += step) out.add(v)
  }
  return out.size > 0 ? out : null
}

function parseValue(text: string, names?: string[], nameBase = 0): number | null {
  if (/^\d+$/.test(text)) return Number(text)
  if (!names) return null
  const index = names.indexOf(text)
  return index === -1 ? null : index + nameBase
}

/**
 * The first match after `after`. null for an expression that never comes.
 *
 * For a time skipped by DST (a 2:30 that does not exist), whatever `Date` decides is returned.
 * The use only needs minute precision, so it is not chased further.
 */
export function nextCronDate(spec: CronSpec, after: Date): Date | null {
  const cursor = new Date(after.getTime())
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)

  for (let step = 0; step < MAX_STEPS; step++) {
    if (!matchesDate(spec, cursor)) {
      // A different day is skipped whole (one minute at a time would be 2.6 million steps over five years)
      cursor.setHours(0, 0, 0, 0)
      cursor.setDate(cursor.getDate() + 1)
      continue
    }
    if (!spec.hours.has(cursor.getHours())) {
      cursor.setMinutes(0, 0, 0)
      cursor.setHours(cursor.getHours() + 1)
      continue
    }
    if (!spec.minutes.has(cursor.getMinutes())) {
      cursor.setMinutes(cursor.getMinutes() + 1, 0, 0)
      continue
    }
    return new Date(cursor.getTime())
  }
  return null
}

/** Does the date (year/month/day) match? With both day and weekday given, they are ORed. */
function matchesDate(spec: CronSpec, date: Date): boolean {
  if (!spec.months.has(date.getMonth() + 1)) return false
  const dayHit = spec.days.has(date.getDate())
  const weekdayHit = spec.weekdays.has(date.getDay())
  if (spec.daysRestricted && spec.weekdaysRestricted) return dayHit || weekdayHit
  if (spec.daysRestricted) return dayHit
  if (spec.weekdaysRestricted) return weekdayHit
  return true
}

/** The next time for an expression, as ISO. null when unreadable or never coming. */
export function nextCronIso(expression: string, after: Date = new Date()): string | null {
  const spec = parseCron(expression)
  if (!spec) return null
  const next = nextCronDate(spec, after)
  return next ? next.toISOString() : null
}

export function isValidCron(expression: string): boolean {
  return parseCron(expression) !== null
}

/** Whether the schedule can repeat within one local calendar day, regardless of today's date. */
export function cronCanRepeatWithinDay(spec: CronSpec): boolean {
  if (spec.minutes.size > 1 || spec.hours.size > 1) return true
  if (!spec.daysRestricted && !spec.weekdaysRestricted) return true
  if (spec.weekdaysRestricted) {
    for (const day of spec.weekdays) {
      if (spec.weekdays.has((day + 1) % 7)) return true
    }
  }
  if (!spec.daysRestricted) return false

  // Consider both February lengths so precision does not change with leap years.
  const monthLengths = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  for (const month of spec.months) {
    const length = monthLengths[month - 1]
    for (const day of spec.days) {
      if (day > length) continue
      // Day-of-month and weekday are ORed; a matching weekday can border this date.
      if (spec.weekdaysRestricted) return true
      if (day < length && spec.days.has(day + 1)) return true
    }
    if (spec.months.has(month % 12 + 1) && spec.days.has(1) &&
      (spec.days.has(length) || (month === 2 && spec.days.has(28)))) return true
  }
  return false
}
