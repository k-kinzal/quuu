import type { TaskRule } from '../../../preload/api/automation.js'
import { t } from './i18n/index.js'

export type ScheduleChoice = TaskRule['frequency'] | 'cron'

export function scheduleOptions(): { value: ScheduleChoice; label: string }[] {
  return [
    { value: 'daily', label: t('taskRules.daily') },
    { value: 'weekly', label: t('taskRules.weekly') },
    { value: 'weekdays', label: t('taskRules.weekdays') },
    { value: 'none', label: t('taskRules.noFrequency') },
    { value: 'cron', label: t('taskRules.customCron') }
  ]
}

export function ruleScheduleLabel(rule: TaskRule): string {
  return rule.frequency === 'none'
    ? rule.cron || t('taskRules.noFrequency')
    : scheduleOptions().find((option) => option.value === rule.frequency)!.label
}
