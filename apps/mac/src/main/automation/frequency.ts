export type Frequency = 'none' | 'daily' | 'weekly' | 'weekdays'

export function isCalendarFrequency(value: string): value is Exclude<Frequency, 'none'> {
  return value === 'daily' || value === 'weekly' || value === 'weekdays'
}

/** Calendar periods follow the Mac's local date, including changes in UTC offset. */
export function frequencyDueAt(frequency: Exclude<Frequency, 'none'>, lastEnqueuedAt: string | null, now: Date): string {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (frequency === 'weekly') start.setDate(start.getDate() - (start.getDay() + 6) % 7)

  const last = lastEnqueuedAt ? new Date(lastEnqueuedAt) : null
  if (last && last >= start) {
    // A clock moved backwards must not let the same period enqueue again.
    start.setTime(last.getTime())
    start.setHours(0, 0, 0, 0)
    if (frequency === 'weekly') start.setDate(start.getDate() - (start.getDay() + 6) % 7)
    start.setDate(start.getDate() + (frequency === 'weekly' ? 7 : 1))
  }
  if (frequency === 'weekdays') {
    while (start.getDay() === 0 || start.getDay() === 6) start.setDate(start.getDate() + 1)
  }
  return start.toISOString()
}

export function frequencyReady(rule: { frequency: Frequency; lastEnqueuedAt: string | null }, now: Date): boolean {
  return isCalendarFrequency(rule.frequency) && frequencyDueAt(rule.frequency, rule.lastEnqueuedAt, now) <= now.toISOString()
}
