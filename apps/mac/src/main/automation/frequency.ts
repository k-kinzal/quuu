/**
 * `continuous` has no period at all: it keeps the project busy by enqueuing whenever the queue
 * empties, so it always implies the idle gate (without it, it would enqueue on every tick).
 */
export type Frequency = 'none' | 'daily' | 'weekly' | 'weekdays' | 'continuous'

type IntervalFrequency = Exclude<Frequency, 'none' | 'continuous'>

export function isIntervalFrequency(value: string): value is IntervalFrequency {
  return value === 'daily' || value === 'weekly' || value === 'weekdays'
}

/** Measure elapsed time so midnight and late approval cannot produce consecutive tasks. */
export function frequencyDueAt(frequency: IntervalFrequency, lastActivityAt: string | null, now: Date): string {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const interval = (frequency === 'weekly' ? 7 : 1) * 24 * 60 * 60 * 1000
  const due = lastActivityAt ? new Date(new Date(lastActivityAt).getTime() + interval) : today

  if (frequency === 'weekdays') {
    // Overdue weekday work must not catch up on Saturday or Sunday.
    const weekdayDue = nextWeekday(due)
    return nextWeekday(weekdayDue < today ? today : weekdayDue).toISOString()
  }
  return due.toISOString()
}

function nextWeekday(date: Date): Date {
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1)
  return date
}

export function isScheduleFrequency(value: string): value is Exclude<Frequency, 'none'> {
  return isIntervalFrequency(value) || value === 'continuous'
}
