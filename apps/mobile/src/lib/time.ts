import { t } from '../model/i18n/index.js'

/**
 * Says "when", briefly.
 *
 * List rows are hard to read when positions shift with digit count, so **a shape whose
 * width barely changes** is used. No absolute time, because reading this in the bath or
 * in bed, all anyone needs is "just now, or yesterday".
 */
export function relative(iso: string, now: number = Date.now()): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '—'
  const sec = Math.max(0, Math.round((now - ms) / 1000))
  if (sec < 60) return t('time.justNow')
  const min = Math.round(sec / 60)
  if (min < 60) return t('time.minutesAgo', { count: min })
  const hour = Math.round(min / 60)
  if (hour < 24) return t('time.hoursAgo', { count: hour })
  const day = Math.round(hour / 24)
  if (day < 30) return t('time.daysAgo', { count: day })
  return new Date(ms).toLocaleDateString()
}
