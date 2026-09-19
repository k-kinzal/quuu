import { execFileSync, spawn } from 'node:child_process'
import { createSign } from 'node:crypto'
import {
  accessSync,
  constants,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { hasGitHubAppAuthentication } from '../settings/commitIdentity.js'
import type { CommitIdentity } from '../settings/identity.js'

/** The private key lives only in the macOS login keychain — never in the DB or the run environment. */
export const GITHUB_APP_KEYCHAIN_SERVICE = 'net.kinzal.quuu.github-app'

/** GitHub's current REST API version. Used only for App auth, so kept in one place. */
export const GITHUB_API_VERSION = '2026-03-10'

export interface PreparedGitHubAuth {
  env: NodeJS.ProcessEnv
  /** The wrapper shares the detached Run's lifetime. Removed only on normal exit. */
  dir: string | null
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

/** The 10-minute JWT for calling the API as the App. Not the same thing as an installation token. */
export function githubAppJwt(appId: string, pem: string, nowMs = Date.now()): string {
  if (!/^\d+$/.test(appId)) throw new Error('Could not read the GitHub App ID')
  const now = Math.floor(nowMs / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  // Backdate 60s so a slightly fast clock doesn't make a just-issued JWT count as from the future.
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }))
  const unsigned = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  return `${unsigned}.${signer.sign(pem).toString('base64url')}`
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url')
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
 * Add the gh wrapper to the Run's PATH, and point Git's credential helper at the same token mint.
 *
 * Installation tokens expire in an hour, so none is minted at Run start. The wrapper
 * mints one from the Keychain key each time, right before gh / git actually touches
 * GitHub. Even in a long Run, no path is left where only the final push is expired.
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
    const helperPath = join(dir, 'github-app-credential')
    const ghWrapperPath = join(dir, 'gh')
    mkdirSync(configDir, { recursive: true })
    writeFileSync(helperPath, credentialHelperScript(), { mode: 0o700 })

    const realGh = findExecutable(pathEnv, 'gh')
    if (realGh) {
      writeFileSync(ghWrapperPath, '#!/bin/sh\nexec "$QUUU_GITHUB_HELPER" gh "$@"\n', {
        mode: 0o700
      })
    }

    const env: NodeJS.ProcessEnv = {
      GH_TOKEN: undefined,
      GITHUB_TOKEN: undefined,
      GH_HOST: 'github.com',
      GH_REPO: repository,
      GH_CONFIG_DIR: configDir,
      GH_PROMPT_DISABLED: '1',
      QUUU_GITHUB_APP_ID: appId,
      QUUU_GITHUB_REPOSITORY: repository,
      QUUU_GITHUB_HELPER: helperPath,
      QUUU_REAL_GH: realGh ?? '',
      PATH: realGh ? `${dir}${delimiter}${pathEnv}` : pathEnv
    }

    appendGitConfig(env, inherited, 'credential.https://github.com.helper', '')
    appendGitConfig(
      env,
      { ...inherited, ...env },
      'credential.https://github.com.helper',
      `!${shellQuote(helperPath)} credential`
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

    return { env, dir }
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

/** A wrapper holding no secrets. The real key leaves the Keychain into a temp file only for the moment of the call. */
function credentialHelperScript(): string {
  return `#!/bin/sh
set -eu

service=${shellQuote(GITHUB_APP_KEYCHAIN_SERVICE)}
api_version=${shellQuote(GITHUB_API_VERSION)}

b64url() {
  /usr/bin/openssl base64 -A | /usr/bin/tr '+/' '-_' | /usr/bin/tr -d '='
}

mint() {
  app_id="${'$'}{QUUU_GITHUB_APP_ID:?GitHub App ID is missing}"
  repository="${'$'}{QUUU_GITHUB_REPOSITORY:?GitHub repository is missing}"
  owner="${'$'}{repository%%/*}"
  repo="${'$'}{repository#*/}"
  key_file="${'$'}(/usr/bin/mktemp "${'$'}{TMPDIR:-/tmp}/quuu-github-key.XXXXXX")"
  /bin/chmod 600 "${'$'}key_file"
  trap '/bin/rm -f "${'$'}key_file"' EXIT HUP INT TERM

  if ! encoded_key="${'$'}(/usr/bin/security find-generic-password -s "${'$'}service" -a "${'$'}app_id" -w)"; then
    echo "Quuu's GitHub App private key was not found. Update the App from Settings." >&2
    return 1
  fi
  if ! printf '%s' "${'$'}encoded_key" | /usr/bin/openssl base64 -d -A >"${'$'}key_file"; then
    echo "Could not read Quuu's GitHub App private key. Update the App from Settings." >&2
    return 1
  fi
  unset encoded_key
  if [ ! -s "${'$'}key_file" ] || ! /usr/bin/openssl pkey -in "${'$'}key_file" -noout >/dev/null 2>&1; then
    echo "Could not read Quuu's GitHub App private key. Update the App from Settings." >&2
    return 1
  fi

  now="${'$'}(/bin/date +%s)"
  iat="${'$'}((now - 60))"
  exp="${'$'}((now + 540))"
  header="${'$'}(printf '%s' '{"alg":"RS256","typ":"JWT"}' | b64url)"
  payload="${'$'}(printf '{"iat":%s,"exp":%s,"iss":"%s"}' "${'$'}iat" "${'$'}exp" "${'$'}app_id" | b64url)"
  unsigned="${'$'}header.${'$'}payload"
  signature="${'$'}(printf '%s' "${'$'}unsigned" | /usr/bin/openssl dgst -sha256 -sign "${'$'}key_file" | b64url)"
  jwt="${'$'}unsigned.${'$'}signature"

  installation_file="${'$'}(/usr/bin/mktemp "${'$'}{TMPDIR:-/tmp}/quuu-github-installation.XXXXXX")"
  trap '/bin/rm -f "${'$'}key_file" "${'$'}installation_file"' EXIT HUP INT TERM
  if ! installation_status="${'$'}(/usr/bin/curl --silent --show-error --location \\
    --output "${'$'}installation_file" --write-out '%{http_code}' \\
    -H 'Accept: application/vnd.github+json' \\
    -H "Authorization: Bearer ${'$'}jwt" \\
    -H "X-GitHub-Api-Version: ${'$'}api_version" \\
    "https://api.github.com/repos/${'$'}owner/${'$'}repo/installation")"; then
    echo 'Could not connect to GitHub.' >&2
    return 1
  fi
  case "${'$'}installation_status" in
    200) ;;
    401)
      echo 'GitHub App authentication failed. Update the App from Settings.' >&2
      return 1
      ;;
    404)
      echo "The GitHub App is not installed on ${'$'}repository." >&2
      return 1
      ;;
    *)
      echo "GitHub returned ${'$'}installation_status." >&2
      return 1
      ;;
  esac
  installation="${'$'}(/bin/cat "${'$'}installation_file")"
  installation_id="${'$'}(printf '%s' "${'$'}installation" | /usr/bin/plutil -extract id raw -o - - 2>/dev/null)" || return 1

  if ! token_status="${'$'}(/usr/bin/curl --silent --show-error --location --request POST \\
    --output "${'$'}installation_file" --write-out '%{http_code}' \\
    -H 'Accept: application/vnd.github+json' \\
    -H "Authorization: Bearer ${'$'}jwt" \\
    -H "X-GitHub-Api-Version: ${'$'}api_version" \\
    -H 'Content-Type: application/json' \\
    --data "{\\"repositories\\":[\\"${'$'}repo\\"]}" \\
    "https://api.github.com/app/installations/${'$'}installation_id/access_tokens")"; then
    echo 'Could not connect to GitHub.' >&2
    return 1
  fi
  case "${'$'}token_status" in
    201) ;;
    401)
      echo 'GitHub App authentication failed. Update the App from Settings.' >&2
      return 1
      ;;
    422)
      echo "The GitHub App cannot access ${'$'}repository. Add it in the GitHub installation settings." >&2
      return 1
      ;;
    *)
      echo "GitHub returned ${'$'}token_status." >&2
      return 1
      ;;
  esac
  response="${'$'}(/bin/cat "${'$'}installation_file")"
  printf '%s' "${'$'}response" | /usr/bin/plutil -extract token raw -o - - 2>/dev/null
}

case "${'$'}{1:-}" in
  gh)
    shift
    token="${'$'}(mint)"
    if [ -z "${'$'}{QUUU_REAL_GH:-}" ]; then
      echo 'gh was not found.' >&2
      exit 1
    fi
    GH_TOKEN="${'$'}token" GITHUB_TOKEN='' exec "${'$'}QUUU_REAL_GH" "${'$'}@"
    ;;
  credential)
    while IFS= read -r line; do [ -z "${'$'}line" ] && break; done
    token="${'$'}(mint)"
    printf 'username=x-access-token\npassword=%s\n\n' "${'$'}token"
    ;;
  cleanup)
    # Clean up only the Quuu-made temp directory this script itself lives in.
    /bin/rm -rf -- "${'$'}{0%/*}"
    ;;
  *)
    echo 'Invalid invocation of the GitHub App credential helper.' >&2
    exit 1
    ;;
esac
`
}

/** Lets tests verify no secret is written into the wrapper. */
export function readPreparedHelper(dir: string): string {
  return readFileSync(join(dir, 'github-app-credential'), 'utf8')
}
