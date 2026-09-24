import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import type { CommitIdentity } from '../src/main/settings/identity.js'
import { COMMIT_ENV_KEYS, botEmail, botLogin, commitIdentityEnv, commitIdentityLabel, GITHUB_APP_SETUP_VERSION, hasGitHubAppAuthentication, isCommitIdentityComplete, isGitHubAppCurrent, normalizeAppSlug, resolveCommitIdentity } from '../src/main/settings/commitIdentity.js'
import * as repo from '../src/main/db/repo.js'
import { Runner } from '../src/main/execution/runner.js'
import { Scheduler } from '../src/main/execution/scheduler.js'
import { makeAgent, makeProject, makeTask, memoryDb } from './helpers.js'

/**
 * The identity on a commit (the GitHub App bot).
 *
 * Getting this wrong still lets the run succeed, and it is noticed only
 * **when the GitHub history is read later**. And that history cannot be fixed.
 * Both the rules for building it and the point where it reaches the child process are pinned down.
 */

const IDENTITY: CommitIdentity = { appSlug: 'quuu-bot', botUserId: '1234567' }
describe('building the identity', () => {
  it('folds the different ways of writing the slug into one form', () => {
    expect(normalizeAppSlug('  quuu-bot ')).toBe('quuu-bot')
    expect(normalizeAppSlug('quuu-bot[bot]')).toBe('quuu-bot')
    expect(normalizeAppSlug('https://github.com/apps/quuu-bot')).toBe('quuu-bot')
    expect(normalizeAppSlug('https://github.com/apps/quuu-bot/')).toBe('quuu-bot')
  })

  it('builds the email in the form GitHub uses to link it', () => {
    expect(botLogin(IDENTITY.appSlug)).toBe('quuu-bot[bot]')
    expect(botEmail(IDENTITY)).toBe('1234567+quuu-bot[bot]@users.noreply.github.com')
    // The same address comes out despite pasting variations (one character off and it does not link)
    expect(botEmail({ appSlug: 'quuu-bot[bot]', botUserId: '1234567' })).toBe(botEmail(IDENTITY))
  })

  it('does not use a non-numeric id as an identity', () => {
    expect(isCommitIdentityComplete(IDENTITY)).toBe(true)
    expect(isCommitIdentityComplete({ appSlug: 'quuu-bot', botUserId: '' })).toBe(false)
    expect(isCommitIdentityComplete({ appSlug: 'quuu-bot', botUserId: 'abc' })).toBe(false)
    expect(isCommitIdentityComplete({ appSlug: '', botUserId: '1234567' })).toBe(false)
    expect(commitIdentityLabel({ appSlug: 'quuu-bot', botUserId: 'abc' })).toBe('')
  })

  it('can give gh the same identity only on the current version of the App', () => {
    expect(isGitHubAppCurrent(IDENTITY)).toBe(false)
    expect(
      isGitHubAppCurrent({
        ...IDENTITY,
        appId: '123',
        setupVersion: GITHUB_APP_SETUP_VERSION
      })
    ).toBe(true)
    // Waiting on the bot id is not "the App needs updating". Re-reading the id is enough.
    expect(
      isGitHubAppCurrent({
        appSlug: 'quuu-bot',
        botUserId: '',
        appId: '123',
        setupVersion: GITHUB_APP_SETUP_VERSION
      })
    ).toBe(true)
    expect(
      isGitHubAppCurrent({ ...IDENTITY, appId: '123', setupVersion: GITHUB_APP_SETUP_VERSION - 1 })
    ).toBe(false)
    expect(
      hasGitHubAppAuthentication({
        ...IDENTITY,
        appId: '123',
        setupVersion: GITHUB_APP_SETUP_VERSION - 1
      })
    ).toBe(true)
  })
})

const EMPTY: CommitIdentity = { appSlug: '', botUserId: '' }

describe('resolving the identity', () => {
  const enabled = { commitIdentityEnabled: true, commitIdentity: IDENTITY }
  const disabled = { commitIdentityEnabled: false, commitIdentity: IDENTITY }
  const inherit = { commitIdentityMode: 'inherit' as const, commitIdentity: EMPTY }

  it('gives no identity to a project that inherits it while the app setting is off', () => {
    expect(resolveCommitIdentity(enabled, inherit)).toEqual(IDENTITY)
    expect(resolveCommitIdentity(disabled, inherit)).toBeNull()
  })

  it('makes "do not pass it" on the project stronger than the app setting', () => {
    const off = { commitIdentityMode: 'off' as const, commitIdentity: IDENTITY }
    expect(resolveCommitIdentity(enabled, off)).toBeNull()
  })

  it('does not require the app-level switch for a project-only App', () => {
    const own: CommitIdentity = { appSlug: 'other-bot', botUserId: '99' }
    const custom = { commitIdentityMode: 'custom' as const, commitIdentity: own }
    expect(resolveCommitIdentity(disabled, custom)).toEqual(own)
    // Never build a false identity out of a setting that is not filled in
    const half = { commitIdentityMode: 'custom' as const, commitIdentity: { appSlug: 'x', botUserId: '' } }
    expect(resolveCommitIdentity(enabled, half)).toBeNull()
  })

  it('makes "do not pass it" clear inherited environment variables too', () => {
    const off = { commitIdentityMode: 'off' as const, commitIdentity: EMPTY }
    expect(commitIdentityEnv(enabled, off)).toEqual({
      GIT_AUTHOR_NAME: undefined,
      GIT_AUTHOR_EMAIL: undefined,
      GIT_COMMITTER_NAME: undefined,
      GIT_COMMITTER_EMAIL: undefined
    })
    // Leave it alone when it is merely unset (the parent environment is not judged here)
    expect(commitIdentityEnv(disabled, inherit)).toEqual({})
  })

  it('gives the same identity to both author and committer', () => {
    expect(commitIdentityEnv(enabled, inherit)).toEqual({
      GIT_AUTHOR_NAME: 'quuu-bot[bot]',
      GIT_AUTHOR_EMAIL: '1234567+quuu-bot[bot]@users.noreply.github.com',
      GIT_COMMITTER_NAME: 'quuu-bot[bot]',
      GIT_COMMITTER_EMAIL: '1234567+quuu-bot[bot]@users.noreply.github.com'
    })
  })
})

describe('the identity that reaches the run', () => {
  let workdir: string
  let inherited: Array<[string, string | undefined]> = []

  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), 'taskd-identity-'))
    process.env.QUUU_USER_DATA = workdir
    /*
     * Quuu is run from the agent that works on Quuu itself. With this feature enabled,
     * running `npm test` finds the identity already in the parent environment, and
     * "nothing was added" cannot be verified. Tests always start with it removed.
     */
    inherited = COMMIT_ENV_KEYS.map((k) => [k, process.env[k]])
    for (const k of COMMIT_ENV_KEYS) delete process.env[k]
  })

  afterEach(() => {
    for (const [k, v] of inherited) if (v !== undefined) process.env[k] = v
    rmSync(workdir, { recursive: true, force: true })
    delete process.env.QUUU_USER_DATA
  })

  /** Read the environment variables handed to the agent out of the run log. */
  async function runAndReadEnv(db: ReturnType<typeof memoryDb>, projectId: string): Promise<string> {
    const runner = new Runner(db)
    const scheduler = new Scheduler(db, runner)
    const task = makeTask(db, projectId, 'commit')
    await new Promise<void>((resolve) => {
      runner.once('finished', () => setTimeout(resolve, 30))
      void scheduler.tick()
    })
    scheduler.stop()
    return readFileSync(repo.listRunsByTask(db, task)[0].stdoutLogPath, 'utf8')
  }

  it('puts the identity into the agent environment when it is enabled', async () => {
    const db = memoryDb()
    repo.saveAppSettings(db, {
      ...DEFAULT_SETTINGS,
      commitIdentityEnabled: true,
      commitIdentity: IDENTITY
    })
    const agent = makeAgent(db, { name: 'env', command: '/usr/bin/env', argsTemplate: [] })
    const project = makeProject(db, { name: 'p', targetId: agent, path: workdir })

    const log = await runAndReadEnv(db, project)
    expect(log).toContain('GIT_AUTHOR_NAME=quuu-bot[bot]')
    expect(log).toContain('GIT_AUTHOR_EMAIL=1234567+quuu-bot[bot]@users.noreply.github.com')
    expect(log).toContain('GIT_COMMITTER_EMAIL=1234567+quuu-bot[bot]@users.noreply.github.com')
  })

  it('applies the project identity after the environment variables of the agent definition', async () => {
    const db = memoryDb()
    const agent = makeAgent(db, {
      name: 'env',
      command: '/usr/bin/env',
      argsTemplate: [],
      env: { GIT_AUTHOR_NAME: '書き置き', GIT_AUTHOR_EMAIL: 'stale@example.com' }
    })
    const project = makeProject(db, {
      name: 'p',
      targetId: agent,
      path: workdir,
      commitIdentityMode: 'custom',
      commitIdentity: { appSlug: 'other-bot', botUserId: '99' }
    })

    const log = await runAndReadEnv(db, project)
    expect(log).toContain('GIT_AUTHOR_NAME=other-bot[bot]')
    expect(log).not.toContain('書き置き')
    expect(log).not.toContain('stale@example.com')
  })

  it('adds no identity environment variables when nothing is configured', async () => {
    const db = memoryDb()
    const agent = makeAgent(db, { name: 'env', command: '/usr/bin/env', argsTemplate: [] })
    const project = makeProject(db, { name: 'p', targetId: agent, path: workdir })

    const log = await runAndReadEnv(db, project)
    expect(log).not.toContain('GIT_AUTHOR_NAME=')
    expect(log).not.toContain('GIT_COMMITTER_NAME=')
  })
})
