import { describe, expect, it } from 'vitest'
import { canEnqueueRule, ruleDueState, orderTaskRules } from '../src/main/automation/conditions.js'
import type { TaskRule } from '../src/main/automation/conditions.js'

describe('automatic task gates', () => {
  it('enqueues only when both the idle and the duplicate conditions are satisfied', () => {
    expect(canEnqueueRule({ whenIdle: true }, 0, 0)).toBe(true)
    expect(canEnqueueRule({ whenIdle: true }, 1, 0)).toBe(false)
    expect(canEnqueueRule({ whenIdle: false }, 1, 0)).toBe(true)
    expect(canEnqueueRule({ whenIdle: false }, 0, 1)).toBe(false)
  })
  it('never loses an overdue occurrence, and distinguishes a missing due time from invalid syntax', () => {
    const now = '2026-09-06T12:00:00.000Z'
    expect(ruleDueState({ cron: '', dueAt: null }, now, false)).toBe('ready')
    expect(ruleDueState({ cron: '0 3 * * *', dueAt: null }, now, true)).toBe('arm')
    expect(ruleDueState({ cron: 'invalid', dueAt: null }, now, false)).toBe('invalid')
    expect(ruleDueState({ cron: '0 3 * * *', dueAt: now }, now, true)).toBe('ready')
    expect(ruleDueState({ cron: '0 3 * * *', dueAt: '2026-09-07T00:00:00.000Z' }, now, true)).toBe('waiting')
  })
  it('one rule in a project does not keep enqueueing while others starve', () => {
    const rule = (id: string, lastEnqueuedAt: string | null, sortOrder: number): TaskRule => ({
      id, projectId: 'p', name: id, prompt: '', priority: 2, agentOverrideId: null,
      whenIdle: true, cron: '', frequency: 'none', blockStatuses: [], enabled: true, dueAt: null,
      lastEnqueuedAt, sortOrder, createdAt: '', updatedAt: ''
    })
    expect(orderTaskRules([rule('a', '2026-09-06', 0), rule('b', null, 1)]).map((r) => r.id)).toEqual(['b', 'a'])
  })
})
