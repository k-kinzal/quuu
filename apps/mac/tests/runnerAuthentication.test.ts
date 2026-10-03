import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { authenticationOnRunner, installRunnerLogin, recordRunnerAuthentication, usesRunnerAuthentication } from '../src/main/runners/agentAuth.js'

let root: string, claude: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'quuu-runner-auth-'))
  claude = join(root, 'claude', '.credentials.json')
  mkdirSync(join(root, 'claude'))
  vi.stubEnv('CLAUDE_CONFIG_DIR', join(root, 'claude'))
  vi.stubEnv('CODEX_HOME', join(root, 'codex'))
  vi.stubEnv('XDG_CONFIG_HOME', join(root, 'config'))
  for (const name of ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CODEX_API_KEY', 'OPENAI_API_KEY', 'CURSOR_API_KEY']) vi.stubEnv(name, '')
})
afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }) })
const status = () => authenticationOnRunner('claude', root)
const token = 'sk-ant-oat01-fixture-runner-credential'

it('distinguishes a missing login from empty, cleared and malformed credentials', () => {
  expect(status()?.auth).toBe('missing')
  for (const content of ['', '{}', '{broken', JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0 } })]) {
    writeFileSync(claude, content)
    expect(status()?.auth).toBe('expired')
  }
  expect(authenticationOnRunner('bash', root)).toBeUndefined()
})

it('does not call an imported token signed in until the provider has accepted it', () => {
  writeFileSync(claude, JSON.stringify({ claudeAiOauth: { accessToken: 'existing-token', expiresAt: Date.now() + 3600_000 } }))
  expect(status()?.auth).toBe('unverified')
  recordRunnerAuthentication(root, 'claude', status()?.fingerprint, 'signedIn')
  expect(status()?.auth).toBe('signedIn')
  expect(readFileSync(join(root, 'credentials', 'claude-authentication.json'), 'utf8')).not.toContain('existing-token')
})

it('stops reporting a confirmed login after expiration and allows the CLI to refresh a renewable one', () => {
  vi.useFakeTimers()
  try {
    for (const refreshToken of ['', 'refresh-fixture']) {
      writeFileSync(claude, JSON.stringify({ claudeAiOauth: { accessToken: 'access-fixture', refreshToken, expiresAt: Date.now() + 1000 } }))
      recordRunnerAuthentication(root, 'claude', status()?.fingerprint, 'signedIn')
      expect(status()?.auth).toBe('signedIn')
      vi.advanceTimersByTime(1001)
      expect(status()?.auth).toBe(refreshToken ? 'unverified' : 'expired')
    }
  } finally { vi.useRealTimers() }
})

it('retains an authentication rejection until reauthentication and ignores late outcomes for the old credential', () => {
  installRunnerLogin(root, 'claude', token)
  const original = status()?.fingerprint
  recordRunnerAuthentication(root, 'claude', original, 'expired')
  expect(status()?.auth).toBe('expired')
  recordRunnerAuthentication(root, 'claude', original, 'signedIn')
  expect(status()?.auth).toBe('expired')
  installRunnerLogin(root, 'claude', `${token}-replacement`)
  recordRunnerAuthentication(root, 'claude', original, 'expired')
  expect(status()?.auth).toBe('signedIn')
  expect(statSync(join(root, 'credentials', 'claude-authentication.json')).mode & 0o777).toBe(0o600)
})

it('never confirms an environment override with a sign-in made for a different credential', () => {
  vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', 'environment-token')
  installRunnerLogin(root, 'claude', token)
  expect(status()?.auth).toBe('unverified')
  expect(usesRunnerAuthentication('claude', { CLAUDE_CODE_OAUTH_TOKEN: 'per-job-token' })).toBe(false)
  expect(usesRunnerAuthentication('claude', { CLAUDE_CONFIG_DIR: '/another/account' })).toBe(false)
  expect(usesRunnerAuthentication('claude', { HOME: '/another/home' })).toBe(false)
  expect(usesRunnerAuthentication('claude', { CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1' })).toBe(true)
})

it('rejects empty Codex and Cursor sign-ins without replacing a working login', () => {
  for (const [agent, value] of [
    ['codex', { tokens: { access_token: 'codex-fixture', refresh_token: 'renew-codex' } }],
    ['cursor-agent', { accessToken: 'cursor-fixture', refreshToken: 'renew-cursor' }]
  ] as const) {
    installRunnerLogin(root, agent, JSON.stringify(value))
    expect(authenticationOnRunner(agent, root)?.auth).toBe('signedIn')
    expect(() => installRunnerLogin(root, agent, '{}')).toThrow('Invalid')
    expect(authenticationOnRunner(agent, root)?.auth).toBe('signedIn')
  }
})

it('reads the expiration in a JWT without mistaking an expired token for a login', () => {
  const expired = `header.${Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url')}.signature`
  vi.stubEnv('CURSOR_API_KEY', expired)
  expect(authenticationOnRunner('cursor-agent', root)?.auth).toBe('expired')
})
