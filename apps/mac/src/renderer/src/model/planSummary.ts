import type { PlanStep } from '../../../preload/api/session.js'
import { t } from './i18n/index.js'

export function summarizePlan(steps: PlanStep[]): string | null {
  if (steps.length === 0) return null
  const active = steps.find((s) => s.status === 'in_progress') ?? steps.find((s) => s.text)
  const done = steps.filter((s) => s.status === 'completed').length
  return t('planSummary.progress', {
    text: active?.text ?? t('planSummary.steps', { count: steps.length }),
    done,
    total: steps.length
  })
}
