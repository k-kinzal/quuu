import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as repo from '../src/main/db/repo.js'
import { CONTINUE_INSTRUCTION } from '../src/main/execution/conditions.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { SessionIndex } from '../src/main/session/index.js'
import { isolateSessionDirs, makeAgent, makeProject, makeTask, memoryDb, releaseSessionDirs } from './helpers.js'

/**
 * An instruction the agent already has is never handed to it twice.
 *
 * What this locks down actually happened: a resume died against a usage limit, and because a CLI
 * writes the instruction into its session the moment it accepts the resume, the instruction was
 * already in that conversation. Quuu kept it waiting and sent the same text on every retry, so one
 * session ended up holding five copies of one instruction - five in what the reader sees, and five
 * in what the model reads on the next turn.
 */

const INSTRUCTION = 'ではcore・DB実装のFuzzを再整備してください。'

let workdir: string
let db: ReturnType<typeof memoryDb>
let index: SessionIndex
let agentId: string
let taskId: string
let logPath: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'quuu-redelivery-'))
  process.env.QUUU_USER_DATA = workdir
  isolateSessionDirs(workdir)
  db = memoryDb()
  index = new SessionIndex(db)
  logPath = join(workdir, 'session.jsonl')
})

/**
 * The CLI this task's session belongs to.
 *
 * Its adapter decides how the conversation is read back - and whether what comes back carries a
 * clock at all, which is the whole difference the second group of cases below is about.
 */
function cli(logAdapter: 'claude' | 'grok'): void {
  agentId = makeAgent(db, {
    name: logAdapter,
    command: '/bin/echo',
    logAdapter,
    resumeArgsTemplate: ['--resume', '{{sessionId}}', '{{prompt}}']
  })
  const projectId = makeProject(db, { name: 'p', path: workdir, targetId: agentId })
  taskId = makeTask(db, projectId, 'Fuzzの再編')
}

afterEach(async () => {
  index.stop()
  await index.settled()
  db.close()
  releaseSessionDirs()
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

/**
 * A resume that reached the agent and then died against a limit, with the follow-up still waiting.
 *
 * `sent` is what that resume actually handed over. It parts ways with what waits when a human
 * writes more on top of an instruction already delivered.
 */
function limitedResume(
  pending: string,
  startedAt: string,
  id = 'run_limited',
  sent = pending
): void {
  repo.insertRun(db, {
    id,
    taskId,
    agentId,
    resolvedFromGroupId: null,
    sessionId: 'sess-1',
    kind: 'followup',
    status: 'limited',
    attempt: 1,
    fallbackFromRunId: null,
    pid: null,
    cwd: workdir,
    command: '/bin/echo',
    args: [],
    promptPreview: sent.slice(0, 500),
    exitCode: 1,
    errorKind: 'limit',
    errorMessage: 'usage limit',
    sessionLogPath: logPath,
    stdoutLogPath: join(workdir, 'run.log'),
    startedAt
  })
  repo.setTaskStatus(db, taskId, 'queued', {
    currentRunId: id,
    sessionId: 'sess-1',
    pendingMessage: pending
  })
}

/** The conversation as the CLI left it: what was written down, with no answer under it. */
async function sessionHolding(written: Array<[string, string]>): Promise<void> {
  writeFileSync(
    logPath,
    written
      .map(([text, at], i) =>
        JSON.stringify({
          type: 'user',
          uuid: `u${i}`,
          timestamp: at,
          message: { content: [{ type: 'text', text }] }
        })
      )
      .join('\n') + '\n'
  )
  index.request(repo.getRun(db, 'run_limited')!)
  await index.settled()
}

/** The same conversation from a CLI that records no time: Grok's `chat_history.jsonl`. */
async function untimedSessionHolding(written: string[]): Promise<void> {
  writeFileSync(
    logPath,
    written
      .map((text, i) =>
        JSON.stringify({
          type: 'user',
          prompt_index: i,
          content: [{ type: 'text', text: `<user_query>\n${text}\n</user_query>` }]
        })
      )
      .join('\n') + '\n'
  )
  index.request(repo.getRun(db, 'run_limited')!)
  await index.settled()
}

function claimed(): string | undefined {
  const scheduler = new Scheduler(db, new Runner(db))
  return scheduler.claimNext()?.params.messageOverride
}

describe('a retry of a resume that died before answering', () => {
  beforeEach(() => cli('claude'))

  it('asks the agent to carry on instead of writing the instruction into the session a second time', async () => {
    limitedResume(INSTRUCTION, '2026-09-18T00:33:13.877Z')
    await sessionHolding([[INSTRUCTION, '2026-09-18T00:33:17.366Z']])

    expect(claimed()).toBe(CONTINUE_INSTRUCTION)
  })

  it('sends only what the agent never received when a follow-up was written on top', async () => {
    limitedResume(`${INSTRUCTION}\n\nplease continue`, '2026-09-18T00:33:13.877Z')
    await sessionHolding([[INSTRUCTION, '2026-09-18T00:33:17.366Z']])

    expect(claimed()).toBe('please continue')
  })

  it('sends the instruction when the session never recorded it', async () => {
    limitedResume(INSTRUCTION, '2026-09-18T00:33:13.877Z')
    // The CLI refused the resume before writing anything: everything in the log predates the run
    await sessionHolding([['an older instruction', '2026-09-17T10:00:00.000Z']])

    expect(claimed()).toBe(INSTRUCTION)
  })

  it('sends the instruction while no conversation can vouch for it', () => {
    limitedResume(INSTRUCTION, '2026-09-18T00:33:13.877Z')

    expect(claimed()).toBe(INSTRUCTION)
  })

  it('does not go back to the instruction because the attempt before only left a nudge', async () => {
    limitedResume(INSTRUCTION, '2026-09-18T00:33:13.877Z')
    limitedResume(INSTRUCTION, '2026-09-18T01:10:11.863Z', 'run_limited_again')
    await sessionHolding([
      [INSTRUCTION, '2026-09-18T00:33:17.366Z'],
      [CONTINUE_INSTRUCTION, '2026-09-18T01:10:17.466Z']
    ])

    expect(claimed()).toBe(CONTINUE_INSTRUCTION)
  })
})

/**
 * The same promise, for a CLI whose conversation carries no clock.
 *
 * Grok writes no timestamp at all, and Cursor's store keeps none either. Reading "what this run
 * wrote" by time there hands back an empty conversation, so every retry read the instruction as
 * undelivered: one real Cursor task was handed the same sentence on all three of its attempts.
 * What the copy the CLI wrote is recognized by here is the instruction itself.
 */
describe('a retry of a resume whose CLI writes no timestamps', () => {
  beforeEach(() => cli('grok'))

  it('asks the agent to carry on once the conversation holds the instruction', async () => {
    limitedResume(INSTRUCTION, '2026-09-18T00:33:13.877Z')
    await untimedSessionHolding([INSTRUCTION])

    expect(claimed()).toBe(CONTINUE_INSTRUCTION)
  })

  it('sends the instruction when the conversation shows no sign of it', async () => {
    limitedResume(INSTRUCTION, '2026-09-18T00:33:13.877Z')
    await untimedSessionHolding(['an older instruction'])

    expect(claimed()).toBe(INSTRUCTION)
  })

  it('sends only what the agent never received when a follow-up was written on top', async () => {
    limitedResume(`${INSTRUCTION}\n\nplease continue`, '2026-09-18T00:33:13.877Z', 'run_limited', INSTRUCTION)
    await untimedSessionHolding([INSTRUCTION])

    expect(claimed()).toBe('please continue')
  })

  it('does not go back to the instruction because the attempt before only left a nudge', async () => {
    limitedResume(INSTRUCTION, '2026-09-18T00:33:13.877Z')
    limitedResume(INSTRUCTION, '2026-09-18T01:10:11.863Z', 'run_limited_again')
    await untimedSessionHolding([INSTRUCTION, CONTINUE_INSTRUCTION])

    expect(claimed()).toBe(CONTINUE_INSTRUCTION)
  })
})
