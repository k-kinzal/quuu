// ---------------------------------------------------------------------------
// Commit identity
// ---------------------------------------------------------------------------

/**
 * The commit identity passed to agents. Points at a GitHub App's bot account.
 *
 * GitHub **links commits to accounts by email address**. Written as
 * `<id>+<slug>[bot]@users.noreply.github.com`, the commit is treated as authored
 * by the App's bot and never mixes with the human's work.
 * The display name (`<slug>[bot]`) has no effect on linking, so build it from
 * the slug (letting it be freely chosen drifts the name in history away from
 * the actual account).
 */
export interface CommitIdentity {
  /** The GitHub App's slug. The `<slug>` in `https://github.com/apps/<slug>`. */
  appSlug: string
  /** The bot user's numeric ID. Assigned to the `<slug>[bot]` account. */
  botUserId: string
  /** Numeric ID of the GitHub App issuing installation tokens. Empty for old "identity-only" Apps. */
  appId?: string
  /** Version of the App's permissions and storage format. If old, settings replaces it with the latest App. */
  setupVersion?: number
}

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
 *   custom  … use a different App's identity for this project only
 */
export type CommitIdentityMode = 'inherit' | 'off' | 'custom'

export const COMMIT_IDENTITY_MODES: CommitIdentityMode[] = ['inherit', 'off', 'custom']

/** Query for a GitHub App's bot user ID. */
export type BotUserResult = { ok: true; botUserId: string } | { ok: false; reason: string }


/**
 * The result of creating a GitHub App in the browser.
 *
 * The App ID and setup version come back with it. Without telling an old App apart from a new one,
 * gh's identity would be handed to an App that cannot authenticate, so the creation result is
 * passed around as one unit.
 */
export type CreateAppResult =
  | { ok: true; identity: CommitIdentity }
  /** `canceled` is when a human stopped it themselves. Do not restate that to them as a failure. */
  | { ok: false; reason: string; canceled?: boolean }
