import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { QuuuApp } from '../src/main/bootstrap.js'
import * as repo from '../src/main/db/repo.js'
import { makeAgent } from './helpers.js'

/**
 * Duplicating an agent.
 *
 * The usual reason is one CLI, several models: the launch settings are long and the
 * variants differ by one flag. A copy has to carry everything the original launches
 * with, and must not collide with it the moment it exists.
 */

let workdir: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'taskd-duplicate-'))
  process.env.QUUU_USER_DATA = workdir
})

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true })
  delete process.env.QUUU_USER_DATA
})

function makeApp(): QuuuApp {
  const app = new QuuuApp(':memory:')
  app.scheduler.pause()
  return app
}

describe('duplicating an agent', () => {
  it('carries every launch setting of the original into the copy', () => {
    const app = makeApp()
    const fallback = makeAgent(app.db, { name: 'Sonnet' })
    const original = makeAgent(app.db, {
      name: 'Opus',
      command: 'claude',
      argsTemplate: ['-p', '--model', 'opus', '--', '{{prompt}}'],
      resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '--', '{{prompt}}'],
      env: { CLAUDE_CODE_MAX_OUTPUT_TOKENS: '64000' },
      concurrency: 3,
      fallbackAgentId: fallback,
      limitPatterns: ['usage limit'],
      cooldownSeconds: 600,
      timeoutSeconds: 3600,
      logAdapter: 'claude'
    })

    const copy = app.agents.duplicateAgent(original)
    const source = repo.getAgent(app.db, original)!

    expect(copy.id).not.toBe(original)
    const {
      id: _id, name: _n, enabled: _e, sortOrder: _o, createdAt: _c, updatedAt: _u, ...copied
    } = copy
    const {
      id: _sid, name: _sn, enabled: _se, sortOrder: _so, createdAt: _sc, updatedAt: _su, ...kept
    } = source
    expect(copied).toEqual(kept)
  })

  it('names the copy after the original and starts it disabled, so two slots never run as one', () => {
    const app = makeApp()
    const original = makeAgent(app.db, { name: 'Opus', enabled: true })

    const copy = app.agents.duplicateAgent(original)

    expect(copy.name).toBe('Opus copy')
    expect(copy.enabled).toBe(false)
    // The original is untouched by being copied
    expect(repo.getAgent(app.db, original)?.enabled).toBe(true)
  })

  it('appends the copy to the end of the list, where a new row is expected', () => {
    const app = makeApp()
    const first = makeAgent(app.db, { name: 'Opus', sortOrder: 0 })
    makeAgent(app.db, { name: 'Sonnet', sortOrder: 1 })
    makeAgent(app.db, { name: 'Codex', sortOrder: 2 })

    const copy = app.agents.duplicateAgent(first)

    expect(repo.listAgents(app.db).map((a) => a.name)).toEqual(['Opus', 'Sonnet', 'Codex', 'Opus copy'])
    expect(copy.sortOrder).toBe(3)
  })

  it('a copy always belongs to the user, and a definition kept behind the scenes cannot be copied', () => {
    const app = makeApp()
    const managed = makeAgent(app.db, { name: 'Codex（外部）', source: 'imported', enabled: false })

    expect(() => app.agents.duplicateAgent(managed)).toThrow()
    expect(repo.listAgents(app.db)).toHaveLength(1)

    const mine = makeAgent(app.db, { name: 'Opus' })
    expect(app.agents.duplicateAgent(mine).source).toBe('user')
  })

  it('refuses an id that names nothing rather than inventing an agent', () => {
    const app = makeApp()
    expect(() => app.agents.duplicateAgent('agt_missing')).toThrow()
    expect(repo.listAgents(app.db)).toHaveLength(0)
  })
})
