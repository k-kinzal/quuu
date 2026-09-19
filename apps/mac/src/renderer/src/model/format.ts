import { t } from './i18n/index.js'

/** Relative time. Past a day, switch to an absolute time. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return '—'

  const diff = Math.max(0, now - parsed)
  const sec = Math.floor(diff / 1000)
  if (sec < 10) return t('format.justNow')
  if (sec < 60) return t('format.secondsAgo', { count: sec })
  const min = Math.floor(sec / 60)
  if (min < 60) return t('format.minutesAgo', { count: min })
  const hour = Math.floor(min / 60)
  if (hour < 24) return t('format.hoursAgo', { count: hour })
  return absoluteTime(iso)
}

export function absoluteTime(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd} ${clockTime(iso)}`
}

export function clockTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * A clock time, gaining the date once it falls outside today.
 *
 * For anything that is waited on, "19:13" alone reads as "soon". A limit that lifts tomorrow
 * evening and one that lifts in twenty minutes must not look the same.
 */
export function clockOrDate(iso: string, now = Date.now()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toDateString() === new Date(now).toDateString() ? clockTime(iso) : absoluteTime(iso)
}

/** Run duration, computed from startedAt / endedAt. */
export function duration(startedAt: string, endedAt: string | null, now = Date.now()): string {
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) return '—'
  const end = endedAt ? Date.parse(endedAt) : now
  const sec = Math.max(0, Math.floor((end - start) / 1000))
  if (sec < 60) return t('format.durationSeconds', { seconds: sec })
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  if (min < 60) return t('format.durationMinutes', { minutes: min, seconds: String(rem).padStart(2, '0') })
  const hour = Math.floor(min / 60)
  return t('format.durationHours', { hours: hour, minutes: String(min % 60).padStart(2, '0') })
}

/** In paths and commands the tail carries more information, so elide the middle. */
export function middleTruncate(text: string, max: number): string {
  if (text.length <= max) return text
  const head = Math.ceil((max - 1) / 2)
  const tail = Math.floor((max - 1) / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}

export function homeRelative(path: string, home = '/Users'): string {
  const match = new RegExp(`^${home}/[^/]+`).exec(path)
  return match ? `~${path.slice(match[0].length)}` : path
}

export function shortSession(sessionId: string): string {
  return sessionId.slice(0, 8)
}

export function formatArgs(args: string[]): string {
  return args.map((a) => (/[\s"'$`\\]/.test(a) ? JSON.stringify(a) : a)).join(' ')
}
