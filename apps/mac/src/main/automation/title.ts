import type { TaskRule } from './conditions.js'
import { cronCanRepeatWithinDay, parseCron } from './cron.js'

export function taskRuleTitle(rule: Pick<TaskRule, 'name' | 'frequency' | 'cron'>, now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const date = `${String(now.getFullYear()).padStart(4, '0')}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`
  const spec = rule.cron.trim() ? parseCron(rule.cron) : null
  // Without a time gate, idle/duplicate conditions may permit several tasks in a day.
  const includeTime = rule.frequency === 'daily' || rule.frequency === 'weekdays' ||
    (rule.frequency === 'none' && (!spec || cronCanRepeatWithinDay(spec)))
  const suffix = includeTime
    ? `${date} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    : date
  return `${rule.name} ${suffix}`
}
