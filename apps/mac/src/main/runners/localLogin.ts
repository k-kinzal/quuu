import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withPath } from '../platform/processEnv.js'
import { resolveLoginPath } from '../platform/shellEnv.js'
import type { RunnerLoginAgent } from './agentAuth.js'

export interface LocalLogin {
  /** The authorization page, once the CLI prints it. */
  url: Promise<string>
  /** The new login's credential file. Its temporary directory is already deleted. */
  credential: Promise<string>
  cancel(): void
}
export type StartLocalLogin = (agent: RunnerLoginAgent, command: string) => LocalLogin

const LOGIN_TIMEOUT_MS = 10 * 60_000

/**
 * Sign in once on this computer, where the browser can reach the CLI's callback, into a throwaway
 * home. The result is a session separate from the user's own login, so handing it to one Runner
 * leaves no second holder of its refresh token.
 */
export const startLocalLogin: StartLocalLogin = (_agent, command) => {
  const home = mkdtempSync(join(tmpdir(), 'quuu-runner-login-'))
  let canceled = false
  let cancel = (): void => { canceled = true }
  let announce: (url: string) => void = () => {}
  const url = new Promise<string>(resolve => { announce = resolve })
  const credential = (async () => {
    try {
      const path = await resolveLoginPath()
      if (canceled) throw new Error('Sign-in was canceled')
      const code = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(command, ['login', '-c', 'cli_auth_credentials_store="file"'], {
          env: withPath({ ...process.env, CODEX_HOME: home, ELECTRON_RUN_AS_NODE: undefined }, path),
          stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
        })
        let output = ''
        const read = (chunk: Buffer): void => {
          output = (output + chunk.toString()).slice(-16_384)
          const found = /https:\/\/[^\s"'<>]+/.exec(output)
          if (found) announce(found[0])
        }
        child.stdout.on('data', read)
        child.stderr.on('data', read)
        const timer = setTimeout(() => child.kill(), LOGIN_TIMEOUT_MS)
        cancel = () => { canceled = true; child.kill() }
        child.once('error', reject)
        child.once('close', exit => { clearTimeout(timer); resolve(exit) })
      })
      if (code !== 0) throw new Error('Sign-in was not completed')
      return readFileSync(join(home, 'auth.json'), 'utf8')
    } finally {
      rmSync(home, { recursive: true, force: true })
      announce('')
    }
  })()
  return { url, credential, cancel: () => cancel() }
}
