import { execFileSync } from 'node:child_process'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanupGitHubAuth, githubAppJwt, githubRepositoryFromRemote, prepareGitHubAuthEnvironment, saveGitHubAppPrivateKey } from '../src/main/platform/githubAuth.js'
import { refreshDelay, writeGitHubHosts } from '../src/main/platform/githubAuthRuntime.mjs'
import { GITHUB_APP_SETUP_VERSION } from '../src/main/settings/commitIdentity.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'taskd-github-auth-'))
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('GitHub App runtime authentication', () => {
  it('saves a valid private key to the Keychain without putting the secret on argv', async () => {
    const keychain = join(dir, 'GitHub App test.keychain-db')
    execFileSync('/usr/bin/security', ['create-keychain', '-p', 'temporary', keychain])
    try {
      const pem = generateKeyPairSync('rsa', { modulusLength: 2048 })
        .privateKey.export({ type: 'pkcs8', format: 'pem' })
        .toString()

      await saveGitHubAppPrivateKey('123', pem, keychain)

      const saved = execFileSync(
        '/usr/bin/security',
        ['find-generic-password', '-a', '123', '-s', 'net.kinzal.quuu.github-app', '-w', keychain],
        { encoding: 'utf8' }
      ).trim()
      expect(Buffer.from(saved, 'base64').toString()).toBe(pem)
      expect(() => githubAppJwt('123', Buffer.from(saved, 'base64').toString())).not.toThrow()
    } finally {
      execFileSync('/usr/bin/security', ['delete-keychain', keychain])
    }
  })

  it('normalizes only GitHub origins to owner/repository', () => {
    expect(githubRepositoryFromRemote('https://github.com/acme/query-kit.git')).toBe(
      'acme/query-kit'
    )
    expect(githubRepositoryFromRemote('git@github.com:acme/query-kit.git')).toBe(
      'acme/query-kit'
    )
    expect(githubRepositoryFromRemote('ssh://git@github.com/acme/query-kit')).toBe(
      'acme/query-kit'
    )
    expect(githubRepositoryFromRemote('https://example.com/acme/query-kit.git')).toBeNull()
    expect(githubRepositoryFromRemote('/tmp/local.git')).toBeNull()
  })

  it('builds a JWT GitHub can verify, with the App ID as issuer', () => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const now = 1_800_000_000_000
    const jwt = githubAppJwt('123', pem, now)
    const [header, payload, signature] = jwt.split('.')

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT'
    })
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      iat: now / 1000 - 60,
      exp: now / 1000 + 540,
      iss: '123'
    })
    const verifier = createVerify('RSA-SHA256')
    verifier.update(`${header}.${payload}`)
    verifier.end()
    expect(verifier.verify(pair.publicKey, Buffer.from(signature, 'base64url'))).toBe(true)
  })

  it("overrides the human logins of gh and git with one private config without changing PATH", () => {
    execFileSync('/usr/bin/git', ['init', dir], { stdio: 'ignore' })
    execFileSync('/usr/bin/git', [
      '-C',
      dir,
      'remote',
      'add',
      'origin',
      'git@github.com:acme/query-kit.git'
    ])
    const bin = join(dir, 'bin')
    execFileSync('/bin/mkdir', ['-p', bin])
    const gh = join(bin, 'gh')
    writeFileSync(gh, '#!/bin/sh\nexit 0\n', { mode: 0o700 })

    const prepared = prepareGitHubAuthEnvironment(
      {
        appSlug: 'quuu-test',
        botUserId: '999',
        appId: '123',
        setupVersion: GITHUB_APP_SETUP_VERSION
      },
      dir,
      bin,
      { GH_TOKEN: 'the human token', GIT_CONFIG_COUNT: '0' }
    )

    try {
      expect(prepared.dir).not.toBeNull()
      expect(prepared.env.GH_TOKEN).toBeUndefined()
      expect(prepared.env.GITHUB_TOKEN).toBeUndefined()
      expect(prepared.env.GH_REPO).toBe('acme/query-kit')
      expect(prepared.env.PATH).toBeUndefined()
      expect(prepared.env.GIT_CONFIG_VALUE_1).toBe(`!'${realpathSync(gh)}' auth git-credential`)
      expect(existsSync(join(prepared.dir!, 'gh'))).toBe(false)
      expect(statSync(prepared.dir!).mode & 0o777).toBe(0o700)
      expect(statSync(prepared.env.GH_CONFIG_DIR!).mode & 0o777).toBe(0o700)
      expect(statSync(join(prepared.env.GH_CONFIG_DIR!, 'hosts.yml')).mode & 0o777).toBe(0o600)
      expect(prepared.env.GIT_CONFIG_COUNT).toBe('4')
      expect(prepared.env.GIT_CONFIG_VALUE_0).toBe('')
      expect(prepared.env.GIT_CONFIG_VALUE_2).toBe('git@github.com:')
      expect(prepared.env.GIT_CONFIG_VALUE_3).toBe('ssh://git@github.com/')

      const helper = readFileSync(join(prepared.dir!, 'runtime.mjs'), 'utf8')
      execFileSync(process.execPath, ['--check', join(prepared.dir!, 'runtime.mjs')])
      expect(helper).not.toContain('the human token')
      expect(helper).not.toContain('BEGIN PRIVATE KEY')

      const env = { ...process.env, ...prepared.env }
      expect(
        execFileSync('/usr/bin/git', ['-C', dir, 'ls-remote', '--get-url', 'origin'], {
          encoding: 'utf8',
          env
        }).trim()
      ).toBe('https://github.com/acme/query-kit.git')
      expect(
        execFileSync(
          '/usr/bin/git',
          ['-C', dir, 'config', '--get-all', 'credential.https://github.com.helper'],
          { encoding: 'utf8', env }
        ).trim()
      ).toContain('auth git-credential')
    } finally {
      cleanupGitHubAuth(prepared.dir)
    }
  })

  it('refreshes 15 minutes before GitHub expiration using wall time', () => {
    const now = 1_800_000_000_000
    expect(refreshDelay(now + 60 * 60 * 1000, now)).toBe(45 * 60 * 1000)
    expect(refreshDelay(now + 10 * 60 * 1000, now)).toBe(1000)
  })

  it('makes native gh and Git read an atomic replacement even through a login shell', () => {
    // Deliberately invalid tokens; boolean assertions cannot print a personal
    // credential even if a regression accidentally reads one from the Keychain.
    const gh = execFileSync('/bin/zsh', ['-lc', 'command -v gh'], { encoding: 'utf8' }).trim()
    const env = { ...process.env, GH_TOKEN: undefined, GITHUB_TOKEN: undefined, GH_CONFIG_DIR: dir }
    writeGitHubHosts(dir, 'quuu-test[bot]', 'quuu-invalid-first')
    const args = ['auth', 'token', '--hostname', 'github.com']
    expect(execFileSync(gh, args, { env, encoding: 'utf8' }).trim() === 'quuu-invalid-first').toBe(true)
    writeGitHubHosts(dir, 'quuu-test[bot]', 'quuu-invalid-second')
    expect(execFileSync('/bin/zsh', ['-lc', 'gh auth token --hostname github.com'], { env, encoding: 'utf8' }).trim() === 'quuu-invalid-second').toBe(true)
    expect(execFileSync(gh, ['auth', 'git-credential', 'get'], {
      env, encoding: 'utf8', input: 'protocol=https\nhost=github.com\n\n'
    }).includes('password=quuu-invalid-second')).toBe(true)
    expect(statSync(join(dir, 'hosts.yml')).mode & 0o777).toBe(0o600)
  })

  it('never mixes auth into an old-version App or a non-GitHub remote', () => {
    execFileSync('/usr/bin/git', ['init', dir], { stdio: 'ignore' })
    execFileSync('/usr/bin/git', [
      '-C',
      dir,
      'remote',
      'add',
      'origin',
      'https://example.com/a/b.git'
    ])
    const old = prepareGitHubAuthEnvironment(
      { appSlug: 'old', botUserId: '1' },
      dir,
      process.env.PATH ?? '',
      {}
    )
    const otherHost = prepareGitHubAuthEnvironment(
      {
        appSlug: 'new',
        botUserId: '2',
        appId: '3',
        setupVersion: GITHUB_APP_SETUP_VERSION
      },
      dir,
      process.env.PATH ?? '',
      {}
    )

    expect(old).toEqual({ env: {}, dir: null })
    expect(otherHost).toEqual({ env: {}, dir: null })
  })

  it('an old-version App with credentials gets set up to raise an update error rather than fall back to human auth', () => {
    execFileSync('/usr/bin/git', ['init', dir], { stdio: 'ignore' })
    execFileSync('/usr/bin/git', [
      '-C',
      dir,
      'remote',
      'add',
      'origin',
      'https://github.com/acme/query-kit.git'
    ])

    const prepared = prepareGitHubAuthEnvironment(
      {
        appSlug: 'old-authenticated',
        botUserId: '1',
        appId: '123',
        setupVersion: GITHUB_APP_SETUP_VERSION - 1
      },
      dir,
      process.env.PATH ?? '',
      { GH_TOKEN: 'the human token' }
    )

    try {
      expect(prepared.dir).not.toBeNull()
      expect(prepared.env.GH_TOKEN).toBeUndefined()
      expect(readFileSync(join(prepared.dir!, 'runtime.json'), 'utf8')).toContain('123')
      expect(prepared.launch).toBeDefined()
    } finally {
      cleanupGitHubAuth(prepared.dir)
    }
  })
})
