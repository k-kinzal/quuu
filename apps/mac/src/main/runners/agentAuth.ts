import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * How each agent CLI is signed in on a Runner, in one place for the controller and the worker.
 *
 * A Runner never receives a copy of this computer's own login: Claude Code, Codex and Cursor
 * rotate refresh tokens, so two holders of one login sign each other out. Every agent instead
 * goes through the same path — Quuu runs the agent's own browser sign-in on this computer into a
 * throwaway home, hands the result to exactly one Runner, and forgets it. Only what that sign-in
 * produces differs, and only this file knows it.
 */
export const RUNNER_LOGIN_AGENTS = ['codex', 'claude', 'cursor-agent'] as const
export type RunnerLoginAgent = typeof RUNNER_LOGIN_AGENTS[number]
export type RunnerAuthentication = 'signedIn' | 'missing' | 'expired' | 'unverified'
export function isRunnerLoginAgent(name: string): name is RunnerLoginAgent { return (RUNNER_LOGIN_AGENTS as readonly string[]).includes(name) }

const env = (name: string): boolean => !!process.env[name]?.trim()
const codexAuth = (): string => join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json')
const cursorAuth = (): string => join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'cursor', 'auth.json')
/** `claude setup-token` yields a token Claude Code reads only from its environment, so the worker keeps it. */
const claudeToken = (root: string): string => join(root, 'credentials', 'claude-oauth-token')

const AUTH_ENV: Record<RunnerLoginAgent, string[]> = {
  codex: ['CODEX_API_KEY', 'OPENAI_API_KEY', 'CODEX_HOME'],
  claude: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR'],
  'cursor-agent': ['CURSOR_API_KEY', 'XDG_CONFIG_HOME']
}
interface Credential { auth: RunnerAuthentication; fingerprint?: string; needsRefresh?: boolean }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

function credential(source: string, access: unknown, refresh?: unknown, expiresAt?: unknown): Credential {
  const token = text(access), renewal = text(refresh)
  if (!token && !renewal) return { auth: 'expired' }
  if (expiresAt === undefined) {
    try {
      const claims = object(JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()))
      if (typeof claims.exp === 'number') expiresAt = claims.exp * 1000
    } catch { /* Opaque credentials do not advertise their expiration. */ }
  }
  const expired = typeof expiresAt === 'number' && expiresAt <= Date.now()
  if (expired && !renewal) return { auth: 'expired' }
  return { auth: 'unverified', needsRefresh: expired || !token,
    fingerprint: createHash('sha256').update(JSON.stringify([source, token, renewal])).digest('hex') }
}

function jsonCredential(name: RunnerLoginAgent, source: string, value: unknown): Credential {
  const data = object(value)
  if (name === 'claude') {
    const oauth = object(data.claudeAiOauth)
    return credential(source, oauth.accessToken, oauth.refreshToken, oauth.expiresAt)
  }
  if (name === 'codex') {
    const tokens = object(data.tokens)
    return credential(source, data.OPENAI_API_KEY || tokens.access_token, tokens.refresh_token)
  }
  return credential(source, data.accessToken, data.refreshToken, data.expiresAt)
}

function currentCredential(name: RunnerLoginAgent, root: string): Credential {
  const variables = AUTH_ENV[name].filter(key => !key.endsWith('_HOME') && !key.endsWith('_DIR'))
  const variable = variables.find(env)
  if (variable) return credential(variable, process.env[variable])
  const file = name === 'codex' ? codexAuth() : name === 'cursor-agent' ? cursorAuth()
    : existsSync(claudeToken(root)) ? claudeToken(root) : join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), '.credentials.json')
  if (!existsSync(file)) return { auth: 'missing' }
  try {
    const content = readFileSync(file, 'utf8')
    return file === claudeToken(root) ? credential(file, content) : jsonCredential(name, file, JSON.parse(content))
  } catch { return { auth: 'expired' } }
}

const evidenceFile = (root: string, name: RunnerLoginAgent): string => join(root, 'credentials', `${name}-authentication.json`)

/** A file's presence is not a login. Only the provider's sign-in or a completed run confirms it. */
export function authenticationOnRunner(name: string, root: string): Credential | undefined {
  if (!isRunnerLoginAgent(name)) return undefined
  const current = currentCredential(name, root)
  if (current.auth !== 'unverified') return current
  try {
    const evidence = object(JSON.parse(readFileSync(evidenceFile(root, name), 'utf8')))
    if (evidence.fingerprint === current.fingerprint && (evidence.auth === 'expired' || (evidence.auth === 'signedIn' && !current.needsRefresh))) {
      return { ...current, auth: evidence.auth }
    }
  } catch { /* An existing login without provider evidence remains unverified. */ }
  return current
}

/** Per-job credentials must never change the status of the Runner's own account. */
export function usesRunnerAuthentication(name: string, overrides: Record<string, string | undefined>): boolean {
  return isRunnerLoginAgent(name) && !['HOME', ...AUTH_ENV[name]].some(key => overrides[key] !== undefined)
}

/** A late failure from an old run cannot invalidate a replacement login. No token is retained here. */
export function recordRunnerAuthentication(root: string, name: string, fingerprint: string | undefined, auth: 'signedIn' | 'expired'): void {
  if (!isRunnerLoginAgent(name) || !fingerprint || currentCredential(name, root).fingerprint !== fingerprint) return
  // An older successful job may finish uploading after a rejection. Reauthentication clears it.
  if (auth === 'signedIn' && authenticationOnRunner(name, root)?.auth === 'expired') return
  writePrivate(evidenceFile(root, name), JSON.stringify({ fingerprint, auth }))
}

/** Write a sign-in where that agent reads it on Linux. The controller never chooses a path. */
export function installRunnerLogin(root: string, agent: RunnerLoginAgent, login: string): void {
  let installed: Credential
  if (agent === 'claude') {
    if (!/^sk-ant-[\w-]{16,4096}$/.test(login)) throw new Error('Invalid Claude Code token')
    installed = credential(claudeToken(root), login)
    writePrivate(claudeToken(root), login)
  } else {
    const value: unknown = JSON.parse(login)
    const file = agent === 'codex' ? codexAuth() : cursorAuth()
    installed = jsonCredential(agent, file, value)
    if (installed.auth !== 'unverified' || installed.needsRefresh) throw new Error(`Invalid ${agent} sign-in`)
    writePrivate(file, JSON.stringify(value))
  }
  if (currentCredential(agent, root).fingerprint === installed.fingerprint) {
    writePrivate(evidenceFile(root, agent), JSON.stringify({ fingerprint: installed.fingerprint, auth: 'signedIn' }))
  }
}

/** Environment every job on this Runner gets from its own sign-ins. */
export function runnerAgentEnvironment(root: string): Record<string, string> {
  const file = claudeToken(root)
  return existsSync(file) && !env('CLAUDE_CODE_OAUTH_TOKEN') ? { CLAUDE_CODE_OAUTH_TOKEN: readFileSync(file, 'utf8').trim() } : {}
}

function writePrivate(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(`${file}.tmp`, content, { mode: 0o600 })
  renameSync(`${file}.tmp`, file)
}
