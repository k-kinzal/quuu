/** Normalize a CLI-specific plan format into items the display can take. Wording is assembled by the View. */
import type { PlanStep } from './types.js'
export type { PlanStep } from './types.js'

/** Pull the items out of a plan written as named values (`{todos:[...]}`, `{plan:[...]}`). */
export function readPlanSteps(input: unknown): PlanStep[] {
  if (!input || typeof input !== 'object') return []
  const record = input as Record<string, unknown>
  const items = [record.plan, record.todos, record.steps].find(Array.isArray)
  if (!items) return []

  return items
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      text:
        [item.step, item.content, item.activeForm, item.title].find(
          (v): v is string => typeof v === 'string' && v.length > 0
        ) ?? null,
      status: typeof item.status === 'string' ? item.status : ''
    }))
}
