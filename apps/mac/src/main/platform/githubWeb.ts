import { BrowserWindow, session } from 'electron'
import { attachContextMenu } from '../contextMenu.js'
import { t } from '../i18n/index.js'

/**
 * The session the GitHub pages inside Quuu live in.
 *
 * Its own persistent partition rather than the app's default session: the sign-in has to outlive
 * a restart (and Quuu is restarted as routine), and GitHub's cookies have no business sitting
 * beside the app's own pages. Every embedded GitHub page and the sign-in window share it, so
 * signing in once is signing in for all of them.
 */
const PARTITION = 'persist:quuu-github'
const GITHUB = 'https://github.com'

/** Mirrors the operation contract's `GitHubWebStatus`. */
export interface GitHubWebStatus {
  signedIn: boolean
  login: string | null
}

let prepared = false
let signingIn: { window: BrowserWindow; done: Promise<GitHubWebStatus> } | null = null

export function githubWebSession(): Electron.Session {
  const github = session.fromPartition(PARTITION)
  if (!prepared) {
    prepared = true
    // A code review page needs no camera, location or notifications. Copying a SHA does.
    github.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'clipboard-sanitized-write'))
  }
  return github
}

/**
 * Write the cookie store down now.
 *
 * Chromium flushes it on its own clock and at a clean exit. Quuu is often ended by a signal
 * (`npm run app:restart`) between those, and a sign-in that existed only in memory comes back
 * signed out — the very thing the person signed in to avoid.
 */
export function persistGitHubWeb(): void {
  void githubWebSession().cookies.flushStore().catch((error: unknown) => console.warn('Cannot save the GitHub sign-in', error))
}

/**
 * Signed in when GitHub's page would say so: its `logged_in` marker, and the session cookie it
 * stands for. The marker outlives an expired session, so it is not enough alone.
 */
export async function githubWebStatus(): Promise<GitHubWebStatus> {
  const cookies = await githubWebSession().cookies.get({ url: GITHUB })
  const value = (name: string): string | undefined => cookies.find(cookie => cookie.name === name)?.value
  const signedIn = value('logged_in') === 'yes' && Boolean(value('user_session'))
  return { signedIn, login: signedIn ? value('dotcom_user') ?? null : null }
}

function signInPage(url: string): boolean {
  try {
    const { protocol, hostname, pathname } = new URL(url)
    return protocol === 'https:' && hostname === 'github.com' && /^\/(?:login|session|sessions)(?:\/|$)/.test(pathname)
  } catch {
    return false
  }
}

/**
 * Show GitHub's own sign-in page, in the session the embedded pages use.
 *
 * Quuu handles no password: the person types it into GitHub's page, and two-factor, passkeys and
 * an organization's single sign-on all go through GitHub's own flow (hence any https page may be
 * visited). The window closes itself once GitHub has let the person in.
 */
export function signInToGitHubWeb(owner: BrowserWindow | null): Promise<GitHubWebStatus> {
  if (signingIn && !signingIn.window.isDestroyed()) {
    signingIn.window.focus()
    return signingIn.done
  }
  const window = new BrowserWindow({
    ...(owner && !owner.isDestroyed() ? { parent: owner } : {}),
    width: 520,
    height: 760,
    title: t('githubWeb.signInTitle'),
    show: false,
    webPreferences: { session: githubWebSession(), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: true }
  })
  attachContextMenu(window, window.webContents, true)
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void window.webContents.loadURL(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('https://')) event.preventDefault()
  })
  const done = new Promise<GitHubWebStatus>((resolve) => {
    const check = async (url: string): Promise<void> => {
      if (signInPage(url) || !url.startsWith(GITHUB)) return
      const status = await githubWebStatus()
      if (status.signedIn && !window.isDestroyed()) window.close()
    }
    window.webContents.on('did-navigate', (_event, url) => { void check(url).catch(() => undefined) })
    window.once('closed', () => {
      signingIn = null
      persistGitHubWeb()
      void githubWebStatus().then(resolve, () => resolve({ signedIn: false, login: null }))
    })
  })
  window.once('ready-to-show', () => window.show())
  void window.loadURL(`${GITHUB}/login`).catch((error: unknown) => console.warn('Cannot open the GitHub sign-in', error))
  signingIn = { window, done }
  return done
}

/** Forget the GitHub sign-in, and everything else those pages kept. */
export async function signOutOfGitHubWeb(): Promise<GitHubWebStatus> {
  const github = githubWebSession()
  await github.clearStorageData()
  await github.clearCache()
  persistGitHubWeb()
  return githubWebStatus()
}
