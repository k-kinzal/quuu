import { describe, expect, it } from 'vitest'
import type { DependsMode } from '../src/main/tasks/status.js'
import * as repo from '../src/main/db/repo.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

function scheduler(db: ReturnType<typeof memoryDb>): Scheduler {
  return new Scheduler(db, new Runner(db))
}

const dep = (taskId: string, mode: DependsMode = 'done'): { taskId: string; mode: DependsMode } => ({
  taskId,
  mode
})

describe('ordering between tasks', () => {
  /*
   * The queueing surface (the context menu entry "add a following task...") comes through here.
   * Splitting it into create-then-link lets a `queued` task be picked up in the gap,
   * and the very run that was meant to wait goes ahead.
   */
  it('takes the preceding task at create time (nothing is picked up before the link exists)', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 5 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 5 })
    const first = makeTask(db, p, '先にやる')

    const second = repo.insertTask(db, {
      projectId: p,
      title: '後でやる',
      status: 'queued',
      dependsOn: [dep(first, 'finished')]
    })
    expect(second.dependsOn).toEqual([dep(first, 'finished')])

    const s = scheduler(db)
    expect(s.claimNext()?.task.id).toBe(first)
    expect(s.claimNext()).toBeNull()

    repo.setTaskStatus(db, first, 'review')
    expect(s.claimNext()?.task.id).toBe(second.id)
  })

  it('does not pick up until the preceding task is marked done (the default)', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 5 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 5 })
    const first = makeTask(db, p, '先にやる')
    const second = makeTask(db, p, '後でやる')
    repo.patchTask(db, second, { dependsOn: [dep(first)] })

    const s = scheduler(db)
    // The preceding task was picked up, so the follower still cannot be
    expect(s.claimNext()?.task.id).toBe(first)
    expect(s.claimNext()).toBeNull()

    // Even once the run ends and it sits in review, by default nothing moves
    repo.setTaskStatus(db, first, 'review')
    expect(s.claimNext()).toBeNull()

    // Only once a human marks it done does it move
    repo.setTaskStatus(db, first, 'done')
    expect(s.claimNext()?.task.id).toBe(second)
  })

  it('moves on as soon as the run ends when set to finished', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 5 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 5 })
    const first = makeTask(db, p, '先にやる')
    const second = makeTask(db, p, '後でやる')
    repo.patchTask(db, second, { dependsOn: [dep(first, 'finished')] })

    const s = scheduler(db)
    s.claimNext()
    expect(s.claimNext()).toBeNull()

    repo.setTaskStatus(db, first, 'review')
    expect(s.claimNext()?.task.id).toBe(second)
  })

  it('moves on even after a failure when set to finished', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 5 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 5 })
    const first = makeTask(db, p, '先', 2, 'draft')
    const second = makeTask(db, p, '後')
    repo.patchTask(db, second, { dependsOn: [dep(first, 'finished')] })

    repo.setTaskStatus(db, first, 'failed')
    expect(scheduler(db).claimNext()?.task.id).toBe(second)
  })

  it('does not stall when the preceding task is deleted', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const p = makeProject(db, { name: 'p', targetId: agent })
    const first = makeTask(db, p, '先', 2, 'draft')
    const second = makeTask(db, p, '後')
    repo.patchTask(db, second, { dependsOn: [dep(first)] })

    repo.deleteTask(db, first)
    // The reference goes with it, so no waiting condition is left behind
    expect(repo.getTask(db, second)?.dependsOn).toEqual([])
    expect(scheduler(db).claimNext()?.task.id).toBe(second)
  })

  /*
   * Deleting a project hard-deletes its tasks, so a follower in **another** project is waiting on
   * something that no longer exists. `task_dependencies` carries no foreign key, so the edge only
   * goes if the delete takes it by hand — in both directions.
   */
  it('does not stall when the preceding task went with a deleted project', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 5 })
    const gone = makeProject(db, { name: 'gone', path: '/tmp/gone', targetId: agent })
    const alive = makeProject(db, { name: 'alive', path: '/tmp/alive', targetId: agent })
    const first = makeTask(db, gone, '消える方', 2, 'draft')
    const second = makeTask(db, alive, '待つ方')
    repo.patchTask(db, second, { dependsOn: [dep(first)] })

    repo.deleteProject(db, gone)
    expect(repo.getTask(db, second)?.dependsOn).toEqual([])
    expect(scheduler(db).claimNext()?.task.id).toBe(second)
  })

  /*
   * Archiving the preceding task is how a human takes it out of the picture. It is gone from every
   * list, so its `review` never becomes `done` and nothing on screen says what the wait is for —
   * the follower sat at queue position 1 and was skipped on every tick.
   */
  it('does not stall when the preceding task is archived short of done', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const p = makeProject(db, { name: 'p', targetId: agent })
    const first = makeTask(db, p, '先', 2, 'draft')
    const second = makeTask(db, p, '後')
    repo.patchTask(db, second, { dependsOn: [dep(first)] })

    repo.setTaskStatus(db, first, 'review')
    expect(scheduler(db).claimNext()).toBeNull()

    repo.setTaskArchived(db, first, true)
    expect(repo.unsatisfiedBlockers(db, repo.getTask(db, second)!)).toEqual([])
    expect(scheduler(db).claimNext()?.task.id).toBe(second)
  })

  it('brings the wait back when the preceding task is un-archived', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const p = makeProject(db, { name: 'p', targetId: agent })
    const first = makeTask(db, p, '先', 2, 'draft')
    const second = makeTask(db, p, '後')
    repo.patchTask(db, second, { dependsOn: [dep(first)] })

    repo.setTaskArchived(db, first, true)
    repo.setTaskArchived(db, first, false)
    expect(scheduler(db).claimNext()).toBeNull()
  })

  it('lets other tasks move on despite the dependency', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 5 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 5 })
    const blocker = makeTask(db, p, 'ブロッカー', 2, 'draft')
    const blocked = makeTask(db, p, '待たされる', 0)
    const free = makeTask(db, p, '自由', 1)
    repo.patchTask(db, blocked, { dependsOn: [dep(blocker)] })

    // blocked comes first on priority, but the dependency skips it and free is picked up
    expect(scheduler(db).claimNext()?.task.id).toBe(free)
  })

  it('detects a dependency cycle', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const p = makeProject(db, { name: 'p', targetId: agent })
    const a = makeTask(db, p, 'A')
    const b = makeTask(db, p, 'B')
    const c = makeTask(db, p, 'C')

    repo.patchTask(db, b, { dependsOn: [dep(a)] })
    repo.patchTask(db, c, { dependsOn: [dep(b)] })

    expect(repo.wouldCycle(db, a, [c])).toBe(true)
    expect(repo.wouldCycle(db, a, [a])).toBe(true)
    expect(repo.wouldCycle(db, a, [])).toBe(false)
    expect(repo.wouldCycle(db, b, [a])).toBe(false)
    // If even one of several comes back around, it is a cycle
    expect(repo.wouldCycle(db, a, [b, c])).toBe(true)
  })

  it('can list the tasks that are waiting', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const p = makeProject(db, { name: 'p', targetId: agent })
    const first = makeTask(db, p, '先')
    const b = makeTask(db, p, 'B')
    const c = makeTask(db, p, 'C')
    repo.patchTask(db, b, { dependsOn: [dep(first)] })
    repo.patchTask(db, c, { dependsOn: [dep(first)] })

    expect(
      repo
        .dependents(db, first)
        .map((t) => t.id)
        .sort()
    ).toEqual([b, c].sort())
  })
})

describe('several preceding tasks', () => {
  it('does not pick up until every one of them is satisfied', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 5 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 5 })
    const a = makeTask(db, p, 'A', 2, 'draft')
    const b = makeTask(db, p, 'B', 2, 'draft')
    const last = makeTask(db, p, '最後')
    repo.patchTask(db, last, { dependsOn: [dep(a), dep(b)] })

    const s = scheduler(db)
    expect(s.claimNext()).toBeNull()

    // Finishing only one of them does not move it
    repo.setTaskStatus(db, a, 'done')
    expect(s.claimNext()).toBeNull()

    repo.setTaskStatus(db, b, 'done')
    expect(s.claimNext()?.task.id).toBe(last)
  })

  it('carries the waiting condition per dependency', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 5 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 5 })
    const strict = makeTask(db, p, '完了まで待つ方', 2, 'draft')
    const loose = makeTask(db, p, '実行が終われば良い方', 2, 'draft')
    const last = makeTask(db, p, '最後')
    repo.patchTask(db, last, { dependsOn: [dep(strict, 'done'), dep(loose, 'finished')] })

    // The finished one is satisfied by review, but the done one is not yet
    repo.setTaskStatus(db, loose, 'review')
    expect(scheduler(db).claimNext()).toBeNull()
    expect(repo.unsatisfiedBlockers(db, repo.getTask(db, last)!).map((t) => t.id)).toEqual([strict])

    repo.setTaskStatus(db, strict, 'done')
    expect(scheduler(db).claimNext()?.task.id).toBe(last)
  })

  it('keeps the given order and never holds the same task twice', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const p = makeProject(db, { name: 'p', targetId: agent })
    const a = makeTask(db, p, 'A')
    const b = makeTask(db, p, 'B')
    const t = makeTask(db, p, 'T')

    repo.patchTask(db, t, {
      dependsOn: [dep(b, 'finished'), dep(a), dep(b), { taskId: t, mode: 'done' }]
    })
    // Duplicates and the task itself are dropped. The rest keeps the given order
    expect(repo.getTask(db, t)?.dependsOn).toEqual([
      { taskId: b, mode: 'finished' },
      { taskId: a, mode: 'done' }
    ])
  })

  it('does not clear dependencies on an update that omits them', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const p = makeProject(db, { name: 'p', targetId: agent })
    const a = makeTask(db, p, 'A')
    const t = makeTask(db, p, 'T')
    repo.patchTask(db, t, { dependsOn: [dep(a)] })

    repo.patchTask(db, t, { title: '題を変えただけ' })
    expect(repo.getTask(db, t)?.dependsOn).toEqual([{ taskId: a, mode: 'done' }])

    // Only passing an empty array clears them
    repo.patchTask(db, t, { dependsOn: [] })
    expect(repo.getTask(db, t)?.dependsOn).toEqual([])
  })
})

describe('queue position', () => {
  it('puts a preceding task ahead of the task itself', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const p = makeProject(db, { name: 'p', targetId: agent })
    const later = makeTask(db, p, '先にやってほしい方', 3) // lower priority
    const earlier = makeTask(db, p, '待つ方', 0) // higher priority
    repo.patchTask(db, earlier, { dependsOn: [dep(later)] })

    const positions = repo.queuePositions(db)
    expect(positions.get(later)).toBe(1)
    expect(positions.get(earlier)).toBe(2)
  })
})
