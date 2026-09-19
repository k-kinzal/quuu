import { describe, expect, it } from 'vitest'
import { TASK_STATUSES } from '../src/main/tasks/status.js'
import type { TaskStatus } from '../src/main/tasks/status.js'
import { STATUS_ORDER, groupByStatus } from '../src/renderer/src/model/statusGroups.js'

/**
 * Group order. Pins that **Mac and iPhone show the same order**.
 *
 * If this differs per device, what sat at the top on the Mac is down below
 * on the iPhone. The sense of looking at the same product collapses on
 * that one point.
 */
describe('status groups', () => {
  it('ordered by how much they need a human hand', () => {
    expect(STATUS_ORDER).toEqual([
      'review',
      'failed',
      'running',
      'queued',
      'held',
      'draft',
      'done'
    ])
  })

  it('every status has a place (no task falls out of the groups)', () => {
    expect([...STATUS_ORDER].sort()).toEqual([...TASK_STATUSES].sort())
  })
})

describe('cutting into groups', () => {
  const task = (id: string, status: TaskStatus): { id: string; status: TaskStatus } => ({
    id,
    status
  })

  it('creates no empty groups', () => {
    const groups = groupByStatus([task('a', 'queued'), task('b', 'review')])
    expect(groups.map((g) => g.status)).toEqual(['review', 'queued'])
  })

  it('order within a group is the order given (no double sorting)', () => {
    const groups = groupByStatus([
      task('1', 'queued'),
      task('2', 'review'),
      task('3', 'queued'),
      task('4', 'review')
    ])
    expect(groups.map((g) => g.tasks.map((t) => t.id))).toEqual([
      ['2', '4'],
      ['1', '3']
    ])
  })

  it('drops nothing', () => {
    const tasks = TASK_STATUSES.map((s, i) => task(String(i), s))
    const groups = groupByStatus(tasks)
    expect(groups.flatMap((g) => g.tasks)).toHaveLength(tasks.length)
  })
})
