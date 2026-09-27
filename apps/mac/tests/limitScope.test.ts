import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LogAdapter } from '../src/main/agents/cliAdapter.js'
import * as repo from '../src/main/db/repo.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { isolateSessionDirs, makeAgent, makeProject, makeTask, memoryDb, releaseSessionDirs } from './helpers.js'

/**
 * Which allowance a Limit spent, and so who waits it out.
 *
 * One CLI is not one allowance. Claude's account runs out as a whole, and one model's share (Fable)
 * runs out on its own while Opus and Sonnet on the same account still answer. Quuu keeps a Limit on
 * the definition that hit it; these lock down exactly who that cools and whose runs say when a
 * model's week turns, so a change to either is a decision someone made rather than a side effect.
 */

let workdir: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'quuu-limit-scope-'))
  process.env.QUUU_USER_DATA = workdir
  isolateSessionDirs(workdir)
})

afterEach(() => {
  releaseSessionDirs()
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

const FABLE_LIMIT =
  "You've reached your Fable limit. Switch to another model, or manage usage credits at" +
  ' claude.ai/settings/usage, to continue.'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

function stamp(at: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/** Tomorrow evening: beyond any cooldown a definition configures. */
function tomorrowEvening(): Date {
  const at = new Date()
  at.setDate(at.getDate() + 1)
  at.setHours(19, 13, 0, 0)
  return at
}

type Db = ReturnType<typeof memoryDb>

/**
 * A stand-in for one CLI on one account: `--model <name>` picks the model, and the script answers
 * with whatever that model has been told to print. It never contacts an agent service.
 */
function cli(outputs: Record<string, string>): string {
  const command = join(workdir, 'agent')
  const cases = Object.entries(outputs)
    .map(([model, line]) => `  ${model}) echo "${line}" >&2; exit 1 ;;`)
    .join('\n')
  writeFileSync(command, `#!/bin/sh\ncase "$2" in\n${cases}\n  *) echo ok ;;\nesac\n`, { mode: 0o755 })
  return command
}

function definition(db: Db, command: string, name: string, model: string, logAdapter: LogAdapter = 'claude'): string {
  return makeAgent(db, {
    name,
    command,
    argsTemplate: ['--model', model, '-p', '{{prompt}}'],
    cooldownSeconds: 900,
    logAdapter
  })
}

/** Run one task on that definition, alone and with nowhere to fall back to. */
async function runOnce(db: Db, agentId: string): Promise<void> {
  const runner = new Runner(db)
  const scheduler = new Scheduler(db, runner)
  const project = makeProject(db, { name: 'p', targetKind: 'agent', targetId: agentId, path: workdir, maxConcurrent: 1 })
  makeTask(db, project, 'work')
  const finished = new Promise<void>((resolve) => runner.once('finished', () => setTimeout(resolve, 50)))
  await scheduler.tick()
  await finished
  scheduler.stop()
}

function pastRun(db: Db, agentId: string, status: 'limited' | 'succeeded', startedAt: Date, errorMessage = ''): void {
  const project = makeProject(db, { name: `history ${agentId}`, targetKind: 'agent', targetId: agentId, path: workdir })
  const id = `run_${Math.random().toString(36).slice(2, 12)}`
  repo.insertRun(db, {
    id,
    taskId: makeTask(db, project, 'last week', 2, 'draft'),
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

/** A Fable limit ten days ago followed by a run that went through: the week turn Quuu watched. */
function watchedTheWeekTurn(db: Db, agentId: string): string {
  const back = Math.floor((Date.now() - 10 * DAY_MS) / HOUR_MS) * HOUR_MS + 12 * 60_000
  pastRun(db, agentId, 'limited', new Date(back - 2 * DAY_MS), FABLE_LIMIT)
  pastRun(db, agentId, 'succeeded', new Date(back))
  return new Date(back - 12 * 60_000 + 14 * DAY_MS).toISOString()
}

/** The configured fifteen minutes, give or take the time the run took. */
function expectConfiguredGuess(db: Db, agentId: string, before: number): void {
  const until = Date.parse(repo.cooldownEnd(db, agentId) ?? '')
  expect(until - before).toBeGreaterThan(14 * 60_000)
  expect(until - before).toBeLessThan(16 * 60_000)
}

describe('a Limit on one model', () => {
  it('cools only the definition that ran that model, leaving the others on the account free', async () => {
    const db = memoryDb()
    const command = cli({ fable: FABLE_LIMIT })
    const fable = definition(db, command, 'Fable', 'fable')
    const opus = definition(db, command, 'Opus', 'opus')
    const sonnet = definition(db, command, 'Sonnet', 'sonnet')

    await runOnce(db, fable)

    expect(repo.cooldownEnd(db, fable)).not.toBeNull()
    expect(repo.cooldownEnd(db, opus)).toBeNull()
    expect(repo.cooldownEnd(db, sonnet)).toBeNull()
  })

  it('predicts the week off that definition\'s own runs', async () => {
    const db = memoryDb()
    const fable = definition(db, cli({ fable: FABLE_LIMIT }), 'Fable', 'fable')
    const turnsAt = watchedTheWeekTurn(db, fable)

    await runOnce(db, fable)

    expect(repo.cooldownEnd(db, fable)).toBe(turnsAt)
  })

  it('does not borrow a week another definition of the same model watched turn', async () => {
    const db = memoryDb()
    const command = cli({ fable: FABLE_LIMIT })
    const fable = definition(db, command, 'Fable', 'fable')
    const review = definition(db, command, 'Fable (review)', 'fable')
    watchedTheWeekTurn(db, review)

    const before = Date.now()
    await runOnce(db, fable)

    expectConfiguredGuess(db, fable, before)
    expect(repo.cooldownEnd(db, review)).toBeNull()
  })

  it('is read as one model\'s share only from Claude\'s wording, not from another CLI printing the same words', async () => {
    const db = memoryDb()
    const codex = definition(db, cli({ fable: FABLE_LIMIT }), 'Codex', 'fable', 'codex')
    watchedTheWeekTurn(db, codex)

    const before = Date.now()
    await runOnce(db, codex)

    expectConfiguredGuess(db, codex, before)
  })
})

describe('a Limit on the whole account', () => {
  it('cools the definition that hit it until the moment it named, and only that one', async () => {
    const db = memoryDb()
    const liftsAt = tomorrowEvening()
    const command = cli({ opus: `You've hit your usage limit. Try again at ${stamp(liftsAt)}.` })
    const opus = definition(db, command, 'Opus', 'opus')
    const sonnet = definition(db, command, 'Sonnet', 'sonnet')
    const fable = definition(db, command, 'Fable', 'fable')

    await runOnce(db, opus)

    expect(repo.cooldownEnd(db, opus)).toBe(liftsAt.toISOString())
    // Today's policy: the account's other definitions each find out on their own run
    expect(repo.cooldownEnd(db, sonnet)).toBeNull()
    expect(repo.cooldownEnd(db, fable)).toBeNull()
  })

  it('is never read as a model\'s week, even with a watched turn behind it', async () => {
    const db = memoryDb()
    const opus = definition(db, cli({ opus: "You've hit your usage limit." }), 'Opus', 'opus')
    watchedTheWeekTurn(db, opus)

    const before = Date.now()
    await runOnce(db, opus)

    expectConfiguredGuess(db, opus, before)
  })
})
