import { describe, expect, it } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { isoPlusSeconds } from '../src/main/util.js'
import { makeAgent, makeProject, makeTask, memoryDb, occupy, reviewed, sessioned } from './helpers.js'

function scheduler(db: ReturnType<typeof memoryDb>): Scheduler {
  return new Scheduler(db, new Runner(db))
}

describe('conditional pickup', () => {
  it('picks up by project priority, then task priority, then insertion order', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 10 })
    const high = makeProject(db, { name: 'high', targetId: agent, priority: 0, maxConcurrent: 10 })
    const low = makeProject(db, { name: 'low', targetId: agent, priority: 5, maxConcurrent: 10 })

    // low was inserted first, but high wins on project priority
    makeTask(db, low, 'low-p0', 0)
    const highP2 = makeTask(db, high, 'high-p2', 2)
    const highP0 = makeTask(db, high, 'high-p0', 0)

    const s = scheduler(db)
    expect(s.claimNext()?.task.id).toBe(highP0)
    expect(s.claimNext()?.task.id).toBe(highP2)
    expect(s.claimNext()?.task.title).toBe('low-p0')
  })

  it('picks up a follow-up (a continuation out of review) from the head of the queue', () => {
    const db = memoryDb()
    const agent = makeAgent(db, {
      name: 'a',
      concurrency: 10,
      resumeArgsTemplate: ['--resume', '{{sessionId}}']
    })
    const high = makeProject(db, { name: 'high', targetId: agent, priority: 0, maxConcurrent: 10 })
    const low = makeProject(db, { name: 'low', targetId: agent, priority: 5, maxConcurrent: 10 })

    // High-priority tasks queued earlier
    const first = makeTask(db, high, 'high-p0', 0)
    makeTask(db, high, 'high-p2', 2)
    // A follow-up sent back later. It loses on project priority and on insertion order, yet goes first
    const followup = makeTask(db, low, 'followup', 3)
    sessioned(db, followup, agent, 'queued', { pendingMessage: 'ここを直して' })

    const s = scheduler(db)
    const claim = s.claimNext()
    expect(claim?.task.id).toBe(followup)
    // It only overtakes; the order of everything behind it is unchanged
    expect(s.claimNext()?.task.id).toBe(first)
  })

  it('does not cut in when a session exists but the follow-up is empty (auto-retry keeps its place)', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 10 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 10 })
    const first = makeTask(db, p, 'first')
    const retried = makeTask(db, p, 'retried')
    repo.setTaskStatus(db, retried, 'queued', { sessionId: 'sess-1', pendingMessage: '  ' })

    const s = scheduler(db)
    expect(s.claimNext()?.task.id).toBe(first)
    expect(s.claimNext()?.task.id).toBe(retried)
  })

  it('orders follow-ups among themselves by priority and insertion order when there are several', () => {
    const db = memoryDb()
    const agent = makeAgent(db, {
      name: 'a',
      concurrency: 10,
      resumeArgsTemplate: ['--resume', '{{sessionId}}']
    })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 10 })
    const later = makeTask(db, p, 'later', 0)
    const earlier = makeTask(db, p, 'earlier', 0)
    sessioned(db, later, agent, 'queued', { pendingMessage: 'x' })
    sessioned(db, earlier, agent, 'queued', { pendingMessage: 'y' })

    const s = scheduler(db)
    expect(s.claimNext()?.task.id).toBe(later)
    expect(s.claimNext()?.task.id).toBe(earlier)
  })

  it('counts a follow-up as the head of the queue in the position display too', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 10 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 10 })
    const first = makeTask(db, p, 'first', 0)
    const followup = makeTask(db, p, 'followup', 3)
    sessioned(db, followup, agent, 'queued', { pendingMessage: '直して' })

    const positions = repo.queuePositions(db)
    expect(positions.get(followup)).toBe(1)
    expect(positions.get(first)).toBe(2)
  })

  it('keeps insertion order within the same priority', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 10 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 10 })
    const first = makeTask(db, p, 'first')
    const second = makeTask(db, p, 'second')

    const s = scheduler(db)
    expect(s.claimNext()?.task.id).toBe(first)
    expect(s.claimNext()?.task.id).toBe(second)
  })

  it('does not pick up beyond the per-project concurrency limit', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 10 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 1 })
    const busy = makeTask(db, p, 'busy')
    makeTask(db, p, 'waiting')
    occupy(db, busy, agent)

    expect(scheduler(db).claimNext()).toBeNull()
  })

  it('does not pick up beyond the agent parallelism limit', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 1 })
    const p1 = makeProject(db, { name: 'p1', targetId: agent, maxConcurrent: 5 })
    const p2 = makeProject(db, { name: 'p2', targetId: agent, maxConcurrent: 5 })
    const busy = makeTask(db, p1, 'busy')
    makeTask(db, p2, 'waiting')
    occupy(db, busy, agent)

    expect(scheduler(db).claimNext()).toBeNull()
  })

  it('flips picked-up tasks to running in the same breath, so none is taken twice', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 4 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 4 })
    const task = makeTask(db, p, 'only')

    const s = scheduler(db)
    const claim = s.claimNext()
    expect(claim?.task.id).toBe(task)
    expect(repo.getTask(db, task)?.status).toBe('running')
    expect(s.claimNext()).toBeNull()
  })

  it('does not pick up a draft task', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const p = makeProject(db, { name: 'p', targetId: agent })
    makeTask(db, p, 'draft only', 2, 'draft')
    expect(scheduler(db).claimNext()).toBeNull()
  })

  it('does not pick up a task whose scheduled time is in the future', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const p = makeProject(db, { name: 'p', targetId: agent })
    const task = makeTask(db, p, 'future')
    repo.patchTask(db, task, { scheduledAt: isoPlusSeconds(3600) })
    expect(scheduler(db).claimNext()).toBeNull()

    repo.patchTask(db, task, { scheduledAt: isoPlusSeconds(-10) })
    expect(scheduler(db).claimNext()?.task.id).toBe(task)
  })

  it('does not pick up a task from a disabled project', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const p = makeProject(db, { name: 'p', targetId: agent, enabled: false })
    makeTask(db, p, 'disabled project')
    expect(scheduler(db).claimNext()).toBeNull()
  })
})

describe('P0 keeps its execution slot', () => {
  it('keeps other tasks in the same project from taking the slot while a P0 task is unfinished', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 4 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 1 })
    const held = reviewed(db, p, 'フォローアップ中', agent)
    repo.patchTask(db, held, { priority: 0 })
    makeTask(db, p, 'あとから積んだもの')

    expect(scheduler(db).claimNext()).toBeNull()
  })

  it('lets the P0 task itself run in that slot', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 1 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 1 })
    const held = reviewed(db, p, 'フォローアップ中', agent)
    repo.patchTask(db, held, { priority: 0 })
    // Even with another task queued ahead, the kept slot belongs to the P0 task
    makeTask(db, p, '先に積まれたもの')
    repo.setTaskStatus(db, held, 'queued')

    expect(scheduler(db).claimNext()?.task.id).toBe(held)
  })

  it('keeps the agent slot too (no other project can take it either)', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 1 })
    const p1 = makeProject(db, { name: 'p1', targetId: agent, maxConcurrent: 5 })
    const p2 = makeProject(db, { name: 'p2', targetId: agent, maxConcurrent: 5 })
    const held = reviewed(db, p1, 'フォローアップ中', agent)
    repo.patchTask(db, held, { priority: 0 })
    makeTask(db, p2, '別プロジェクトのタスク')

    expect(scheduler(db).claimNext()).toBeNull()
  })

  it('keeps the other side moving as long as a fallback is free', () => {
    const db = memoryDb()
    const sonnet = makeAgent(db, { name: 'sonnet', concurrency: 1 })
    const opus = makeAgent(db, { name: 'opus', concurrency: 1, fallbackAgentId: sonnet })
    const p1 = makeProject(db, { name: 'p1', targetId: opus, maxConcurrent: 5 })
    const p2 = makeProject(db, { name: 'p2', targetId: opus, maxConcurrent: 5 })
    const held = reviewed(db, p1, 'フォローアップ中', opus)
    repo.patchTask(db, held, { priority: 0 })
    makeTask(db, p2, '別プロジェクトのタスク')

    expect(scheduler(db).claimNext()?.agentId).toBe(sonnet)
  })

  it('does not lock P0 tasks against each other; they compete normally inside the limit', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 1 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 1 })
    const first = reviewed(db, p, '確保 1', agent)
    const second = reviewed(db, p, '確保 2', agent)
    repo.patchTask(db, first, { priority: 0 })
    repo.patchTask(db, second, { priority: 0 })
    repo.setTaskStatus(db, first, 'queued')
    repo.setTaskStatus(db, second, 'queued')

    // Both keep a slot, yet nobody ends up unable to move
    const s = scheduler(db)
    expect(s.claimNext()?.task.id).toBe(first)
    // Once one starts and the slot really is full, the second simply waits its turn
    occupy(db, first, agent)
    expect(s.claimNext()).toBeNull()
  })

  it('picks up the waiting task once the priority is lowered', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 1 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 1 })
    const held = reviewed(db, p, 'フォローアップ中', agent)
    repo.patchTask(db, held, { priority: 0 })
    const waiting = makeTask(db, p, '待っているもの')

    const s = scheduler(db)
    expect(s.claimNext()).toBeNull()
    repo.patchTask(db, held, { priority: 1 })
    expect(s.claimNext()?.task.id).toBe(waiting)
  })

  it('lets the slot go when the P0 task is marked done', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 1 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 1 })
    const held = reviewed(db, p, 'フォローアップ中', agent)
    repo.patchTask(db, held, { priority: 0 })
    const waiting = makeTask(db, p, '待っているもの')

    repo.setTaskStatus(db, held, 'done')
    // The priority stays P0 on the record; only an unfinished task keeps a slot
    expect(repo.getTask(db, held)?.priority).toBe(0)
    expect(scheduler(db).claimNext()?.task.id).toBe(waiting)
  })

  it('does not take the slot twice for a running P0 task', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 2 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 2 })
    const held = makeTask(db, p, '実行中で確保しているもの', 0)
    occupy(db, held, agent)
    const waiting = makeTask(db, p, '待っているもの')

    expect(scheduler(db).claimNext()?.task.id).toBe(waiting)
  })

  it('does not keep a slot for an archived P0 task', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 1 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 1 })
    const held = reviewed(db, p, 'フォローアップ中', agent)
    repo.patchTask(db, held, { priority: 0 })
    const waiting = makeTask(db, p, '待っているもの')

    repo.setTaskArchived(db, held, true)
    expect(scheduler(db).claimNext()?.task.id).toBe(waiting)
  })

  it('does not pick up a task from a deleted project', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 1 })
    const alive = makeProject(db, { name: 'alive', path: '/tmp/alive', targetId: agent })
    const gone = makeProject(db, { name: 'gone', path: '/tmp/gone', targetId: agent })
    repo.deleteProject(db, gone)

    /*
     * Deletion throws the contents away too, so normally no debris is left here. It is still excluded at pickup
     * so that a task which slipped in after the deletion (a mistaken import, a manual insert) can never
     * **start up the deleted project's agent**.
     */
    const orphan = makeTask(db, gone, '消した後に紛れ込んだタスク')
    const waiting = makeTask(db, alive, '生きているタスク')

    const claimed = scheduler(db).claimNext()
    expect(claimed?.task.id).toBe(waiting)
    expect(claimed?.task.id).not.toBe(orphan)
  })

  it('does not steal a slot a P0 task keeps, even on run-now', async () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 1 })
    const p1 = makeProject(db, { name: 'p1', targetId: agent, maxConcurrent: 5 })
    const p2 = makeProject(db, { name: 'p2', targetId: agent, maxConcurrent: 5 })
    const held = reviewed(db, p1, 'フォローアップ中', agent)
    repo.patchTask(db, held, { priority: 0 })
    const other = makeTask(db, p2, '別プロジェクトのタスク')

    const result = await scheduler(db).runNow(other)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('is holding the run slot as P0')
    expect(repo.getTask(db, other)?.status).toBe('queued')
  })

  it('names the P0 task keeping the slot in the stall reason', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a', concurrency: 4 })
    const p = makeProject(db, { name: 'p', targetId: agent, maxConcurrent: 1 })
    const held = reviewed(db, p, 'フォローアップ中', agent)
    repo.patchTask(db, held, { priority: 0 })
    makeTask(db, p, '待っているもの')

    const s = scheduler(db)
    expect(s.claimNext()).toBeNull()
    const status = s.status()
    expect(status.warnings.some((w) => w.includes('フォローアップ中'))).toBe(true)
    expect(status.holds).toHaveLength(1)
    expect(status.holds[0].taskId).toBe(held)
    expect(status.holds[0].agentName).toBe('a')
    expect(status.agents.find((x) => x.agentId === agent)?.reserved).toBe(1)
  })
})

describe('fallback resolution', () => {
  it('names the moment the cooldown ends, so a wait does not read as a stall', async () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'opus' })
    const p = makeProject(db, { name: 'p', targetId: agent })
    const task = makeTask(db, p, 'Limitに当たったタスク')
    repo.setCooldown(db, agent, isoPlusSeconds(3600), 'limit')

    // "In cooldown" with no end is what makes a human run it by hand into the same wall
    const result = await scheduler(db).runNow(task)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('back at')
    expect(repo.getTask(db, task)?.status).toBe('queued')
  })

  it('picks up on the fallback while a Limit cooldown is in effect', () => {
    const db = memoryDb()
    const sonnet = makeAgent(db, { name: 'sonnet' })
    const opus = makeAgent(db, { name: 'opus', fallbackAgentId: sonnet })
    const p = makeProject(db, { name: 'p', targetId: opus })
    makeTask(db, p, 'task')

    repo.setCooldown(db, opus, isoPlusSeconds(600), 'limit')

    const claim = scheduler(db).claimNext()
    expect(claim?.agentId).toBe(sonnet)
  })

  it('picks up on the fallback even when the primary agent has no free slot', () => {
    const db = memoryDb()
    const sonnet = makeAgent(db, { name: 'sonnet', concurrency: 2 })
    const opus = makeAgent(db, { name: 'opus', concurrency: 1, fallbackAgentId: sonnet })
    const p1 = makeProject(db, { name: 'p1', targetId: opus, maxConcurrent: 5 })
    const p2 = makeProject(db, { name: 'p2', targetId: opus, maxConcurrent: 5 })
    const busy = makeTask(db, p1, 'busy')
    occupy(db, busy, opus)
    makeTask(db, p2, 'next')

    expect(scheduler(db).claimNext()?.agentId).toBe(sonnet)
  })

  it('does not stall on a fallback cycle', () => {
    const db = memoryDb()
    const a = makeAgent(db, { name: 'a' })
    const b = makeAgent(db, { name: 'b', fallbackAgentId: a })
    repo.updateAgent(db, a, { fallbackAgentId: b })

    const p = makeProject(db, { name: 'p', targetId: a })
    makeTask(db, p, 'task')
    repo.setCooldown(db, a, isoPlusSeconds(600), 'limit')
    repo.setCooldown(db, b, isoPlusSeconds(600), 'limit')

    expect(scheduler(db).claimNext()).toBeNull()
  })

  it('drops a disabled agent from the candidates', () => {
    const db = memoryDb()
    const backup = makeAgent(db, { name: 'backup' })
    const main = makeAgent(db, { name: 'main', enabled: false, fallbackAgentId: backup })
    const p = makeProject(db, { name: 'p', targetId: main })
    makeTask(db, p, 'task')

    expect(scheduler(db).claimNext()?.agentId).toBe(backup)
  })
})

/**
 * A fallback costs what the original costs.
 *
 * A Limit is account-wide, so every run on the primary has to move at once. A lane that was handed
 * to someone else in the meantime is no lane at all.
 */
describe('fallback slots', () => {
  it('keeps a slot on the fallback for as long as the run that may need it lasts', () => {
    const db = memoryDb()
    const sonnet = makeAgent(db, { name: 'sonnet', concurrency: 1 })
    const opus = makeAgent(db, { name: 'opus', concurrency: 1, fallbackAgentId: sonnet })
    const p1 = makeProject(db, { name: 'p1', targetId: opus, maxConcurrent: 5 })
    const p2 = makeProject(db, { name: 'p2', targetId: sonnet, maxConcurrent: 5 })
    const running = makeTask(db, p1, 'running on opus')
    occupy(db, running, opus)
    makeTask(db, p2, 'wants sonnet')

    // The one sonnet slot is the running opus task's way out of a Limit
    expect(scheduler(db).claimNext()).toBeNull()
  })

  it('hands the lane back the moment the run holding it ends', () => {
    const db = memoryDb()
    const sonnet = makeAgent(db, { name: 'sonnet', concurrency: 1 })
    const opus = makeAgent(db, { name: 'opus', concurrency: 1, fallbackAgentId: sonnet })
    const p1 = makeProject(db, { name: 'p1', targetId: opus, maxConcurrent: 5 })
    const p2 = makeProject(db, { name: 'p2', targetId: sonnet, maxConcurrent: 5 })
    reviewed(db, p1, 'finished on opus', opus)
    makeTask(db, p2, 'wants sonnet')

    expect(scheduler(db).claimNext()?.agentId).toBe(sonnet)
  })

  it('leaves the rest of the fallback free once its lane is covered', () => {
    const db = memoryDb()
    const sonnet = makeAgent(db, { name: 'sonnet', concurrency: 2 })
    const opus = makeAgent(db, { name: 'opus', concurrency: 1, fallbackAgentId: sonnet })
    const p1 = makeProject(db, { name: 'p1', targetId: opus, maxConcurrent: 5 })
    const p2 = makeProject(db, { name: 'p2', targetId: sonnet, maxConcurrent: 5 })
    const running = makeTask(db, p1, 'running on opus')
    occupy(db, running, opus)
    makeTask(db, p2, 'wants sonnet')

    // One of the two slots is the lane; the other is nobody's and stays usable
    expect(scheduler(db).claimNext()?.agentId).toBe(sonnet)
  })

  it('does not launch a run that would have nowhere to fall back to', () => {
    const db = memoryDb()
    const sonnet = makeAgent(db, { name: 'sonnet', concurrency: 1 })
    const opus = makeAgent(db, { name: 'opus', concurrency: 2, fallbackAgentId: sonnet })
    const p1 = makeProject(db, { name: 'p1', targetId: sonnet, maxConcurrent: 5 })
    const p2 = makeProject(db, { name: 'p2', targetId: opus, maxConcurrent: 5 })
    const busy = makeTask(db, p1, 'running on sonnet')
    occupy(db, busy, sonnet)
    makeTask(db, p2, 'wants opus')

    // Both opus slots are free, but a Limit on opus would have nowhere to go
    expect(scheduler(db).claimNext()).toBeNull()
  })

  it('names the fallback when its lane is what holds the start back', () => {
    const db = memoryDb()
    const sonnet = makeAgent(db, { name: 'sonnet', concurrency: 1 })
    const opus = makeAgent(db, { name: 'opus', concurrency: 1, fallbackAgentId: sonnet })
    const p1 = makeProject(db, { name: 'p1', targetId: sonnet, maxConcurrent: 5 })
    const p2 = makeProject(db, { name: 'p2', targetId: opus, maxConcurrent: 5 })
    const held = reviewed(db, p1, 'holding sonnet as P0', sonnet)
    repo.patchTask(db, held, { priority: 0 })
    makeTask(db, p2, 'wants opus')

    const s = scheduler(db)
    expect(s.claimNext()).toBeNull()
    expect(s.status().warnings.some((w) => w.includes('fallback agent has no slot'))).toBe(true)
  })

  it('does not keep a lane for a follow-up whose fallback cannot resume it', () => {
    const db = memoryDb()
    const sonnet = makeAgent(db, { name: 'sonnet', concurrency: 1 })
    const opus = makeAgent(db, { name: 'opus', concurrency: 1, fallbackAgentId: sonnet })
    const p1 = makeProject(db, { name: 'p1', targetId: opus, maxConcurrent: 5 })
    const p2 = makeProject(db, { name: 'p2', targetId: sonnet, maxConcurrent: 5 })
    const resumed = makeTask(db, p1, 'continuing on opus')
    occupy(db, resumed, opus, { kind: 'followup' })
    makeTask(db, p2, 'wants sonnet')

    expect(scheduler(db).claimNext()?.agentId).toBe(sonnet)
  })

  it('keeps a compatible fallback slot for a running follow-up', () => {
    const db = memoryDb()
    const opus = makeAgent(db, { name: 'Opus', command: 'claude', concurrency: 1, resumeArgsTemplate: ['--resume', '{{sessionId}}'] })
    const fable = makeAgent(db, { name: 'Fable', command: 'claude', concurrency: 1, fallbackAgentId: opus })
    const p1 = makeProject(db, { name: 'p1', targetId: fable, maxConcurrent: 5 })
    const p2 = makeProject(db, { name: 'p2', targetId: opus, maxConcurrent: 5 })
    occupy(db, makeTask(db, p1, 'continuing on Fable'), fable, { kind: 'followup' })
    makeTask(db, p2, 'wants Opus')

    const s = scheduler(db)
    expect(s.claimNext()).toBeNull()
    expect(s.status().agents.find((a) => a.agentId === opus)?.reserved).toBe(1)
  })

  it('shows the lane as a reserved slot, so the fallback never looks idle', () => {
    const db = memoryDb()
    const sonnet = makeAgent(db, { name: 'sonnet', concurrency: 2 })
    const opus = makeAgent(db, { name: 'opus', concurrency: 1, fallbackAgentId: sonnet })
    const p = makeProject(db, { name: 'p', targetId: opus, maxConcurrent: 5 })
    const running = makeTask(db, p, 'running on opus')
    occupy(db, running, opus)

    const slot = scheduler(db).status().agents.find((a) => a.agentId === sonnet)
    expect(slot?.active).toBe(0)
    expect(slot?.reserved).toBe(1)
  })
})

describe('group resolution', () => {
  it('picks the first member with a free slot in definition order', () => {
    const db = memoryDb()
    const opus = makeAgent(db, { name: 'opus', concurrency: 1 })
    const sonnet = makeAgent(db, { name: 'sonnet', concurrency: 2 })
    const group = repo.insertGroup(db, {
      name: 'g',
      description: '',
      strategy: 'priority',
      memberIds: [opus, sonnet],
      sortOrder: 0
    }).id

    const p1 = makeProject(db, { name: 'p1', targetId: group, targetKind: 'group', priority: 0 })
    const p2 = makeProject(db, { name: 'p2', targetId: group, targetKind: 'group', priority: 1 })
    makeTask(db, p1, 't1')
    makeTask(db, p2, 't2')

    const s = scheduler(db)
    const first = s.claimNext()
    expect(first?.agentId).toBe(opus)
    expect(first?.groupId).toBe(group)

    // opus has parallelism 1, so it fills up. Next goes to sonnet.
    occupy(db, first!.task.id, opus)
    expect(s.claimNext()?.agentId).toBe(sonnet)
  })

  it('picks the least-occupied member with least-busy', () => {
    const db = memoryDb()
    const small = makeAgent(db, { name: 'small', concurrency: 1 })
    const big = makeAgent(db, { name: 'big', concurrency: 4 })
    const group = repo.insertGroup(db, {
      name: 'g',
      description: '',
      strategy: 'least-busy',
      memberIds: [small, big],
      sortOrder: 0
    }).id
    const p = makeProject(db, {
      name: 'p',
      targetId: group,
      targetKind: 'group',
      maxConcurrent: 9
    })

    const busy = makeTask(db, p, 'busy')
    occupy(db, busy, small)
    makeTask(db, p, 'next')

    expect(scheduler(db).claimNext()?.agentId).toBe(big)
  })
})

describe('scheduler status', () => {
  it('does not pick up while paused', async () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const p = makeProject(db, { name: 'p', targetId: agent })
    makeTask(db, p, 'task')

    const s = scheduler(db)
    s.pause()
    await s.tick()
    expect(repo.getTask(db, repo.listTasks(db)[0].id)?.status).toBe('queued')
  })

  it('reflects the slot count and the cooldown in the status', () => {
    const db = memoryDb()
    const a = makeAgent(db, { name: 'a', concurrency: 2 })
    makeAgent(db, { name: 'b', concurrency: 3, enabled: false })
    const p = makeProject(db, { name: 'p', targetId: a, maxConcurrent: 5 })
    const t = makeTask(db, p, 'busy')
    occupy(db, t, a)
    repo.setCooldown(db, a, isoPlusSeconds(300), 'limit')

    const status = scheduler(db).status()
    expect(status.totalSlots).toBe(2) // a disabled agent is not counted
    expect(status.activeRuns).toBe(1)
    expect(status.agents.find((x) => x.agentId === a)?.cooldownUntil).toBeTruthy()
    expect(status.warnings.some((w) => w.includes('Limit'))).toBe(true)
  })
})
