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

function ruleConditionParts(rule: TaskRule): string[] {
  const parts: string[] = []
  if (rule.whenIdle) parts.push(t('taskRules.whenIdle'))
  if (rule.blockStatuses.length > 0) parts.push(t('taskRules.noDuplicates'))
  return parts
}

/** Conditions only, for the project's table where frequency has its own column. */
export function ruleConditionLabel(rule: TaskRule): string {
  return ruleConditionParts(rule).join(' · ') || t('taskRules.always')
}

/** Every configured gate, without a placeholder for an omitted frequency. */
export function ruleSummaryLabel(rule: TaskRule): string {
  const parts = ruleConditionParts(rule)
  if (rule.frequency !== 'none' || rule.cron) parts.unshift(ruleScheduleLabel(rule))
  return parts.join(' · ') || t('taskRules.always')
}

/** The unabridged conditions remain available even when the list column truncates. */
export function ruleSummaryDetail(rule: TaskRule): string {
  const parts: string[] = []
  if (rule.frequency !== 'none' || rule.cron) parts.push(ruleScheduleLabel(rule))
  if (rule.whenIdle) parts.push(t('taskRules.idleDetail'))
  if (rule.blockStatuses.length > 0) parts.push(t('taskRules.duplicatesDetail', {
    statuses: rule.blockStatuses.map((status) => t(`taskStatus.${status}`)).join(' / ')
  }))
  if (!rule.enabled) parts.push(t('taskRules.disabledBadge'))
  return parts.join(' · ') || t('taskRules.always')
}
