import { describe, expect, it } from 'vitest'
import type { TaskRule, TaskRuleInput } from '../src/main/automation/conditions.js'
import type { TaskStatus } from '../src/main/tasks/status.js'
import { OPEN_STATUSES } from '../src/main/tasks/status.js'

import * as repo from '../src/main/db/repo.js'
import { enqueueRuleNow, nextDueAt, runTaskRules } from '../src/main/automation/evaluate.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { makeAgent, makeProject, makeTask, memoryDb, occupy, reviewed } from './helpers.js'
import type { Db } from '../src/main/db/database.js'

/**
 * Automatic tasks. When the conditions line up, one task gets queued.
 *
 * All that is checked is **whether it queues or not**. What gets queued is an ordinary task, so
 * pickup, execution and review all ride the existing paths.
 */

function makeRule(
  db: Db,
  projectId: string,
  over: Partial<TaskRuleInput> & { dueAt?: string | null } = {}
): TaskRule {
  return repo.insertTaskRule(db, {
    projectId,
    name: over.name ?? 'Issue を消化する',
    prompt: over.prompt ?? 'Issue を 1 つ選んで片付ける',
    priority: over.priority ?? 2,
    agentOverrideId: over.agentOverrideId ?? null,
    whenIdle: over.whenIdle ?? false,
    cron: over.cron ?? '',
    frequency: over.frequency ?? 'none',
    blockStatuses: over.blockStatuses ?? [],
    enabled: over.enabled ?? true,
    sortOrder: over.sortOrder ?? 0,
    dueAt: over.dueAt ?? null
  })
}

function setup(): { db: Db; project: string; agent: string } {
  const db = memoryDb()
  const agent = makeAgent(db, { name: 'a', concurrency: 4 })
  const project = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 4 })
  return { db, project, agent }
}

describe('automatic tasks - what gets queued', () => {
  it('queues as a waiting task and carries over the prompt, the priority and the agent choice', () => {
    const { db, project, agent } = setup()
    makeRule(db, project, {
      name: 'Issue を消化する',
      prompt: 'gh issue list から 1 つ選んで直す',
      priority: 1,
      agentOverrideId: agent,
      blockStatuses: [...OPEN_STATUSES]
    })

    const { created } = runTaskRules(db, new Date(2026, 0, 5, 6, 7, 8))
    expect(created).toHaveLength(1)

    const task = repo.getTask(db, created[0].id)!
    expect(task.status).toBe('queued')
    expect(task.title).toBe('Issue を消化する 2026/01/05 06:07:08')
    expect(task.prompt).toBe('gh issue list から 1 つ選んで直す')
    expect(task.priority).toBe(1)
    expect(task.agentOverrideId).toBe(agent)
    // Where it came from stays visible (both the duplicate check and the display read this marker)
    expect(task.ruleId).not.toBeNull()
  })

  it('uses the name as the prompt when the prompt is empty', () => {
    const { db, project } = setup()
    makeRule(db, project, { name: '雑に何か足す', prompt: '', blockStatuses: [...OPEN_STATUSES] })
    const { created } = runTaskRules(db)
    expect(created[0].prompt).toBe('雑に何か足す')
  })

  it('queues nothing for a disabled definition, or for a deleted or stopped project', () => {
    const { db, project } = setup()
    makeRule(db, project, { enabled: false, whenIdle: true })
    expect(runTaskRules(db).created).toHaveLength(0)

    const other = makeProject(db, { name: 'off', targetId: 'x', enabled: false })
    makeRule(db, other, { whenIdle: true })
    expect(runTaskRules(db).created).toHaveLength(0)
  })

  it('queues nothing for a definition with no conditions at all (it would queue forever)', () => {
    const { db, project } = setup()
    makeRule(db, project, { whenIdle: false, cron: '', blockStatuses: [] })
    const result = runTaskRules(db)
    expect(result.created).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
  })
})

describe('automatic tasks - dated titles', () => {
  it.each<{ label: string; frequency: TaskRule['frequency']; cron: string; suffix: string }>([
    { label: 'daily', frequency: 'daily', cron: '', suffix: '2026/01/05 06:07:08' },
    { label: 'weekdays', frequency: 'weekdays', cron: '', suffix: '2026/01/05 06:07:08' },
    { label: 'weekly', frequency: 'weekly', cron: '', suffix: '2026/01/05' },
    { label: 'idle only', frequency: 'none', cron: '', suffix: '2026/01/05 06:07:08' },
    { label: 'hourly cron', frequency: 'none', cron: '@hourly', suffix: '2026/01/05 06:07:08' },
    { label: 'daily cron', frequency: 'none', cron: '@daily', suffix: '2026/01/05 06:07:08' },
    { label: 'midnight cron', frequency: 'none', cron: '@midnight', suffix: '2026/01/05 06:07:08' },
    { label: 'minute steps', frequency: 'none', cron: '*/15 * * * *', suffix: '2026/01/05 06:07:08' },
    { label: 'hour lists', frequency: 'none', cron: '0 9,18 * * mon', suffix: '2026/01/05 06:07:08' },
    { label: 'weekday cron', frequency: 'none', cron: '0 9 * * mon-fri', suffix: '2026/01/05 06:07:08' },
    { label: 'week boundary', frequency: 'none', cron: '0 9 * * sun,mon', suffix: '2026/01/05 06:07:08' },
    { label: 'weekly cron', frequency: 'none', cron: '@weekly', suffix: '2026/01/05' },
    { label: 'spaced weekdays', frequency: 'none', cron: '0 9 * * mon,wed,fri', suffix: '2026/01/05' },
    { label: 'monthly cron', frequency: 'none', cron: '@monthly', suffix: '2026/01/05' },
    { label: 'yearly cron', frequency: 'none', cron: '@yearly', suffix: '2026/01/05' },
    { label: 'consecutive dates', frequency: 'none', cron: '0 9 1,2 * *', suffix: '2026/01/05 06:07:08' },
    { label: 'spaced dates', frequency: 'none', cron: '0 9 1,15 * *', suffix: '2026/01/05' },
    { label: 'month boundary', frequency: 'none', cron: '0 9 1,31 * *', suffix: '2026/01/05 06:07:08' },
    { label: 'year boundary', frequency: 'none', cron: '0 9 1,31 dec,jan *', suffix: '2026/01/05 06:07:08' },
    { label: 'February boundary', frequency: 'none', cron: '0 9 1,28 feb,mar *', suffix: '2026/01/05 06:07:08' },
    { label: 'leap dates', frequency: 'none', cron: '0 9 28,29 feb *', suffix: '2026/01/05 06:07:08' },
    { label: 'invalid month dates', frequency: 'none', cron: '0 9 1,30,31 feb *', suffix: '2026/01/05' },
    { label: 'day or weekday', frequency: 'none', cron: '0 9 1 * mon', suffix: '2026/01/05 06:07:08' }
  ])('appends the local enqueue date with the precision needed for $label', ({ frequency, cron, suffix }) => {
    const { db, project } = setup()
    const rule = makeRule(db, project, {
      name: '定期確認', frequency, cron, whenIdle: true,
      dueAt: new Date(2026, 0, 1).toISOString()
    })
    const [task] = runTaskRules(db, new Date(2026, 0, 5, 6, 7, 8, 987)).created
    expect(repo.getTask(db, task.id)?.title).toBe(`定期確認 ${suffix}`)
    expect(repo.getTaskRule(db, rule.id)?.name).toBe('定期確認')
    expect(task.prompt).toBe(rule.prompt)
  })

  it('timestamps manual queueing without accumulating suffixes or changing an empty-prompt fallback', () => {
    const { db, project } = setup()
    const rule = makeRule(db, project, { frequency: 'daily', name: '定期確認', prompt: '' })
    const first = enqueueRuleNow(db, rule.id, new Date(2026, 0, 5, 6, 7, 8))
    const second = enqueueRuleNow(db, rule.id, new Date(2026, 0, 6, 9, 10, 11))
    expect(first.title).toBe('定期確認 2026/01/05 06:07:08')
    expect(second.title).toBe('定期確認 2026/01/06 09:10:11')
    expect(repo.getTask(db, first.id)?.title).toBe(first.title)
    expect(second.prompt).toBe('定期確認')
    expect(repo.getTaskRule(db, rule.id)?.name).toBe('定期確認')
  })

  it('keeps seconds for weekday cron when the next occurrence is after the weekend', () => {
    const { db, project } = setup()
    const rule = makeRule(db, project, { name: '定期確認', cron: '0 9 * * mon-fri' })
    expect(enqueueRuleNow(db, rule.id, new Date(2026, 8, 25, 18, 4, 3)).title)
      .toBe('定期確認 2026/09/25 18:04:03')
  })

  it('dates overdue work when it is actually queued', () => {
    const { db, project } = setup()
    makeRule(db, project, {
      name: '定期確認', cron: '@daily', dueAt: new Date(2026, 0, 1).toISOString()
    })
    expect(runTaskRules(db, new Date(2026, 0, 5, 0, 0, 9)).created[0].title)
      .toBe('定期確認 2026/01/05 00:00:09')
  })
})

describe('automatic tasks - when the queue is empty', () => {
  it('does not queue while anything is waiting or running, and queues once nothing is left', () => {
    const { db, project, agent } = setup()
    makeRule(db, project, { whenIdle: true, blockStatuses: [...OPEN_STATUSES] })

    const queued = makeTask(db, project, '先にやること')
    expect(runTaskRules(db).created).toHaveLength(0)

    const running = occupy(db, queued, agent)
    expect(runTaskRules(db).created).toHaveLength(0)

    repo.updateRun(db, running, { status: 'succeeded' })
    repo.setTaskStatus(db, queued, 'review')
    expect(runTaskRules(db).created).toHaveLength(1)
  })

  it('counts review, failed and held as "empty" (it keeps moving while it waits on a human)', () => {
    const { db, project, agent } = setup()
    makeRule(db, project, { whenIdle: true })
    reviewed(db, project, 'レビュー待ち', agent)
    repo.setTaskStatus(db, makeTask(db, project, '失敗'), 'failed')
    repo.setTaskStatus(db, makeTask(db, project, '保留'), 'held')

    expect(runTaskRules(db).created).toHaveLength(1)
  })

  it('queues whenever its own queue is empty, however busy another project is', () => {
    const { db, project, agent } = setup()
    const other = makeProject(db, { name: 'other', targetId: agent })
    occupy(db, makeTask(db, other, '隣で実行中'), agent)
    makeRule(db, project, { whenIdle: true })

    expect(runTaskRules(db).created).toHaveLength(1)
  })

  it('does not queue two definitions in one project at once, but takes turns', () => {
    const { db, project } = setup()
    const issue = makeRule(db, project, { name: 'Issue 消化', whenIdle: true, sortOrder: 0 })
    const pr = makeRule(db, project, { name: 'PR 消化', whenIdle: true, sortOrder: 1 })

    const first = runTaskRules(db).created
    expect(first.map((t) => t.ruleId)).toEqual([issue.id])

    // The second one waits until the first is cleared (the queue is not empty)
    expect(runTaskRules(db).created).toHaveLength(0)
    repo.setTaskStatus(db, first[0].id, 'review')
    expect(runTaskRules(db).created.map((t) => t.ruleId)).toEqual([pr.id])
  })
})

describe('automatic tasks - never queuing twice', () => {
  const statuses = (list: TaskStatus[]): TaskStatus[] => list

  it('does not queue while anything in a counted state remains', () => {
    const { db, project } = setup()
    makeRule(db, project, { blockStatuses: [...OPEN_STATUSES] })

    const first = runTaskRules(db).created[0]
    expect(runTaskRules(db).created).toHaveLength(0)

    // Review counts as still stuck (the default is everything but done)
    repo.setTaskStatus(db, first.id, 'review')
    expect(runTaskRules(db).created).toHaveLength(0)

    repo.setTaskStatus(db, first.id, 'done')
    expect(runTaskRules(db).created).toHaveLength(1)
  })

  it('lets the counted states be chosen (drop review and it keeps going even as reviews pile up)', () => {
    const { db, project } = setup()
    makeRule(db, project, {
      blockStatuses: statuses(['draft', 'held', 'queued', 'running', 'failed'])
    })

    const first = runTaskRules(db).created[0]
    repo.setTaskStatus(db, first.id, 'review')
    expect(runTaskRules(db).created).toHaveLength(1)
  })

  it('counts anything stuck as failed (the whole point of never queuing twice)', () => {
    const { db, project } = setup()
    makeRule(db, project, { blockStatuses: [...OPEN_STATUSES] })
    const first = runTaskRules(db).created[0]
    repo.setTaskStatus(db, first.id, 'failed')
    expect(runTaskRules(db).created).toHaveLength(0)

    // Archiving takes it out of the count (the way out of one stuck task)
    repo.setTaskArchived(db, first.id, true)
    expect(runTaskRules(db).created).toHaveLength(1)
  })

  it('does not count the same content queued by hand (only what it created itself counts)', () => {
    const { db, project } = setup()
    makeRule(db, project, { blockStatuses: [...OPEN_STATUSES] })
    makeTask(db, project, 'Issue を消化する')
    expect(runTaskRules(db).created).toHaveLength(1)
  })
})

describe('automatic tasks - by time (Cron)', () => {
  it('does not queue until the due time, then queues and moves on to the next due time', () => {
    const { db, project } = setup()
    const rule = makeRule(db, project, {
      cron: '0 3 * * *',
      dueAt: new Date('2026-08-19T18:00:00.000Z').toISOString()
    })

    expect(runTaskRules(db, new Date('2026-08-19T17:00:00.000Z')).created).toHaveLength(0)

    const now = new Date('2026-08-19T18:30:00.000Z')
    expect(runTaskRules(db, now).created).toHaveLength(1)

    const after = repo.getTaskRule(db, rule.id)!
    expect(after.lastEnqueuedAt).toBe(now.toISOString())
    expect(after.dueAt).toBe(nextDueAt('0 3 * * *', now))
    // A second one is not queued in the same tick
    expect(runTaskRules(db, now).created).toHaveLength(0)
  })

  it('skips a due time while busy and queues once free (it never drops that day)', () => {
    const { db, project } = setup()
    makeRule(db, project, {
      whenIdle: true,
      cron: '0 3 * * *',
      dueAt: new Date('2026-08-19T18:00:00.000Z').toISOString()
    })
    const busy = makeTask(db, project, '走っているもの')

    const at3 = new Date('2026-08-19T18:00:30.000Z')
    expect(runTaskRules(db, at3).created).toHaveLength(0)

    // The due time is still past, so it queues the moment things free up
    repo.setTaskStatus(db, busy, 'review')
    expect(runTaskRules(db, new Date('2026-08-19T22:00:00.000Z')).created).toHaveLength(1)
  })

  it('queues nothing for an unreadable expression and warns with the reason (it never stalls silently)', () => {
    const { db, project } = setup()
    makeRule(db, project, { cron: 'まいにち' })
    const result = runTaskRules(db)
    expect(result.created).toHaveLength(0)
    expect(result.warnings[0]).toContain('cron expression')
  })

  it('refills the due time and defers to the next round when an expression has none', () => {
    const { db, project } = setup()
    const rule = makeRule(db, project, { cron: '0 3 * * *', dueAt: null })
    const now = new Date('2026-08-19T10:00:00.000Z')

    expect(runTaskRules(db, now).created).toHaveLength(0)
    expect(repo.getTaskRule(db, rule.id)!.dueAt).toBe(nextDueAt('0 3 * * *', now))
  })
})

describe('automatic tasks - manual runs and cleaning up definitions', () => {
  it('queues regardless of the conditions on "queue now"', () => {
    const { db, project } = setup()
    const rule = makeRule(db, project, { whenIdle: true, blockStatuses: [...OPEN_STATUSES] })
    makeTask(db, project, 'キューは埋まっている')

    expect(runTaskRules(db).created).toHaveLength(0)
    const task = enqueueRuleNow(db, rule.id)
    expect(repo.getTask(db, task.id)!.status).toBe('queued')
  })

  it('leaves queued tasks behind when the definition is deleted (only the origin marker comes off)', () => {
    const { db, project } = setup()
    const rule = makeRule(db, project, { blockStatuses: [...OPEN_STATUSES] })
    const task = runTaskRules(db).created[0]

    repo.deleteTaskRule(db, rule.id)
    const after = repo.getTask(db, task.id)
    expect(after?.title).toBe(task.title)
    expect(after?.ruleId).toBeNull()
  })

  it('does not queue while the scheduler is stopped', async () => {
    const { db, project } = setup()
    makeRule(db, project, { whenIdle: true, blockStatuses: [...OPEN_STATUSES] })

    const scheduler = new Scheduler(db, new Runner(db))
    scheduler.pause()
    await scheduler.tick()

    expect(repo.listTasks(db)).toHaveLength(0)
  })
})

describe('automatic tasks - calendar frequency without a time', () => {
  const at = (day: number, hour = 12) => new Date(2026, 8, day, hour)

  it('can start today and queues only once per local day, even after reading the rule again', () => {
    const { db, project } = setup()
    const rule = makeRule(db, project, { frequency: 'daily' })
    expect(runTaskRules(db, at(21, 15)).created).toHaveLength(1)
    expect(repo.getTaskRule(db, rule.id)?.frequency).toBe('daily')
    expect(repo.getTaskRule(db, rule.id)?.dueAt).toBe(at(22, 0).toISOString())
    expect(runTaskRules(db, at(21, 23)).created).toHaveLength(0)
    expect(runTaskRules(db, at(22, 0)).created).toHaveLength(1)
    expect(runTaskRules(db, at(22, 9)).created).toHaveLength(0)
  })

  it('queues once in a Monday to Sunday week and starts another period on Monday', () => {
    const { db, project } = setup()
    makeRule(db, project, { frequency: 'weekly' })
    expect(runTaskRules(db, at(23)).created).toHaveLength(1)
    expect(runTaskRules(db, at(27, 23)).created).toHaveLength(0)
    expect(runTaskRules(db, at(28, 0)).created).toHaveLength(1)
  })

  it('does not catch up a blocked Friday on the weekend, and only queues once on Monday', () => {
    const { db, project } = setup()
    makeRule(db, project, { frequency: 'weekdays', whenIdle: true })
    const busy = makeTask(db, project, 'Busy')
    expect(runTaskRules(db, at(25)).created).toHaveLength(0)
    repo.setTaskStatus(db, busy, 'review')
    expect(runTaskRules(db, at(26)).created).toHaveLength(0)
    expect(runTaskRules(db, at(27)).created).toHaveLength(0)
    expect(runTaskRules(db, at(28)).created).toHaveLength(1)
    expect(runTaskRules(db, at(28, 23)).created).toHaveLength(0)
  })

  it('waits for idle and duplicate gates and never piles up missed periods', () => {
    const { db, project } = setup()
    makeRule(db, project, { frequency: 'daily', whenIdle: true, blockStatuses: [...OPEN_STATUSES] })
    const busy = makeTask(db, project, 'Busy')
    expect(runTaskRules(db, at(21)).created).toHaveLength(0)
    repo.setTaskStatus(db, busy, 'done')
    const first = runTaskRules(db, at(24)).created
    expect(first).toHaveLength(1)
    repo.setTaskStatus(db, first[0].id, 'review')
    expect(runTaskRules(db, at(25)).created).toHaveLength(0)
    repo.setTaskStatus(db, first[0].id, 'done')
    expect(runTaskRules(db, at(28)).created).toHaveLength(1)
    expect(runTaskRules(db, at(28, 23)).created).toHaveLength(0)
  })

  it('counts an explicit enqueue against the current period, even across disabling and re-enabling', () => {
    const { db, project } = setup()
    const rule = makeRule(db, project, { frequency: 'daily', enabled: false })
    expect(runTaskRules(db, at(21)).created).toHaveLength(0)
    enqueueRuleNow(db, rule.id, at(21))
    repo.updateTaskRule(db, rule.id, { enabled: true })
    expect(runTaskRules(db, at(21, 23)).created).toHaveLength(0)
    expect(runTaskRules(db, at(22)).created).toHaveLength(1)
  })
})
