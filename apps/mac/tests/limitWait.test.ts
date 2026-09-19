import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import {
  isolateSessionDirs,
  makeAgent,
  makeProject,
  makeTask,
  memoryDb,
  releaseSessionDirs,
  sessioned
} from './helpers.js'

/**
 * A Limit takes the task out of the queue until the agent is really back.
 *
 * What this locks down actually happened: Codex announced "try again at Sep 19th, 2026 7:13 PM",
 * Quuu cooled it for the configured fifteen minutes and re-queued the follow-up. Follow-ups lead the
 * queue, so every quarter of an hour that one task took its project's single slot, died in seconds
 * against an account that was still out, and spent one of its attempts - until the attempts ran out
 * and it was handed to a human who could do nothing about it until the next evening. For those
 * hours nothing else in that project moved.
 */

let workdir: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'taskd-limit-'))
  process.env.QUUU_USER_DATA = workdir
  isolateSessionDirs(workdir)
})

afterEach(() => {
  releaseSessionDirs()
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

/** Resolve once that many runs have ended, however many ticks it took. */
function finishes(runner: Runner, count: number): Promise<void> {
  return new Promise((resolve) => {
    let seen = 0
    runner.on('finished', () => {
      if (++seen >= count) setTimeout(resolve, 50)
    })
  })
}

function stamp(at: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/** Tomorrow evening: far enough out that no cooldown a human would configure reaches it. */
function tomorrowEvening(): Date {
  const at = new Date()
  at.setDate(at.getDate() + 1)
  at.setHours(19, 13, 0, 0)
  return at
}

/** An agent whose CLI does nothing but announce a limit, naming when it lifts. */
function limitedAgent(db: ReturnType<typeof memoryDb>, liftsAt: Date): string {
  const script = `echo "ERROR: You've hit your usage limit. Try again at ${stamp(liftsAt)}." >&2; exit 1`
  return makeAgent(db, {
    name: 'Codex',
    command: '/bin/sh',
    argsTemplate: ['-c', script],
    resumeArgsTemplate: ['-c', script],
    cooldownSeconds: 900,
    sortOrder: 0
  })
}

interface Fixture {
  db: ReturnType<typeof memoryDb>
  runner: Runner
  scheduler: Scheduler
  limited: string
  healthy: string
  project: string
  liftsAt: Date
}

/**
 * One project, one slot, two agents: the one that is out, and one that is fine.
 * The same shape as the real case - a group whose first member had hit its limit.
 */
function fixture(): Fixture {
  const db = memoryDb()
  const runner = new Runner(db)
  const liftsAt = tomorrowEvening()
  const limited = limitedAgent(db, liftsAt)
  const healthy = makeAgent(db, {
    name: 'Fable',
    command: '/bin/echo',
    argsTemplate: ['ok'],
    sortOrder: 1
  })
  const group = repo.insertGroup(db, {
    name: 'Frontier Agents',
    description: '',
    strategy: 'least-busy',
    memberIds: [limited, healthy],
    sortOrder: 0
  }).id
  const project = makeProject(db, {
    name: 'p',
    targetKind: 'group',
    targetId: group,
    path: workdir,
    maxConcurrent: 1
  })
  return { db, runner, scheduler: new Scheduler(db, runner), limited, healthy, project, liftsAt }
}

/** A task mid-conversation with the limited agent: only that agent may answer it. */
function followupOn(f: Fixture, title: string): string {
  const task = makeTask(f.db, f.project, title)
  sessioned(f.db, task, f.limited, 'queued', { pendingMessage: 'please continue' })
  return task
}

describe('the latest run of a task', () => {
  it('is the later insert when two runs share a start time', () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'a' })
    const project = makeProject(db, { name: 'p', targetId: agent, path: workdir })
    const task = makeTask(db, project, 't')
    const at = '2026-09-19T12:00:00.000Z'
    const seed = (id: string, status: 'succeeded' | 'limited'): void => {
      repo.insertRun(db, {
        id,
        taskId: task,
        agentId: agent,
        resolvedFromGroupId: null,
        sessionId: `sess-${id}`,
        kind: 'initial',
        status,
        attempt: 1,
        fallbackFromRunId: null,
        pid: null,
        cwd: workdir,
        command: 'echo',
        args: [],
        promptPreview: '',
        exitCode: null,
        errorKind: null,
        errorMessage: '',
        sessionLogPath: null,
        stdoutLogPath: '/tmp/x.log',
        startedAt: at
      })
    }
    seed('run_old', 'succeeded')
    seed('run_new', 'limited')
    expect(repo.listRunsByTask(db, task)[0].id).toBe('run_new')
  })
})

describe('a Limit that says when it lifts', () => {
  it('cools the agent until the moment it named, not for the configured guess', async () => {
    const f = fixture()
    followupOn(f, 'Fuzzの再編')

    const done = finishes(f.runner, 1)
    await f.scheduler.tick()
    await done

    // The configured 900 s would have brought it back in fifteen minutes, to the same wall
    expect(repo.cooldownEnd(f.db, f.limited)).toBe(f.liftsAt.toISOString())
  })

  it('reports the announcement as the reason, so the run history says what happened', async () => {
    const f = fixture()
    const task = followupOn(f, 'Fuzzの再編')

    const done = finishes(f.runner, 1)
    await f.scheduler.tick()
    await done

    const run = repo.listRunsByTask(f.db, task)[0]
    expect(run.status).toBe('limited')
    expect(run.errorMessage).toContain('usage limit')
  })

  it('parks the task out of the queue until then, rather than retrying into the same wall', async () => {
    const f = fixture()
    const task = followupOn(f, 'Fuzzの再編')

    const done = finishes(f.runner, 1)
    await f.scheduler.tick()
    await done

    const after = repo.getTask(f.db, task)!
    // Still queued - this is a wait, not a failure a human has to clear
    expect(after.status).toBe('queued')
    expect(after.scheduledAt).toBe(f.liftsAt.toISOString())
    // And it is no longer competing for the slot
    expect(repo.readyTaskIds(f.db, new Date().toISOString()).map((r) => r.task_id)).not.toContain(task)
    expect(repo.queuePositions(f.db).get(task)).toBeUndefined()
  })

  it('lets the task behind it have the slot while it waits', async () => {
    const f = fixture()
    followupOn(f, 'Fuzzの再編')
    const next = makeTask(f.db, f.project, 'sql-parserパッケージの作成')

    const done = finishes(f.runner, 2)
    await f.scheduler.tick()
    await done

    // The limited agent is out, so the one behind it runs on the other member of the group
    const run = repo.listRunsByTask(f.db, next)[0]
    expect(run?.agentId).toBe(f.healthy)
    expect(repo.getTask(f.db, next)?.status).toBe('review')
  })

  it('does not park a task that another agent could take right now', async () => {
    const f = fixture()
    // An initial run belongs to nobody yet, so a limit just moves it to the other member
    const task = makeTask(f.db, f.project, 'sql-parserパッケージの作成')

    const done = finishes(f.runner, 2)
    await f.scheduler.tick()
    await done

    const runs = repo.listRunsByTask(f.db, task)
    expect(runs.map((r) => r.agentId)).toEqual([f.healthy, f.limited])
    expect(runs[1].status).toBe('limited')
    expect(repo.getTask(f.db, task)?.scheduledAt).toBeNull()
  })

  it('never pulls a schedule a human set any earlier', async () => {
    const f = fixture()
    const task = followupOn(f, 'Fuzzの再編')
    // Scheduled for the day after the limit lifts, then run by hand before that comes round
    const later = new Date(f.liftsAt.getTime() + 86_400_000).toISOString()
    repo.patchTask(f.db, task, { scheduledAt: later })

    const done = finishes(f.runner, 1)
    await f.scheduler.runNow(task)
    await done

    expect(repo.getTask(f.db, task)?.scheduledAt).toBe(later)
  })
})
