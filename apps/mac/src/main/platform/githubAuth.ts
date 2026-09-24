import { execFileSync, spawn } from 'node:child_process'
import {
  accessSync,
  constants,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import runtimeSource from './githubAuthRuntime.mjs?raw'
import { githubAppJwt, writeGitHubHosts } from './githubAuthRuntime.mjs'
import { botLogin, hasGitHubAppAuthentication } from '../settings/commitIdentity.js'
import type { CommitIdentity } from '../settings/identity.js'

export { githubAppJwt } from './githubAuthRuntime.mjs'

/** The private key lives only in the macOS login keychain — never in the DB or the run environment. */
export const GITHUB_APP_KEYCHAIN_SERVICE = 'net.kinzal.quuu.github-app'

/** GitHub's current REST API version. Used only for App auth, so kept in one place. */
export const GITHUB_API_VERSION = '2026-03-10'

export interface PreparedGitHubAuth {
  env: NodeJS.ProcessEnv
  /** Private files share the detached Run's lifetime, including across app restarts. */
  dir: string | null
  /** Prefix for the command that starts the agent after authentication succeeds. */
  launch?: string[]
}

/** Entrust to the Keychain the private key handed over exactly once by the manifest conversion. */
export async function saveGitHubAppPrivateKey(
  appId: string,
  pem: string,
  keychainPath?: string
): Promise<void> {
  if (!/^\d+$/.test(appId)) throw new Error('Could not read the GitHub App ID')
  if (!pem.includes('BEGIN') || !pem.includes('PRIVATE KEY')) {
    throw new Error('Could not read the GitHub App private key')
  }

  const encoded = Buffer.from(pem).toString('base64')
  const command = [
    'add-generic-password',
    '-U',
    '-a',
    appId,
    '-s',
    GITHUB_APP_KEYCHAIN_SERVICE,
    '-T',
    '/usr/bin/security',
    '-w',
    encoded,
    ...(keychainPath ? [keychainPath] : [])
  ]
    .map(shellQuote)
    .join(' ')

  /*
   * `security add-generic-password -w` with the value omitted reads from the tty. A pipe
   * on stdin is not a tty, and it saves an empty value with exit code 0. `security -i`
   * reads stdin as commands, so the value can be passed without putting the secret on
   * argv / the process list.
   */
  await runSecurity(['-q', '-i'], `${command}\n`)

  /*
   * Interactive mode exits 0 even when the command it ran inside failed.
   * Proof of saving is not the exit code but the read-back value, and whether it's a PEM
   * that can sign.
   */
  const saved = (
    await runSecurity([
      'find-generic-password',
      '-s',
      GITHUB_APP_KEYCHAIN_SERVICE,
      '-a',
      appId,
      '-w',
      ...(keychainPath ? [keychainPath] : [])
    ])
  ).trim()
  if (saved !== encoded) throw new Error('Could not save the GitHub App private key to the Keychain')

  const savedPem = Buffer.from(saved, 'base64').toString()
  if (savedPem !== pem) throw new Error('Could not save the GitHub App private key to the Keychain')
  githubAppJwt(appId, savedPem)
}

async function runSecurity(args: string[], input = ''): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn('/usr/bin/security', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (stdout.length < 16_384) stdout += chunk
    })
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 8192) stderr += chunk
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr.trim() || `security exited with ${String(code)}`))
    })
    child.stdin.end(input)
  })
}

/** The origin's GitHub repository. Credentials are never handed to other hosts or local remotes. */
export function githubRepositoryFromRemote(remote: string): string | null {
  const value = remote.trim()
  const match =
    /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(value) ??
    /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/.exec(value) ??
    /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/.exec(value)
  if (!match) return null
  const owner = match[1]
  const name = match[2]
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) return null
  return `${owner}/${name}`
}

/**
 * Give native gh and Git one private, populated configuration. A detached
 * supervisor issues and refreshes the token without depending on shell PATH.
 */
export function prepareGitHubAuthEnvironment(
  identity: CommitIdentity | null,
  projectPath: string,
  pathEnv: string,
  inherited: NodeJS.ProcessEnv
): PreparedGitHubAuth {
  /*
   * Old-format setups get pointed at the update in the UI, but until updated they must
   * not fall back to the human's gh auth. Use the stored App auth; if the key is broken,
   * the helper stops and spells out how to update.
   */
  if (!identity || !hasGitHubAppAuthentication(identity)) return { env: {}, dir: null }

  const remote = gitOrigin(projectPath)
  const repository = remote ? githubRepositoryFromRemote(remote) : null
  if (!repository) return { env: {}, dir: null }

  const appId = identity.appId!.trim()
  const dir = mkdtempSync(join(tmpdir(), 'quuu-github-'))
  try {
    const configDir = join(dir, 'config')
    const runtimePath = join(dir, 'runtime.mjs')
    const realGh = findExecutable(pathEnv, 'gh')
    if (!realGh) throw new Error('gh was not found. Install GitHub CLI to use the GitHub App.')
    mkdirSync(configDir, { mode: 0o700 })
    // A nonempty sentinel prevents Keychain fallback even before the first issue.
    writeGitHubHosts(configDir, botLogin(identity.appSlug), 'quuu-authentication-pending')
    writeFileSync(runtimePath, `${runtimeSource}\nawait run()\n`, { mode: 0o600 })
    writeFileSync(join(dir, 'runtime.json'), JSON.stringify({
      appId,
      repository,
      user: botLogin(identity.appSlug),
      keychainService: GITHUB_APP_KEYCHAIN_SERVICE,
      apiVersion: GITHUB_API_VERSION
    }), { mode: 0o600 })

    const env: NodeJS.ProcessEnv = {
      GH_TOKEN: undefined,
      GITHUB_TOKEN: undefined,
      GH_HOST: 'github.com',
      GH_REPO: repository,
      GH_CONFIG_DIR: configDir,
      GH_PROMPT_DISABLED: '1',
      // Do not inherit the obsolete PATH wrapper when Quuu rebuilds itself.
      QUUU_GITHUB_APP_ID: undefined,
      QUUU_GITHUB_REPOSITORY: undefined,
      QUUU_GITHUB_HELPER: undefined,
      QUUU_REAL_GH: undefined
    }

    appendGitConfig(env, inherited, 'credential.https://github.com.helper', '')
    appendGitConfig(
      env,
      { ...inherited, ...env },
      'credential.https://github.com.helper',
      `!${shellQuote(realGh)} auth git-credential`
    )
    appendGitConfig(
      env,
      { ...inherited, ...env },
      'url.https://github.com/.insteadOf',
      'git@github.com:'
    )
    appendGitConfig(
      env,
      { ...inherited, ...env },
      'url.https://github.com/.insteadOf',
      'ssh://git@github.com/'
    )

    return { env, dir, launch: ['/usr/bin/env', 'ELECTRON_RUN_AS_NODE=1', process.execPath, runtimePath] }
  } catch (err) {
    cleanupGitHubAuth(dir)
    throw err
  }
}

export function cleanupGitHubAuth(dir: string | null): void {
  if (dir) rmSync(dir, { recursive: true, force: true })
}

function gitOrigin(projectPath: string): string | null {
  try {
    const result = requireExecFile('/usr/bin/git', [
      '-C',
      projectPath,
      'config',
      '--get',
      'remote.origin.url'
    ])
    return result.trim() || null
  } catch {
    return null
  }
}

/** A small synchronous read. Happens once before spawn, and never goes to the network. */
function requireExecFile(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

function findExecutable(pathEnv: string, name: string): string | null {
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, name)
    try {
      accessSync(candidate, constants.X_OK)
      return realpathSync(candidate)
    } catch {
      // Try the next PATH entry
    }
  }
  return null
}

function appendGitConfig(
  additions: NodeJS.ProcessEnv,
  current: NodeJS.ProcessEnv,
  key: string,
  value: string
): void {
  const parsed = Number(current.GIT_CONFIG_COUNT ?? '0')
  const index = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
  additions.GIT_CONFIG_COUNT = String(index + 1)
  additions[`GIT_CONFIG_KEY_${index}`] = key
  additions[`GIT_CONFIG_VALUE_${index}`] = value
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}
