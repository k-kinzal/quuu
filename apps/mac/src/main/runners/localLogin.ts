import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativeHelperPath } from '../platform/nativeHelpers.js'
import { withPath } from '../platform/processEnv.js'
import { resolveLoginPath } from '../platform/shellEnv.js'
import { shQuote } from '../platform/terminal.js'
import type { RunnerLoginAgent } from './agentAuth.js'

export interface LocalLogin {
  /** What the sign-in produced, for one Runner. The throwaway home is already deleted. */
  credential: Promise<string>
  cancel(): void
}
export type StartLocalLogin = (agent: RunnerLoginAgent, command: string) => LocalLogin

const LOGIN_TIMEOUT_MS = 10 * 60_000

/**
 * The agent's own browser sign-in, run on this computer where its callback is reachable. Each run
 * goes into a throwaway home, so it never touches this computer's login and its result has no
 * other holder.
 */
interface Recipe {
  args: string[]
  env(home: string): NodeJS.ProcessEnv
  /** Claude Code renders its token only on a terminal. */
  terminal?: boolean
  /** Read the credential from the throwaway home, or from the terminal output. */
  result(home: string, output: string): string | null
}
const RECIPES: Record<RunnerLoginAgent, Recipe> = {
  codex: {
    args: ['login', '-c', 'cli_auth_credentials_store="file"'],
    env: home => ({ CODEX_HOME: home }),
    result: home => readFileSync(join(home, 'auth.json'), 'utf8')
  },
  'cursor-agent': {
    args: ['login'],
    env: home => ({ HOME: home, AGENT_CLI_CREDENTIAL_STORE: 'file' }),
    result: home => readFileSync(join(home, '.cursor', 'auth.json'), 'utf8')
  },
  claude: {
    // A one-year token that can only make model requests; it is printed, never stored.
    args: ['setup-token'],
    env: () => ({}),
    terminal: true,
    result: (_home, output) => /(sk-ant-oat\d+-[\w-]{20,})[^\w-]/.exec(output)?.[1] ?? null
  }
}

export const startLocalLogin: StartLocalLogin = (agent, command) => {
  const recipe = RECIPES[agent]
  const home = mkdtempSync(join(tmpdir(), 'quuu-runner-login-'))
  let canceled = false
  let child: ChildProcess | null = null
  const stop = (): void => {
    child?.stdin?.end()
    child?.kill('SIGTERM')
  }
  const credential = (async () => {
    try {
      const env = withPath({ ...process.env, ...recipe.env(home), ELECTRON_RUN_AS_NODE: undefined }, await resolveLoginPath())
      if (canceled) throw new Error('Sign-in was canceled')
      let output = '', found: string | null = null
      const code = await new Promise<number | null>((resolve, reject) => {
        const helper = recipe.terminal ? nativeHelperPath('quuu-pty') : null
        if (recipe.terminal && !helper) { reject(new Error('The terminal helper is missing')); return }
        child = helper
          // The helper starts a login shell on a wide terminal, so the token is never wrapped.
          ? spawn(helper, ['/bin/sh', home, '1000', '50'], { env, stdio: ['pipe', 'pipe', 'pipe', 'pipe'], detached: true })
          : spawn(command, recipe.args, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
        if (helper) child.stdin?.write(`exec ${[command, ...recipe.args].map(shQuote).join(' ')}\n`)
        const read = (chunk: Buffer): void => {
          // Escape sequences stand in for spaces on a terminal; keep a boundary where they were.
          // eslint-disable-next-line no-control-regex -- matching terminal escape sequences is the point
          output = (output + chunk.toString().replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ' ')).slice(-65_536)
          if (helper && !found && (found = recipe.result(home, output))) stop()
        }
        child.stdout?.on('data', read)
        child.stderr?.on('data', read)
        const timer = setTimeout(stop, LOGIN_TIMEOUT_MS)
        child.once('error', reject)
        child.once('close', exit => { clearTimeout(timer); resolve(exit) })
      })
      if (canceled) throw new Error('Sign-in was canceled')
      const result = found ?? (code === 0 ? recipe.result(home, output) : null)
      if (!result) throw new Error('Sign-in was not completed')
      return result
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })()
  return { credential, cancel: () => { canceled = true; stop() } }
}
