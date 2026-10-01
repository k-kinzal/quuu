import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { userDataDir } from '../appPaths.js'
import { DPAPI_PROTECT, DPAPI_UNPROTECT, powershellPath } from './githubAuthRuntime.mjs'

/** Small secrets kept by the platform's key store, never in the DB or a process argument list. */
export interface SecretStore {
  read(account: string): Promise<string | null>
  write(account: string, value: string): Promise<void>
  remove(account: string): Promise<void>
}

/** The login Keychain on macOS; a DPAPI-protected file for the signed-in user on Windows. */
export function platformSecretStore(service: string): SecretStore {
  if (process.platform === 'win32') return dpapiStore(join(userDataDir(), 'secrets', service))
  return {
    async read(account) {
      try {
        const value = await run('/usr/bin/security', ['find-generic-password', '-s', service, '-a', account, '-w'])
        return Buffer.from(value.trim(), 'base64').toString()
      } catch { return null }
    },
    async write(account, value) {
      const encoded = Buffer.from(value).toString('base64')
      // `security -i` reads the command from stdin, so the secret never appears in the process list.
      const command = ['add-generic-password', '-U', '-a', account, '-s', service, '-T', '/usr/bin/security', '-w', encoded]
        .map(item => `'${item.replace(/'/g, `'"'"'`)}'`).join(' ')
      await run('/usr/bin/security', ['-q', '-i'], `${command}\n`)
      // Interactive mode exits 0 even when its command failed; the read-back is the proof.
      if (await this.read(account) !== value) throw new Error('Could not save the secret to the Keychain')
    },
    async remove(account) {
      await run('/usr/bin/security', ['delete-generic-password', '-s', service, '-a', account]).catch(() => '')
    }
  }
}

function dpapiStore(dir: string): SecretStore {
  const file = (account: string): string => join(dir, `${account.replace(/[^\w.-]/g, '_')}.secret`)
  const powershell = (script: string, account: string, input = ''): Promise<string> =>
    run(powershellPath(), ['-NoProfile', '-NonInteractive', '-Command', script], input, { ...process.env, QUUU_KEY_FILE: file(account) })
  return {
    async read(account) {
      try { return Buffer.from((await powershell(DPAPI_UNPROTECT, account)).trim(), 'base64').toString() } catch { return null }
    },
    async write(account, value) {
      mkdirSync(dir, { recursive: true })
      await powershell(DPAPI_PROTECT, account, `${Buffer.from(value).toString('base64')}\n`)
      if (await this.read(account) !== value) throw new Error('Could not save the secret')
    },
    remove(account) { rmSync(file(account), { force: true }); return Promise.resolve() }
  }
}

function run(command: string, args: string[], input = '', env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env, windowsHide: true })
    let stdout = '', stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { if (stdout.length < 65_536) stdout += chunk })
    child.stderr.on('data', (chunk: string) => { if (stderr.length < 8192) stderr += chunk })
    child.once('error', reject)
    child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `${basename(command)} exited with ${String(code)}`)))
    child.stdin.end(input)
  })
}
