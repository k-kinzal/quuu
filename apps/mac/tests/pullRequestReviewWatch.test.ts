import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import type { ReviewSnapshot } from '../src/main/review/types.js'
import { isolateSessionDirs, makeAgent, makeProject, releaseSessionDirs, reviewed } from './helpers.js'

let dir: string
let app: QuuuApp

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-pr-review-watch-'))
  vi.stubEnv('QUUU_USER_DATA', dir)
  isolateSessionDirs(dir)
  app = new QuuuApp(':memory:')
  app.scheduler.pause()
  app.settings.setSettings({ pullRequestConflictEnabled: true, pullRequestConflictPrompt: 'Resolve {{url}} against {{base}}.' })
})

afterEach(() => {
  app.shutdown()
  app.db.close()
  releaseSessionDirs()
  vi.unstubAllEnvs()
  rmSync(dir, { recursive: true, force: true })
})

it('queues a watched conflict with existing instructions and preserves its agent and session', () => {
  const agentId = makeAgent(app.db, { name: 'Original agent', logAdapter: 'stdout', resumeArgsTemplate: ['{{sessionId}}', '{{prompt}}'] })
  const projectId = makeProject(app.db, { name: 'Review project', targetId: agentId, path: dir })
  const taskId = reviewed(app.db, projectId, 'Waiting for review', agentId)
  const before = repo.getTask(app.db, taskId)!
  repo.patchTask(app.db, taskId, { agentOverrideId: agentId })
  repo.setPendingMessage(app.db, taskId, 'Keep my pending instruction.')
  repo.setReservedMessage(app.db, taskId, 'Keep my reserved instruction.')
  const snapshot: ReviewSnapshot = {
    cwd: dir, branch: 'feature', repository: 'owner/repo', tree: [], changes: [], stagedChanges: [], stagedRevision: null,
    localChanges: [], revision: null, localRevision: null, commits: [], coverage: null, projectTasks: [],
    pullRequests: [{ number: 1, title: 'PR', url: 'https://github.com/owner/repo/pull/1', headRefName: 'feature', baseRefName: 'main',
      headSha: 'a'.repeat(40), draft: false, updatedAt: '', check: 'success', mergeState: 'conflicting', state: 'open', files: [] }]
  }
  app.reviews.emit('projected', taskId, snapshot)
  app.reviews.emit('projected', taskId, snapshot)
  expect(repo.getTask(app.db, taskId)).toMatchObject({
    status: 'queued', currentRunId: before.currentRunId, sessionId: before.sessionId, agentOverrideId: agentId,
    reservedMessage: '',
    pendingMessage: 'Keep my pending instruction.\n\nKeep my reserved instruction.\n\nResolve https://github.com/owner/repo/pull/1 against main.'
  })
  // Pausing execution still prevents the automatic follow-up from launching an agent.
  expect(repo.listRunsByTask(app.db, taskId)).toHaveLength(1)
})
