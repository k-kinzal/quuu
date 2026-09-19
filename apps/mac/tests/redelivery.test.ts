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
  agentId = makeAgent(db, {
    name: 'Codex',
    command: '/bin/echo',
    logAdapter: 'claude',
    resumeArgsTemplate: ['--resume', '{{sessionId}}', '{{prompt}}']
  })
  const projectId = makeProject(db, { name: 'p', path: workdir, targetId: agentId })
  taskId = makeTask(db, projectId, 'Fuzzの再編')
  logPath = join(workdir, 'session.jsonl')
})

afterEach(async () => {
  index.stop()
  await index.settled()
  db.close()
  releaseSessionDirs()
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

/** A resume that reached the agent and then died against a limit, with the follow-up still waiting. */
function limitedResume(pending: string, startedAt: string, id = 'run_limited'): void {
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
    promptPreview: pending.slice(0, 500),
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

function claimed(): string | undefined {
  const scheduler = new Scheduler(db, new Runner(db))
  return scheduler.claimNext()?.params.messageOverride
}

describe('a retry of a resume that died before answering', () => {
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
