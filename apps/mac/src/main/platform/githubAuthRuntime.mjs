// Copied into each detached Run. Only Node built-ins: rebuilding Quuu must not
// remove a running agent's token refresher or change the code underneath it.
import { execFile, spawn } from 'node:child_process'
import { createSign } from 'node:crypto'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { constants } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

const REFRESH_MARGIN_MS = 15 * 60 * 1000
const RETRY_MS = 60 * 1000
const POLL_MS = 60 * 1000
const API_ORIGIN = 'https://api.github.com'
const security = promisify(execFile)

export function githubAppJwt(appId, pem, nowMs = Date.now()) {
  if (!/^\d+$/.test(appId)) throw new Error('Could not read the GitHub App ID')
  const now = Math.floor(nowMs / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })).toString('base64url')
  const unsigned = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  return `${unsigned}.${signer.sign(pem).toString('base64url')}`
}

export function writeGitHubHosts(configDir, user, token) {
  // Include the account map as well as the active token, so gh never attempts
  // legacy account migration (/user is unavailable to installation tokens).
  const account = JSON.stringify(user)
  const credential = JSON.stringify(token)
  const contents = `github.com:\n    user: ${account}\n    oauth_token: ${credential}\n    git_protocol: https\n    users:\n        ${account}:\n            oauth_token: ${credential}\n`
  const staging = join(configDir, 'hosts.yml.next')
  writeFileSync(staging, contents, { mode: 0o600 })
  renameSync(staging, join(configDir, 'hosts.yml'))
}

export function refreshDelay(expiresAt, nowMs = Date.now()) {
  // Bound retries for unexpectedly short-lived tokens; never spin on an API response.
  return Math.max(1000, expiresAt - REFRESH_MARGIN_MS - nowMs)
}

async function issueToken(config, signal) {
  let pem
  try {
    const result = await security('/usr/bin/security', [
      'find-generic-password', '-s', config.keychainService, '-a', config.appId, '-w'
    ], { encoding: 'utf8', timeout: 30_000, maxBuffer: 16_384, signal })
    pem = Buffer.from(result.stdout.trim(), 'base64').toString()
  } catch {
    throw new Error("Quuu's GitHub App private key was not found. Update the App from Settings.")
  }
  let jwt
  try {
    jwt = githubAppJwt(config.appId, pem)
  } catch {
    throw new Error("Could not read Quuu's GitHub App private key. Update the App from Settings.")
  }
  const request = async (path, method, body) => {
    let response
    try {
      response = await fetch(`${API_ORIGIN}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${jwt}`,
          'X-GitHub-Api-Version': config.apiVersion,
          'Content-Type': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)])
      })
      if (response.ok) return await response.json()
    } catch {
      throw new Error('Could not connect to GitHub.')
    }
    if (response.status === 401) throw new Error('GitHub App authentication failed. Update the App from Settings.')
    if (response.status === 404 || response.status === 422) {
      throw new Error(`The GitHub App cannot access ${config.repository}. Add it in the GitHub installation settings.`)
    }
    // Never log the response body, JWT, private key, or installation token.
    throw new Error(`GitHub returned ${response.status}.`)
  }
  const installation = await request(`/repos/${config.repository}/installation`, 'GET')
  if (!Number.isSafeInteger(installation.id) || installation.id <= 0) {
    throw new Error('GitHub returned an invalid installation ID.')
  }
  const result = await request(`/app/installations/${installation.id}/access_tokens`, 'POST', {
    repositories: [config.repository.split('/')[1]]
  })
  const expiresAt = Date.parse(result.expires_at)
  if (typeof result.token !== 'string' || !result.token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('GitHub returned an invalid installation token or expiration.')
  }
  return { token: result.token, expiresAt }
}

export async function run() {
  const dir = dirname(process.argv[1])
  const configDir = join(dir, 'config')
  const controller = new AbortController()
  const { signal } = controller
  let child
  let refreshJob
  let stopCode
  const handlers = new Map()
  for (const name of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    const handler = () => {
      stopCode = 128 + constants.signals[name]
      controller.abort()
      child?.kill(name)
    }
    handlers.set(name, handler)
    process.on(name, handler)
  }
  try {
    const config = JSON.parse(readFileSync(join(dir, 'runtime.json'), 'utf8'))
    const refresh = async () => {
      const issued = await issueToken(config, signal)
      signal.throwIfAborted()
      writeGitHubHosts(configDir, config.user, issued.token)
      return Date.now() + refreshDelay(issued.expiresAt)
    }
    // Authentication must succeed before the agent can execute any command.
    let nextRefresh = await refresh()
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.NODE_OPTIONS
    delete env.GH_TOKEN
    delete env.GITHUB_TOKEN
    env.GH_CONFIG_DIR = configDir
    const exit = new Promise((resolve, reject) => {
      child = spawn(process.argv[2], process.argv.slice(3), { env, stdio: 'inherit' })
      child.once('error', () => reject(new Error('Could not start the agent.')))
      child.once('exit', (code, name) => resolve(code ?? (128 + (constants.signals[name] ?? 1))))
    })
    refreshJob = (async () => {
      while (!signal.aborted) {
        // Check wall time at least once a minute, including after macOS wakes.
        await delay(Math.max(1, Math.min(POLL_MS, nextRefresh - Date.now())), undefined, { signal })
        if (Date.now() < nextRefresh) continue
        try {
          nextRefresh = await refresh()
        } catch (error) {
          if (signal.aborted) break
          // Keep the old nonempty config even if expired: removing it would let
          // gh fall back to the user's Keychain credentials.
          console.error(`[Quuu GitHub App] ${error.message} Retrying in 60 seconds.`)
          nextRefresh = Date.now() + RETRY_MS
        }
      }
    })().catch((error) => {
      if (!signal.aborted) throw error
    })
    process.exitCode = await exit
  } catch (error) {
    if (!signal.aborted) console.error(`[Quuu GitHub App] ${error.message}`)
    process.exitCode = stopCode ?? 1
  } finally {
    controller.abort()
    await refreshJob
    for (const [name, handler] of handlers) process.off(name, handler)
    rmSync(dir, { recursive: true, force: true })
  }
}
