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

/** Word for word what Claude Code prints when one model's share of the week is spent. */
const FABLE_LIMIT =
  "You've reached your Fable limit. Switch to another model, or manage usage credits at" +
  ' claude.ai/settings/usage, to continue.'

/**
 * A limit on one model, announced without a moment.
 *
 * Claude Code says "You've reached your Fable limit. Switch to another model" - the account is
 * fine, that one model is spent, and no clock is given. Switching models is exactly what the
 * fallback chain is for, so this is the case it has to cover.
 */
function modelLimitFixture(): { db: ReturnType<typeof memoryDb>; runner: Runner; scheduler: Scheduler; spent: string; fallback: string; project: string } {
  const db = memoryDb()
  const runner = new Runner(db)
  const script = `echo "${FABLE_LIMIT}" >&2; exit 1`
  const fallback = makeAgent(db, {
    name: 'Opus',
    command: '/bin/echo',
    argsTemplate: ['ok'],
    sortOrder: 1
  })
  const spent = makeAgent(db, {
    name: 'Fable',
    command: '/bin/sh',
    argsTemplate: ['-c', script],
    resumeArgsTemplate: ['-c', script],
    fallbackAgentId: fallback,
    cooldownSeconds: 900,
    sortOrder: 0
  })
  const group = repo.insertGroup(db, {
    name: 'Frontier Agents',
    description: '',
    strategy: 'least-busy',
    memberIds: [spent],
    sortOrder: 0
  }).id
  const project = makeProject(db, {
    name: 'p',
    targetKind: 'group',
    targetId: group,
    path: workdir,
    maxConcurrent: 1
  })
  return { db, runner, scheduler: new Scheduler(db, runner), spent, fallback, project }
}

describe('a Limit on one model, with no moment named', () => {
  it('moves the task to the fallback agent instead of handing it to a human', async () => {
    const f = modelLimitFixture()
    const task = makeTask(f.db, f.project, 'sql-catalogパッケージの作成')

    const done = finishes(f.runner, 2)
    await f.scheduler.tick()
    await done

    // Newest first: the model that was spent, then the one it falls back to
    const runs = repo.listRunsByTask(f.db, task)
    expect(runs.map((r) => r.agentId)).toEqual([f.fallback, f.spent])
    expect(runs[1].status).toBe('limited')
    expect(repo.getTask(f.db, task)?.status).toBe('review')
  })

  it('stops feeding the rest of the queue to the model that is spent', async () => {
    const f = modelLimitFixture()
    const tasks = ['sql-catalog', 'sql-fixture', 'sql-parser'].map((title) =>
      makeTask(f.db, f.project, title)
    )

    // One run into the wall, then each task once on the fallback
    const done = finishes(f.runner, 4)
    await f.scheduler.tick()
    await done

    const spent = tasks.flatMap((id) => repo.listRunsByTask(f.db, id)).filter((r) => r.agentId === f.spent)
    expect(spent).toHaveLength(1)
    // Not one of them is left for a human to clear
    expect(tasks.map((id) => repo.getTask(f.db, id)?.status)).toEqual(['review', 'review', 'review'])
  })
})

/** A run that has already happened, put into the history the way the store keeps it. */
function pastRun(
  f: ReturnType<typeof modelLimitFixture>,
  agentId: string,
  status: 'limited' | 'succeeded',
  startedAt: Date,
  errorMessage = ''
): void {
  const id = `run_${Math.random().toString(36).slice(2, 12)}`
  repo.insertRun(f.db, {
    id,
    taskId: makeTask(f.db, f.project, '先週の作業', 2, 'draft'),
    agentId,
    resolvedFromGroupId: null,
    sessionId: `sess-${id}`,
    kind: 'initial',
    status,
    attempt: 1,
    fallbackFromRunId: null,
    pid: null,
    cwd: workdir,
    command: '/bin/sh',
    args: [],
    promptPreview: '',
    exitCode: status === 'limited' ? 1 : 0,
    errorKind: status === 'limited' ? 'limit' : null,
    errorMessage,
    sessionLogPath: null,
    stdoutLogPath: '/tmp/x.log',
    startedAt: startedAt.toISOString()
  })
}

const DAY_MS = 86_400_000

/**
 * The one turn of the week Quuu watched: the model walled, then a run that went through.
 *
 * Twelve days ago it was out; ten days ago, twelve minutes past the hour, it answered again. The
 * allowance turns on the hour, so the next one is that hour plus whole weeks - four days from now.
 */
function watchedTheWeekTurn(f: ReturnType<typeof modelLimitFixture>): string {
  const back = Math.floor((Date.now() - 10 * DAY_MS) / 3_600_000) * 3_600_000 + 12 * 60_000
  pastRun(f, f.spent, 'limited', new Date(back - 2 * DAY_MS), FABLE_LIMIT)
  pastRun(f, f.spent, 'succeeded', new Date(back))
  return new Date(back - 12 * 60_000 + 14 * DAY_MS).toISOString()
}

/**
 * A Limit on one model, on an account whose week Quuu has already seen turn.
 *
 * Claude Code never prints when a model's own limit lifts, because that share is a slice of the
 * **weekly** allowance and only the usage screen says when the week turns. Cooling the model for
 * the configured fifteen minutes puts the conversation back in front of the same wall ninety-six
 * times a day and spends its five attempts before dinner, on a wall that stands for days.
 */
describe('a Limit on one model, on a week that has been watched turn', () => {
  it('cools the model until the week turns again, not for the configured guess', async () => {
    const f = modelLimitFixture()
    const turnsAt = watchedTheWeekTurn(f)
    makeTask(f.db, f.project, 'sql-catalogパッケージの作成')

    const done = finishes(f.runner, 2)
    await f.scheduler.tick()
    await done

    expect(repo.cooldownEnd(f.db, f.spent)).toBe(turnsAt)
  })

  it('parks the conversation only that model can answer until then', async () => {
    const f = modelLimitFixture()
    const turnsAt = watchedTheWeekTurn(f)
    // A follow-up belongs to the session the spent model opened, so no fallback may take it
    const task = makeTask(f.db, f.project, 'Fuzzの再編')
    sessioned(f.db, task, f.spent, 'queued', { pendingMessage: 'please continue' })

    const done = finishes(f.runner, 1)
    await f.scheduler.tick()
    await done

    const after = repo.getTask(f.db, task)!
    expect(after.status).toBe('queued')
    expect(after.scheduledAt).toBe(turnsAt)
    expect(repo.readyTaskIds(f.db, new Date().toISOString()).map((r) => r.task_id)).not.toContain(task)
  })

  it('goes back to the configured guess while no turn has been watched', async () => {
    const f = modelLimitFixture()
    makeTask(f.db, f.project, 'sql-catalogパッケージの作成')

    const before = Date.now()
    const done = finishes(f.runner, 2)
    await f.scheduler.tick()
    await done

    // Nothing to predict from yet, so the quarter-hour probe is what buys the first observation
    const until = Date.parse(repo.cooldownEnd(f.db, f.spent) ?? '')
    expect(until - before).toBeGreaterThan(14 * 60_000)
    expect(until - before).toBeLessThan(16 * 60_000)
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
