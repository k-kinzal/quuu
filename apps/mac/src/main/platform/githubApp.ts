import { randomBytes, randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { t } from '../i18n/index.js'
import type { BotUserResult, CreateAppResult } from '../ipc/types.js'
import { botLogin, GITHUB_APP_SETUP_VERSION, normalizeAppSlug } from '../settings/commitIdentity.js'
import { GITHUB_API_VERSION, githubAppJwt, saveGitHubAppPrivateKey } from './githubAuth.js'

/**
 * Fetch the GitHub App's bot user ID from GitHub.
 *
 * The ID appears nowhere in GitHub's UI — **the API is the only way a human
 * can learn it**. Typed by hand, one dropped digit means "configured, yet no
 * commit is attributed to anyone", noticed only after it's in history.
 * So a button press fills it in.
 *
 * No auth needed (the bot resolves as a public account). Even for a private
 * App, the bot account exists the moment the App is created, so it resolves
 * the same way.
 */
const USERS_API = 'https://api.github.com/users/'

/** Don't leave the button hanging. Better to press again than to wait on a peer that never answers. */
const TIMEOUT_MS = 10_000

const GITHUB_HEADERS = {
  accept: 'application/vnd.github+json',
  'user-agent': 'Quuu',
  'x-github-api-version': GITHUB_API_VERSION
}

export async function fetchBotUserId(
  appSlug: string,
  fetchImpl: typeof fetch = fetch
): Promise<BotUserResult> {
  if (normalizeAppSlug(appSlug).length === 0) return { ok: false, reason: t('githubApp.slugEmpty') }

  const login = botLogin(appSlug)
  let res: Response
  try {
    res = await fetchImpl(`${USERS_API}${encodeURIComponent(login)}`, {
      headers: GITHUB_HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch {
    return { ok: false, reason: t('githubApp.connectionFailed') }
  }

  if (res.status === 404) return { ok: false, reason: t('githubApp.loginNotFound', { login }) }
  if (res.status === 403 || res.status === 429) {
    return { ok: false, reason: t('githubApp.rateLimited') }
  }
  if (!res.ok) return { ok: false, reason: t('githubApp.badStatus', { status: res.status }) }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, reason: t('githubApp.responseUnreadable') }
  }

  const user = body as { id?: unknown; type?: unknown }
  if (typeof user.id !== 'number') return { ok: false, reason: t('githubApp.responseUnreadable') }
  // Don't mistake a same-named human account for the bot (humans can register names containing `[bot]`)
  if (user.type !== 'Bot') return { ok: false, reason: t('githubApp.notBot', { login }) }

  return { ok: true, botUserId: String(user.id) }
}

// ---------------------------------------------------------------------------
// Creating the App (GitHub App Manifest flow)
// ---------------------------------------------------------------------------

/**
 * Have the browser create the App and receive the resulting App slug.
 *
 * GitHub's "App Manifest" exists so that **we POST a definition we prepared,
 * the human presses once, the App is created, and control returns to us**.
 * It is the only route that gets the press count down to one, instead of a
 * walkthrough with ten fields to fill — so we use it.
 *
 *   1. Stand up this one-shot server on a free 127.0.0.1 port
 *   2. `/` is just a page whose form auto-POSTs the manifest to GitHub
 *   3. The human presses "Create GitHub App" on GitHub
 *   4. GitHub returns to `/callback?code=...&state=...`
 *   5. `POST /app-manifests/{code}/conversions` exchanges the code for App info
 *   6. Continue straight into installing the App; returns to `/installed`
 *   7. Verify the installation with the App's own JWT, entrust the private key to the Keychain
 *
 * Of the secrets the manifest returns we use **only the private key needed to
 * mint installation tokens**. It goes into the macOS Keychain after the browser
 * flow completes end to end — never into the DB or settings JSON. The client
 * secret and webhook secret are, as before, never accepted.
 */

/** Time for the human to act in the browser. Too long and the pressing side looks frozen. */
const CREATE_TIMEOUT_MS = 10 * 60 * 1000

/**
 * The App's name. **We decide it ourselves.**
 *
 * Names are unique across all of GitHub, and the slug (= the byline) derives
 * from them. Letting the human decide demands the knowledge to decide (what
 * becomes the byline) up front, so we mint a collision-resistant form with a
 * number. Only on a collision does it need fixing, in GitHub's UI — which is
 * within reach, since that's where they are.
 *
 * No machine names or user names mixed in. **The byline lands on every
 * commit**, so nothing that history doesn't need gets written into it.
 */
const APP_NAME_DIGITS = 6

function appName(): string {
  const n = randomInt(0, 10 ** APP_NAME_DIGITS)
  return `Quuu${String(n).padStart(APP_NAME_DIGITS, '0')}`
}

/**
 * Definition of the App being created.
 *
 * The minimum permissions for an agent to finish routine GitHub work under the
 * bot's credentials. contents for pushing branches, pull_requests for opening
 * PRs, workflows for pushing commits that touch `.github/workflows`. No issue
 * or admin permissions.
 */
function manifest(redirectUrl: string, setupUrl: string): Record<string, unknown> {
  return {
    name: appName(),
    url: 'https://github.com/apps',
    description: t('githubApp.description'),
    redirect_url: redirectUrl,
    setup_url: setupUrl,
    setup_on_update: true,
    // Private App (only its creator can install it)
    public: false,
    default_permissions: {
      metadata: 'read',
      contents: 'write',
      pull_requests: 'write',
      workflows: 'write'
    },
    default_events: [],
    // Webhooks are unused. A URL is required even when disabled, so point at somewhere unreachable
    hook_attributes: { url: 'https://github.com/apps', active: false }
  }
}

/** The creation in flight. Kept as a single slot so cancel (`cancelGitHubApp`) can fold it up. */
let pending: { server: Server; finish(result: CreateAppResult): void } | null = null

export function cancelGitHubApp(): void {
  pending?.finish({ ok: false, reason: t('githubApp.canceled'), canceled: true })
}

export interface GitHubAppFlowDeps {
  fetchImpl?: typeof fetch
  savePrivateKey?: typeof saveGitHubAppPrivateKey
}

interface ConvertedApp {
  appId: string
  slug: string
  pem: string
}

export async function createGitHubApp(
  openUrl: (url: string) => Promise<void>,
  deps: GitHubAppFlowDeps = {}
): Promise<CreateAppResult> {
  // Never run two at once — the return address (redirect_url) would stop being singular
  cancelGitHubApp()

  const state = randomBytes(16).toString('hex')
  /*
   * The App is created under the user's own account. No field for typing an
   * Organization: every chance to type is a chance to mistype, and each typo
   * is another "created it, but never came back". When an Organization's App
   * is needed, the finished App can be transferred on GitHub's side.
   */
  const newAppUrl = 'https://github.com/settings/apps/new'

  const server = createServer()
  let settle: (result: CreateAppResult) => void
  const done = new Promise<CreateAppResult>((resolve) => {
    settle = resolve
  })

  let closed = false
  const finish = (result: CreateAppResult): void => {
    if (closed) return
    closed = true
    clearTimeout(timer)
    if (pending?.server === server) pending = null
    server.close()
    settle(result)
  }
  const timer = setTimeout(
    () => finish({ ok: false, reason: t('githubApp.browserTimedOut') }),
    CREATE_TIMEOUT_MS
  )

  // Let the OS pick the port. A fixed one is guaranteed to fail wherever it's taken
  let port: number
  try {
    port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
    })
  } catch (err) {
    clearTimeout(timer)
    server.close()
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
  const redirectUrl = `http://127.0.0.1:${port}/callback`
  const setupUrl = `http://127.0.0.1:${port}/installed?state=${state}`
  const fetchImpl = deps.fetchImpl ?? fetch
  const savePrivateKey = deps.savePrivateKey ?? saveGitHubAppPrivateKey
  let createdApp: ConvertedApp | null = null
  let converting = false
  let installing = false

  server.on('request', (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')

    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(handoffPage(`${newAppUrl}?state=${state}`, manifest(redirectUrl, setupUrl)))
      return
    }

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code') ?? ''
      // Check the state. Even with a 127.0.0.1 return address, block the trick of making the user press and handing us someone else's code
      if (url.searchParams.get('state') !== state || !code) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
        res.end(resultPage(t('githubApp.createUnconfirmedPage')))
        finish({ ok: false, reason: t('githubApp.stateMismatch') })
        return
      }
      if (converting || createdApp) {
        res.writeHead(409, { 'content-type': 'text/html; charset=utf-8' })
        res.end(resultPage(t('githubApp.createInProgressPage')))
        return
      }

      converting = true
      void convert(code, fetchImpl).then((result) => {
        converting = false
        if (closed) return
        if (!result.ok) {
          res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' })
          res.end(resultPage(result.reason))
          finish(result)
          return
        }
        createdApp = result.app
        res.writeHead(302, {
          location: `https://github.com/apps/${encodeURIComponent(result.app.slug)}/installations/new`
        })
        res.end()
      })
      return
    }

    if (url.pathname !== '/installed') {
      res.writeHead(404).end()
      return
    }

    const installationId = url.searchParams.get('installation_id') ?? ''
    if (
      url.searchParams.get('state') !== state ||
      !/^\d+$/.test(installationId) ||
      !createdApp
    ) {
      res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
      res.end(resultPage(t('githubApp.installUnconfirmedPage')))
      finish({ ok: false, reason: t('githubApp.installUnconfirmed') })
      return
    }
    if (installing) {
      res.writeHead(409, { 'content-type': 'text/html; charset=utf-8' })
      res.end(resultPage(t('githubApp.installCheckingPage')))
      return
    }

    installing = true
    const app = createdApp
    void completeInstallation(app, installationId, fetchImpl, savePrivateKey).then((result) => {
      if (closed) return
      if (!result.ok) {
        res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' })
        res.end(resultPage(result.reason))
        finish(result)
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(donePage(app.slug))
      finish(result)
    })
  })
  server.on('error', (err) => finish({ ok: false, reason: err.message }))

  pending = { server, finish }

  try {
    await openUrl(`http://127.0.0.1:${port}/`)
  } catch (err) {
    finish({ ok: false, reason: err instanceof Error ? err.message : String(err) })
  }

  return done
}

type ConvertResult = { ok: true; app: ConvertedApp } | { ok: false; reason: string }

/** Exchange the code for App info. The private key isn't saved yet — carried until the installation is verified. */
async function convert(code: string, fetchImpl: typeof fetch): Promise<ConvertResult> {
  let res: Response
  try {
    res = await fetchImpl(
      `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
      {
        method: 'POST',
        headers: GITHUB_HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      }
    )
  } catch {
    return { ok: false, reason: t('githubApp.connectionFailed') }
  }
  if (!res.ok) return { ok: false, reason: t('githubApp.badStatus', { status: res.status }) }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, reason: t('githubApp.responseUnreadable') }
  }

  // client_secret / webhook_secret are unused. Only the pem needed for installation tokens is kept.
  const { id, slug, pem } = body as { id?: unknown; slug?: unknown; pem?: unknown }
  if (
    typeof id !== 'number' ||
    !Number.isSafeInteger(id) ||
    typeof slug !== 'string' ||
    slug.length === 0 ||
    typeof pem !== 'string' ||
    !pem.includes('PRIVATE KEY')
  ) {
    return { ok: false, reason: t('githubApp.responseUnreadable') }
  }

  return { ok: true, app: { appId: String(id), slug, pem } }
}

async function completeInstallation(
  app: ConvertedApp,
  installationId: string,
  fetchImpl: typeof fetch,
  savePrivateKey: typeof saveGitHubAppPrivateKey
): Promise<CreateAppResult> {
  let jwt: string
  try {
    jwt = githubAppJwt(app.appId, app.pem)
  } catch {
    return { ok: false, reason: t('githubApp.keyUnreadable') }
  }

  let res: Response
  try {
    res = await fetchImpl(`https://api.github.com/app/installations/${installationId}`, {
      headers: { ...GITHUB_HEADERS, authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch {
    return { ok: false, reason: t('githubApp.connectionFailed') }
  }
  if (!res.ok) return { ok: false, reason: t('githubApp.badStatus', { status: res.status }) }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { ok: false, reason: t('githubApp.responseUnreadable') }
  }
  const installation = body as { app_id?: unknown; permissions?: unknown }
  const installationAppId =
    typeof installation.app_id === 'number' || typeof installation.app_id === 'string'
      ? String(installation.app_id)
      : ''
  const permissions = installation.permissions as Record<string, unknown> | undefined
  const correctPermissions =
    permissions?.contents === 'write' &&
    permissions.pull_requests === 'write' &&
    permissions.workflows === 'write'
  if (installationAppId !== app.appId || !correctPermissions) {
    return { ok: false, reason: t('githubApp.createdInstallUnconfirmed') }
  }

  try {
    await savePrivateKey(app.appId, app.pem)
  } catch {
    return { ok: false, reason: t('githubApp.keySaveFailed') }
  }

  // A freshly created bot sometimes doesn't resolve yet, so the App setup succeeds even when this fails.
  return {
    ok: true,
    identity: {
      appSlug: app.slug,
      botUserId: await botUserIdWithRetry(app.slug, fetchImpl),
      appId: app.appId,
      setupVersion: GITHUB_APP_SETUP_VERSION
    }
  }
}

/** Wait a little for the newborn bot to appear in the API. After a few tries, give up and hand it to the human. */
async function botUserIdWithRetry(slug: string, fetchImpl: typeof fetch): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const result = await fetchBotUserId(slug, fetchImpl)
    if (result.ok) return result.botUserId
    await new Promise((r) => setTimeout(r, 1000))
  }
  return ''
}

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )

/**
 * A page whose only job is handing the manifest to GitHub.
 *
 * The manifest **can only travel by POST** (not query-string sized), so a
 * form that submits without a press is inserted. A button is kept too, so the
 * flow still works with JavaScript disabled.
 */
function handoffPage(action: string, body: Record<string, unknown>): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Quuu</title></head>
<body style="font-family:-apple-system,sans-serif;padding:2rem">
<form id="f" method="post" action="${escapeHtml(action)}">
  <input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(body))}">
  <button type="submit">${escapeHtml(t('githubApp.createButton'))}</button>
</form>
<script>document.getElementById('f').submit()</script>
</body></html>`
}

function resultPage(message: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Quuu</title></head>
<body style="font-family:-apple-system,sans-serif;padding:2rem">${escapeHtml(message)}</body></html>`
}

/**
 * The badge to hand over, as a data URI.
 *
 * Generated from the one icon master by `npm run icon` and shipped in the app's
 * resources; an unpackaged run reads it out of the working tree. Carried inline
 * rather than served, because this listener folds up the moment the page goes out
 * — a second request for the image would arrive at a closed port.
 */
function logoDataUri(): string | null {
  const resourcesPath =
    'resourcesPath' in process && typeof process.resourcesPath === 'string'
      ? process.resourcesPath
      : null
  const candidates = [
    ...(resourcesPath ? [join(resourcesPath, 'build', 'github-app-logo.png')] : []),
    join(process.cwd(), 'build', 'github-app-logo.png'),
    join(process.cwd(), 'apps', 'mac', 'build', 'github-app-logo.png')
  ]
  for (const candidate of candidates) {
    try {
      return `data:image/png;base64,${readFileSync(candidate).toString('base64')}`
    } catch {
      // Try the next location
    }
  }
  return null
}

/**
 * The last page of the flow: the App is ready, and the icon is the one thing left.
 *
 * **GitHub accepts an App's logo through its own form and nowhere else** — the
 * manifest has no field for it, and no API sets it. An App without one does not
 * wear Quuu's face, so every pull request an agent opens carries a badge nobody
 * chose, and the human finds out weeks later while reading a PR.
 *
 * So the only press we cannot absorb gets handed over here, while the human is
 * still standing in the browser: the picture to drop, and the page that takes it.
 * If the badge is missing (nothing to hand over), say the App is ready and stop —
 * a finished setup must not read as failed over an icon.
 */
function donePage(slug: string): string {
  const logo = logoDataUri()
  if (!logo) return resultPage(t('githubApp.donePage'))
  const settingsUrl = `https://github.com/settings/apps/${encodeURIComponent(normalizeAppSlug(slug))}`
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Quuu</title></head>
<body style="font-family:-apple-system,sans-serif;padding:2rem">
<p>${escapeHtml(t('githubApp.donePage'))}</p>
<hr>
<p>${escapeHtml(t('githubApp.logoPending'))}</p>
<p><img src="${logo}" width="100" height="100" alt=""></p>
<p>
  <a href="${logo}" download="Quuu.png">${escapeHtml(t('githubApp.logoDownload'))}</a>
  &nbsp;
  <a href="${escapeHtml(settingsUrl)}">${escapeHtml(t('githubApp.logoSettings'))}</a>
</p>
</body></html>`
}
