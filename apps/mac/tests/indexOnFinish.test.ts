import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import { sessionKey } from '../src/main/session/index.js'
import { sessionReadTarget } from '../src/main/session/sessionAttach.js'
import { isolateSessionDirs, makeAgent, makeProject, makeTask, occupy, releaseSessionDirs } from './helpers.js'

/**
 * The conversation of a run that just ended is read at once.
 *
 * Whether the instruction that run carried already sits in the conversation is read off the
 * durable index, both by the screen (an instruction marked "unsent" or not) and by the next run
 * (send it, or ask the agent to carry on). A run that was killed after hours of work left a long
 * log; while the periodic sweep was still catching up, its instruction stood as unsent and the
 * task looked like it needed fixing before it could run again.
 */

let workdir: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'taskd-index-on-finish-'))
  process.env.QUUU_USER_DATA = workdir
  isolateSessionDirs(workdir)
})

afterEach(() => {
  releaseSessionDirs()
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

describe('when a run ends', () => {
  it('reads its conversation into the index before the periodic sweep would', async () => {
    const app = new QuuuApp(':memory:')
    const agent = makeAgent(app.db, { name: 'claude', command: 'claude', logAdapter: 'claude' })
    const project = makeProject(app.db, { name: 'p', targetId: agent, path: workdir, enabled: false })
    const task = makeTask(app.db, project, 't')
    const runId = occupy(app.db, task, agent)
    const logPath = join(workdir, 'session.jsonl')
    writeFileSync(
      logPath,
      JSON.stringify({
        type: 'user',
        uuid: 'u0',
        timestamp: new Date().toISOString(),
        message: { content: [{ type: 'text', text: '続きをお願いします。' }] }
      }) + '\n'
    )
    repo.updateRun(app.db, runId, { status: 'failed', errorKind: 'nonzero-exit', endedAt: new Date().toISOString(), sessionLogPath: logPath })
    const run = repo.getRun(app.db, runId)!

    app.runner.emit('finished', {
      run,
      classification: { kind: 'nonzero-exit', message: 'Killed: 9' },
      tail: ''
    })
    await app.sessions.settled()

    const saved = repo.getSessionIndex(app.db, sessionKey(sessionReadTarget(app.db, run)))
    expect(saved?.total).toBe(1)
    app.shutdown()
  })
})
