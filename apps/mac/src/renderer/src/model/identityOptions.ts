// ---------------------------------------------------------------------------
// Commit identity
// ---------------------------------------------------------------------------

/**
 * The commit identity handed to agents. Points at a GitHub App's bot account.
 *
 * GitHub **ties commits to accounts by email address**. Written as
 * `<id>+<slug>[bot]@users.noreply.github.com`, the commit is treated as written
 * by the App's bot and never mixes with human work. The display name
 * (`<slug>[bot]`) does not affect the tie, so it is assembled from the slug
 * (letting it be freely chosen would drift the name in history away from the
 * actual account).
 */
import type { CommitIdentity } from '../../../preload/api/settings.js'
export type { CommitIdentity, CommitIdentityMode } from '../../../preload/api/settings.js'

export const EMPTY_COMMIT_IDENTITY: CommitIdentity = {
  appSlug: '',
  botUserId: '',
  appId: '',
  setupVersion: 0
}

/**
 * How a project decides its identity.
 *   inherit … follow the app settings (default)
 *   off     … pass no identity for this project
 *   custom  … this project alone uses a different App's identity
 */
import type { CommitIdentityMode } from '../../../preload/api/settings.js'

export const COMMIT_IDENTITY_MODES: CommitIdentityMode[] = ['inherit', 'off', 'custom']
