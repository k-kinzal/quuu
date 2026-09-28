import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adapterFor } from '../src/main/agent-adapters/registry.js'
import type { LogAdapter } from '../src/main/agents/cliAdapter.js'
import * as repo from '../src/main/db/repo.js'
import { limitHolders } from '../src/main/execution/conditions.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { isolateSessionDirs, makeAgent, makeProject, makeTask, memoryDb, releaseSessionDirs } from './helpers.js'

/**
 * Which allowance a Limit spent, and so who waits it out.
 *
 * One CLI is not one allowance. Claude's account runs out as a whole, and one model's share (Fable)
 * runs out on its own while Opus and Sonnet on the same account still answer. A Limit holds back
 * every definition drawing on the allowance it spent - no more, because a definition idled for
 * nothing is work not done, and no fewer, because each one left out walks into the same wall.
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
 * with whatever that model has been told to print - until the allowance comes `back`, after which
 * everything goes through. It never contacts an agent service.
 */
function cli(outputs: Record<string, string>): string {
  const command = join(workdir, 'agent')
  const cases = Object.entries(outputs)
    .map(([model, line]) => `  ${model}) echo "${line}" >&2; exit 1 ;;`)
    .join('\n')
  const back = join(workdir, 'back')
  writeFileSync(command, `#!/bin/sh\n[ -f "${back}" ] && { echo ok; exit 0; }\ncase "$2" in\n${cases}\n  *) echo ok ;;\nesac\n`, { mode: 0o755 })
  return command
}

function definition(
  db: Db,
  command: string,
  name: string,
  model: string,
  logAdapter: LogAdapter = 'claude',
  env: Record<string, string> = {}
): string {
  return makeAgent(db, {
    name,
    command,
    argsTemplate: ['--model', model, '-p', '{{prompt}}'],
    cooldownSeconds: 900,
    logAdapter,
    env
  })
}

interface Ran {
  runner: Runner
  scheduler: Scheduler
  task: string
}

function finished(runner: Runner): Promise<void> {
  return new Promise((resolve) => runner.once('finished', () => setTimeout(resolve, 50)))
}

/** Run one task on that definition, alone and with nowhere to fall back to. */
async function runOnce(db: Db, agentId: string): Promise<Ran> {
  const runner = new Runner(db)
  const scheduler = new Scheduler(db, runner)
  const project = makeProject(db, { name: 'p', targetKind: 'agent', targetId: agentId, path: workdir, maxConcurrent: 1 })
  const task = makeTask(db, project, 'work')
  const done = finished(runner)
  await scheduler.tick()
  await done
  scheduler.stop()
  return { runner, scheduler, task }
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
  it('cools every definition on that model, and none on the others', async () => {
    const db = memoryDb()
    const command = cli({ fable: FABLE_LIMIT })
    const fable = definition(db, command, 'Fable', 'fable')
    const review = definition(db, command, 'Fable (review)', 'claude-fable-5-1')
    const opus = definition(db, command, 'Opus', 'opus')
    const sonnet = definition(db, command, 'Sonnet', 'sonnet')

    await runOnce(db, fable)

    expect(repo.cooldownEnd(db, fable)).not.toBeNull()
    expect(repo.cooldownEnd(db, review)).toBe(repo.cooldownEnd(db, fable))
    expect(repo.cooldownEnd(db, opus)).toBeNull()
    expect(repo.cooldownEnd(db, sonnet)).toBeNull()
  })

  it('leaves the same model on another account alone', async () => {
    const db = memoryDb()
    const command = cli({ fable: FABLE_LIMIT })
    const fable = definition(db, command, 'Fable', 'fable')
    const work = definition(db, command, 'Fable (work account)', 'fable', 'claude', { CLAUDE_CONFIG_DIR: '/work' })

    await runOnce(db, fable)

    expect(repo.cooldownEnd(db, fable)).not.toBeNull()
    expect(repo.cooldownEnd(db, work)).toBeNull()
  })

  it('predicts the week off that definition\'s own runs', async () => {
    const db = memoryDb()
    const fable = definition(db, cli({ fable: FABLE_LIMIT }), 'Fable', 'fable')
    const turnsAt = watchedTheWeekTurn(db, fable)

    await runOnce(db, fable)

    expect(repo.cooldownEnd(db, fable)).toBe(turnsAt)
  })

  it('predicts it off a week another definition of the same model watched turn', async () => {
    const db = memoryDb()
    const command = cli({ fable: FABLE_LIMIT })
    const fable = definition(db, command, 'Fable', 'fable')
    const review = definition(db, command, 'Fable (review)', 'fable')
    const turnsAt = watchedTheWeekTurn(db, review)

    await runOnce(db, fable)

    expect(repo.cooldownEnd(db, fable)).toBe(turnsAt)
    expect(repo.cooldownEnd(db, review)).toBe(turnsAt)
  })

  it('is read as one model\'s share only from Claude\'s wording, not from another CLI printing the same words', async () => {
    const db = memoryDb()
    const command = cli({ fable: FABLE_LIMIT })
    const codex = definition(db, command, 'Codex', 'fable', 'codex')
    const other = definition(db, command, 'Codex (other)', 'fable', 'codex')
    watchedTheWeekTurn(db, codex)

    const before = Date.now()
    await runOnce(db, codex)

    expectConfiguredGuess(db, codex, before)
    expect(repo.cooldownEnd(db, other)).toBeNull()
  })
})

describe('a Limit on the whole account', () => {
  it('cools every definition on the account until the moment it named', async () => {
    const db = memoryDb()
    const liftsAt = tomorrowEvening()
    const command = cli({ opus: `You've hit your usage limit. Try again at ${stamp(liftsAt)}.` })
    const opus = definition(db, command, 'Opus', 'opus')
    const sonnet = definition(db, command, 'Sonnet', 'sonnet')
    const fable = definition(db, command, 'Fable', 'fable')

    await runOnce(db, opus)

    for (const id of [opus, sonnet, fable]) expect(repo.cooldownEnd(db, id)).toBe(liftsAt.toISOString())
  })

  it('leaves another CLI, and the same CLI signed in elsewhere, alone', async () => {
    const db = memoryDb()
    const command = cli({ opus: "You've hit your session limit · resets 10:40pm" })
    const opus = definition(db, command, 'Opus', 'opus')
    const codex = definition(db, command, 'Codex', 'opus', 'codex')
    const elsewhere = definition(db, command, 'Opus (API key)', 'opus', 'claude', { ANTHROPIC_API_KEY: 'test' })
    const otherPath = definition(db, `${command}-2`, 'Opus (other install)', 'opus')

    await runOnce(db, opus)

    expect(repo.cooldownEnd(db, opus)).not.toBeNull()
    for (const id of [codex, elsewhere, otherPath]) expect(repo.cooldownEnd(db, id)).toBeNull()
  })

  it('does not cut short a longer wait another definition already holds', async () => {
    const db = memoryDb()
    const liftsAt = tomorrowEvening()
    const command = cli({ opus: `You've hit your usage limit. Try again at ${stamp(liftsAt)}.` })
    const opus = definition(db, command, 'Opus', 'opus')
    const fable = definition(db, command, 'Fable', 'fable')
    const nextWeek = new Date(Date.now() + 6 * DAY_MS).toISOString()
    repo.setCooldown(db, fable, nextWeek, FABLE_LIMIT)

    await runOnce(db, opus)

    expect(repo.cooldownEnd(db, fable)).toBe(nextWeek)
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

describe('a Limit that names no allowance', () => {
  it('holds back only the definition that met it', async () => {
    const db = memoryDb()
    const command = cli({ opus: 'API Error: 529 Overloaded. This is a server-side issue, usually temporary.' })
    const opus = definition(db, command, 'Opus', 'opus')
    const sonnet = definition(db, command, 'Sonnet', 'sonnet')

    await runOnce(db, opus)

    expect(repo.cooldownEnd(db, opus)).not.toBeNull()
    expect(repo.cooldownEnd(db, sonnet)).toBeNull()
  })
})

describe('a Limit on Cursor', () => {
  it('holds back only the definition that met it, since its own models and the others run out apart', async () => {
    const db = memoryDb()
    const command = cli({ 'claude-fable-5-1-thinking-high': "You've hit your usage limit" })
    const fable = definition(db, command, 'Cursor (Fable)', 'claude-fable-5-1-thinking-high', 'cursor')
    const grok = definition(db, command, 'Cursor (Grok)', 'cursor-grok-4.6-high', 'cursor')

    await runOnce(db, fable)

    expect(repo.cooldownEnd(db, fable)).not.toBeNull()
    expect(repo.cooldownEnd(db, grok)).toBeNull()
  })
})

describe('an allowance coming back', () => {
  function accountOut(db: Db): { opus: string; sonnet: string; unrelated: string } {
    const command = cli({ opus: `You've hit your usage limit. Try again at ${stamp(tomorrowEvening())}.` })
    const opus = definition(db, command, 'Opus', 'opus')
    const sonnet = definition(db, command, 'Sonnet', 'sonnet')
    // On the same account, but waiting on something else
    const unrelated = definition(db, command, 'Fable', 'fable')
    repo.setCooldown(db, unrelated, new Date(Date.now() + 6 * DAY_MS).toISOString(), FABLE_LIMIT)
    return { opus, sonnet, unrelated }
  }

  it('is lifted for every definition waiting on it when a human resets one', async () => {
    const db = memoryDb()
    const { opus, sonnet, unrelated } = accountOut(db)
    const { scheduler } = await runOnce(db, opus)
    expect(repo.cooldownEnd(db, sonnet)).not.toBeNull()

    scheduler.resetAgentLimit(sonnet)

    expect(repo.cooldownEnd(db, opus)).toBeNull()
    expect(repo.cooldownEnd(db, sonnet)).toBeNull()
    expect(repo.cooldownEnd(db, unrelated)).not.toBeNull()
  })

  it('is lifted for every definition waiting on it when a run started through it goes through', async () => {
    const db = memoryDb()
    const { opus, sonnet, unrelated } = accountOut(db)
    const { runner, task } = await runOnce(db, opus)
    writeFileSync(join(workdir, 'back'), '')
    const scheduler = new Scheduler(db, runner)

    const done = finished(runner)
    expect((await scheduler.runNow(task)).ok).toBe(true)
    await done
    scheduler.stop()

    expect(repo.getTask(db, task)?.status).toBe('review')
    expect(repo.cooldownEnd(db, opus)).toBeNull()
    expect(repo.cooldownEnd(db, sonnet)).toBeNull()
    expect(repo.cooldownEnd(db, unrelated)).not.toBeNull()
  })

  it('moves together when the moment is read again at startup', async () => {
    const db = memoryDb()
    const { opus, sonnet } = accountOut(db)
    const { runner } = await runOnce(db, opus)
    const reason = repo.listCooldowns(db).find((cooldown) => cooldown.agentId === opus)!.reason
    // As an older build that misread the moment would have left them
    const soon = new Date(Date.now() + 5 * 60_000).toISOString()
    repo.setCooldown(db, opus, soon, reason)
    repo.setCooldown(db, sonnet, soon, reason)

    new Scheduler(db, runner).reconcile()

    expect(repo.cooldownEnd(db, opus)).toBe(tomorrowEvening().toISOString())
    expect(repo.cooldownEnd(db, sonnet)).toBe(tomorrowEvening().toISOString())
  })
})

describe('reading which allowance a limit spent', () => {
  it('reads each CLI\'s own wording', () => {
    const claude = adapterFor('claude')
    expect(claude.limitScope(FABLE_LIMIT)).toEqual({ kind: 'model', model: 'Fable' })
    expect(claude.limitScope("You've hit your weekly limit · resets Sep 28 at 7pm (Asia/Tokyo)")).toEqual({ kind: 'account' })
    expect(claude.limitScope("You've hit your session limit · resets 4:20am (Asia/Tokyo)")).toEqual({ kind: 'account' })
    expect(claude.limitScope('API Error: 529 Overloaded. This is a server-side issue')).toEqual({ kind: 'unstated' })
    const codex = adapterFor('codex')
    expect(codex.limitScope("ERROR: You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 7:13 PM."))
      .toEqual({ kind: 'account' })
    expect(codex.limitScope('ERROR: Selected model is at capacity. Please try a different model.')).toEqual({ kind: 'unstated' })
  })

  it('lets only Claude name one model\'s share', () => {
    for (const id of ['codex', 'cursor', 'copilot', 'grok', 'agy', 'opencode', 'stdout'] as const) {
      expect(adapterFor(id).limitScope(FABLE_LIMIT).kind).not.toBe('model')
    }
  })

  it('reads the model a definition selects, wherever its CLI takes it from', () => {
    const claude = adapterFor('claude')
    expect(claude.modelOf({ argsTemplate: ['-p', '--model', 'opus'], env: {} })).toBe('opus')
    expect(claude.modelOf({ argsTemplate: ['--model=claude-fable-5-1'], env: {} })).toBe('claude-fable-5-1')
    expect(claude.modelOf({ argsTemplate: ['-p'], env: { ANTHROPIC_MODEL: 'fable' } })).toBe('fable')
    expect(claude.modelOf({ argsTemplate: ['-p'], env: {} })).toBeNull()
    expect(adapterFor('codex').modelOf({ argsTemplate: ['exec', '-m', 'gpt-5.5'], env: {} })).toBe('gpt-5.5')
  })

  it('works out a moment only for one model\'s week, and only from a watched turn', () => {
    const turn = [
      { status: 'succeeded' as const, errorMessage: '', startedAt: new Date(Date.now() - 10 * DAY_MS).toISOString() },
      { status: 'limited' as const, errorMessage: FABLE_LIMIT, startedAt: new Date(Date.now() - 12 * DAY_MS).toISOString() }
    ]
    expect(adapterFor('claude').retryAt({ kind: 'model', model: 'Fable' }, turn)).not.toBeNull()
    expect(adapterFor('claude').retryAt({ kind: 'model', model: 'Opus' }, turn)).toBeNull()
    expect(adapterFor('claude').retryAt({ kind: 'account' }, turn)).toBeNull()
    expect(adapterFor('codex').retryAt({ kind: 'model', model: 'Fable' }, turn)).toBeNull()
  })
})

describe('who holds a Limit', () => {
  const db = (): Db => memoryDb()

  it('is the definitions on the same account drawing on that allowance, the one that met it first', () => {
    const d = db()
    const fable = definition(d, 'claude', 'Fable', 'fable')
    const alias = definition(d, 'claude', 'Fable 5.1', 'claude-fable-5-1')
    const opus = definition(d, 'claude', 'Opus', 'opus[1m]')
    const unnamed = makeAgent(d, { name: 'Default', command: 'claude', argsTemplate: ['-p', '{{prompt}}'] })
    const imported = makeAgent(d, { name: 'Imported', command: 'claude', argsTemplate: ['--model', 'fable'], source: 'imported' })
    const agents = repo.listAgents(d)
    const hit = repo.getAgent(d, fable)!
    const modelOf = (agent: (typeof agents)[number]): string | null => adapterFor('claude').modelOf(agent)
    // The one that met it leads; the order of the rest means nothing
    const ids = (scope: Parameters<typeof limitHolders>[2]): string[] => {
      const [first, ...rest] = limitHolders(hit, agents, scope, modelOf).map((agent) => agent.id)
      return [first, ...rest.sort()]
    }

    expect(ids({ kind: 'model', model: 'Fable' })).toEqual([fable, alias])
    expect(ids({ kind: 'account' })).toEqual([fable, ...[alias, opus, unnamed].sort()])
    expect(ids({ kind: 'unstated' })).toEqual([fable])
    expect(ids({ kind: 'account' })).not.toContain(imported)
  })
})
