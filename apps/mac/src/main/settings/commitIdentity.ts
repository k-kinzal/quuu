/**
 * Building and resolving the commit identity (a GitHub App bot).
 *
 * main (env vars passed at run time) and renderer (the identity shown in settings)
 * must use **the same rules**. Write them in two places and the identity on screen
 * drifts from the identity actually recorded in history. Nobody notices the drift —
 * until someone reads the GitHub history later.
 */

import type { Project } from '../projects/types.js'
import type { CommitIdentity, CommitIdentityMode } from './identity.js'
import type { AppSettings } from './types.js'

/**
 * Version of the GitHub App permissions and the credentials Quuu keeps.
 *
 * When adding a permission, bump this together with the manifest. Existing App
 * permissions cannot be rewritten via the API, so the UI detects an old version
 * and routes through the same creation flow.
 */
// v1 saved an empty private key to the Keychain, so recreate the unrecoverable key.
export const GITHUB_APP_SETUP_VERSION = 2

/** Just the settings that affect the identity. Callable without building a full AppSettings. */
export type CommitIdentityDefaults = Pick<AppSettings, 'commitIdentityEnabled' | 'commitIdentity'>

/** Just the project fields that affect the identity. */
export type CommitIdentityHolder = Pick<Project, 'commitIdentityMode' | 'commitIdentity'>

/** The 4 vars git reads for identity. When "don't pass" is chosen, these get removed. */
export const COMMIT_ENV_KEYS = [
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL'
] as const

/**
 * Slug normalization.
 *
 * Some people paste `https://github.com/apps/my-app` into the field, others type
 * `my-app[bot]`. Both point at the same App, so collapse them to one form here.
 * Prevents a typing difference from turning into "the email is one character off
 * and the commit doesn't link".
 */
export function normalizeAppSlug(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/github\.com\/apps\//i, '')
    .replace(/\[bot\]$/i, '')
    .replace(/\/+$/, '')
    .trim()
}

/** The bot account's login name. Also used as the display name (`GIT_*_NAME`). */
export function botLogin(appSlug: string): string {
  return `${normalizeAppSlug(appSlug)}[bot]`
}

/** The bot account's noreply email. **GitHub links commits to accounts by this.** */
export function botEmail(identity: CommitIdentity): string {
  return `${identity.botUserId.trim()}+${botLogin(identity.appSlug)}@users.noreply.github.com`
}

/**
 * Filled in far enough to be usable as an identity.
 *
 * Letting a non-numeric ID through produces an address that only looks right,
 * leaving you with "I configured it but the commits belong to nobody".
 */
export function isCommitIdentityComplete(identity: CommitIdentity): boolean {
  return normalizeAppSlug(identity.appSlug).length > 0 && /^\d+$/.test(identity.botUserId.trim())
}

/** Even on an old version, can App auth keep working without falling back to the human's GitHub auth? */
export function hasGitHubAppAuthentication(identity: CommitIdentity): boolean {
  return normalizeAppSlug(identity.appSlug).length > 0 && /^\d+$/.test(identity.appId?.trim() ?? '')
}

/** A current-version App, usable not just for commits but also for gh / git auth. */
export function isGitHubAppCurrent(identity: CommitIdentity): boolean {
  return hasGitHubAppAuthentication(identity) && identity.setupVersion === GITHUB_APP_SETUP_VERSION
}

/** The App's GitHub page. Derived from the slug, so not stored. */
export function appPageUrl(appSlug: string): string {
  return `https://github.com/apps/${normalizeAppSlug(appSlug)}`
}

/** The one-liner shown on screen (`name <email>`). Empty if not filled in. */
export function commitIdentityLabel(identity: CommitIdentity): string {
  if (!isCommitIdentityComplete(identity)) return ''
  return `${botLogin(identity.appSlug)} <${botEmail(identity)}>`
}

/**
 * The identity actually used for that project. null when nothing is passed.
 *
 * `custom` does not require the app-wide toggle. **Assigning an App to a project
 * is itself the enablement** — requiring the global setting on top would make
 * "bot identity for just this one repository" a double operation.
 */
export function resolveCommitIdentity(
  defaults: CommitIdentityDefaults,
  project: CommitIdentityHolder
): CommitIdentity | null {
  const mode: CommitIdentityMode = project.commitIdentityMode
  if (mode === 'off') return null
  if (mode === 'custom') {
    return isCommitIdentityComplete(project.commitIdentity) ? project.commitIdentity : null
  }
  if (!defaults.commitIdentityEnabled) return null
  return isCommitIdentityComplete(defaults.commitIdentity) ? defaults.commitIdentity : null
}

/**
 * Env vars mixed into the run.
 *
 * For a project that chose "don't pass", set `undefined` to **remove** them.
 * If the shell that launched Quuu still carries an identity, the identity you
 * thought you removed flows straight into the child (possible here, since Quuu
 * restarts itself as a normal way of working).
 */
export function commitIdentityEnv(
  defaults: CommitIdentityDefaults,
  project: CommitIdentityHolder
): Record<string, string | undefined> {
  const identity = resolveCommitIdentity(defaults, project)
  if (!identity) {
    if (project.commitIdentityMode !== 'off') return {}
    return Object.fromEntries(COMMIT_ENV_KEYS.map((k) => [k, undefined]))
  }
  const name = botLogin(identity.appSlug)
  const email = botEmail(identity)
  return {
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email
  }
}
