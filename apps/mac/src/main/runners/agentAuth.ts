import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * How each agent CLI authenticates on a Runner without copying this computer's own login.
 *
 * Copying a login hands two machines the same rotating refresh token; whichever refreshes first
 * signs the other out. So a Runner either borrows a non-rotating token that Quuu keeps in its key
 * store (lent per job, never written to the Runner's disk), or owns a login of its own that was
 * minted for that Runner alone.
 */
export const SHARED_TOKEN_AGENTS = {
  /** `claude setup-token`: a one-year token that can only make model requests. */
  claude: 'CLAUDE_CODE_OAUTH_TOKEN',
  /** An API key from the Cursor dashboard. */
  'cursor-agent': 'CURSOR_API_KEY'
} as const
export type SharedTokenAgent = keyof typeof SHARED_TOKEN_AGENTS
export const sharedTokenAgents = Object.keys(SHARED_TOKEN_AGENTS) as SharedTokenAgent[]
export function isSharedTokenAgent(name: string): name is SharedTokenAgent { return Object.hasOwn(SHARED_TOKEN_AGENTS, name) }

/** Agents whose subscription login rotates its refresh token; each Runner gets its own session. */
export const RUNNER_LOGIN_AGENTS = ['codex'] as const
export type RunnerLoginAgent = typeof RUNNER_LOGIN_AGENTS[number]

const env = (name: string): boolean => !!process.env[name]?.trim()
const codexHome = (): string => process.env.CODEX_HOME || join(homedir(), '.codex')

/** Whether the Runner's own environment holds a credential for the agent. `undefined` for agents Quuu does not know. */
export function signedInOnRunner(name: string): boolean | undefined {
  switch (name) {
    case 'codex': return env('CODEX_API_KEY') || env('OPENAI_API_KEY') || existsSync(join(codexHome(), 'auth.json'))
    case 'claude': return env('ANTHROPIC_API_KEY') || env('ANTHROPIC_AUTH_TOKEN') || env('CLAUDE_CODE_OAUTH_TOKEN') ||
      existsSync(join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), '.credentials.json'))
    case 'cursor-agent': return env('CURSOR_API_KEY') || existsSync(join(homedir(), '.config', 'cursor', 'auth.json'))
    default: return undefined
  }
}

/** The fixed place each Runner-owned login is written. The controller never chooses a path. */
export function installRunnerLogin(agent: RunnerLoginAgent, content: string): void {
  if (agent !== 'codex') throw new Error('Unsupported Runner login')
  const value: unknown = JSON.parse(content)
  if (!value || typeof value !== 'object') throw new Error('Invalid Codex login')
  mkdirSync(codexHome(), { recursive: true, mode: 0o700 })
  const file = join(codexHome(), 'auth.json')
  writeFileSync(`${file}.tmp`, JSON.stringify(value), { mode: 0o600 })
  renameSync(`${file}.tmp`, file)
}
