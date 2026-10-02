import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
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
export function isRunnerLoginAgent(name: string): name is RunnerLoginAgent { return (RUNNER_LOGIN_AGENTS as readonly string[]).includes(name) }

const env = (name: string): boolean => !!process.env[name]?.trim()
const codexAuth = (): string => join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json')
const cursorAuth = (): string => join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'cursor', 'auth.json')
/** `claude setup-token` yields a token Claude Code reads only from its environment, so the worker keeps it. */
const claudeToken = (root: string): string => join(root, 'credentials', 'claude-oauth-token')

/** Whether the Runner holds a credential for the agent. `undefined` for agents Quuu does not know. */
export function signedInOnRunner(name: string, root: string): boolean | undefined {
  switch (name) {
    case 'codex': return env('CODEX_API_KEY') || env('OPENAI_API_KEY') || existsSync(codexAuth())
    case 'claude': return env('ANTHROPIC_API_KEY') || env('ANTHROPIC_AUTH_TOKEN') || env('CLAUDE_CODE_OAUTH_TOKEN') || existsSync(claudeToken(root)) ||
      existsSync(join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), '.credentials.json'))
    case 'cursor-agent': return env('CURSOR_API_KEY') || existsSync(cursorAuth())
    default: return undefined
  }
}

/** Write a sign-in where that agent reads it on Linux. The controller never chooses a path. */
export function installRunnerLogin(root: string, agent: RunnerLoginAgent, credential: string): void {
  if (agent === 'claude') {
    if (!/^sk-ant-[\w-]{16,4096}$/.test(credential)) throw new Error('Invalid Claude Code token')
    writePrivate(claudeToken(root), credential)
    return
  }
  const value: unknown = JSON.parse(credential)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${agent} sign-in`)
  writePrivate(agent === 'codex' ? codexAuth() : cursorAuth(), JSON.stringify(value))
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
