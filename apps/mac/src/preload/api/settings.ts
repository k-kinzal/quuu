import { z } from 'zod'
import { RunTargetKindSchema } from './agents.js'


// ---------------------------------------------------------------------------
// Commit identity
// ---------------------------------------------------------------------------

/**
 * Commit identity handed to agents. Points at a GitHub App's bot account.
 *
 * GitHub **links commits to accounts by email address**. Written as
 * `<id>+<slug>[bot]@users.noreply.github.com`, the commit is attributed to the
 * App's bot and never mixes with the human's work. The display name
 * (`<slug>[bot]`) plays no part in the linking, so it is assembled from the
 * slug (letting it be named freely would let the name in history drift from
 * the actual account).
 */
export const CommitIdentitySchema = z.object({
  /** The GitHub App's slug. The `<slug>` in `https://github.com/apps/<slug>`. */
  appSlug: z.string(),
  /** Numeric ID of the bot user. Assigned to the `<slug>[bot]` account. */
  botUserId: z.string(),
  /** Numeric ID of the GitHub App that issues installation tokens. Empty for old "identity-only" Apps. */
  appId: z.string().optional(),
  /** Version of the App's permissions / storage format. If stale, Settings replaces it with the latest App. */
  setupVersion: z.number().int().nonnegative().optional()
})
export type CommitIdentity = z.infer<typeof CommitIdentitySchema>

/**
 * How a project decides its identity.
 *   inherit … follow the app settings (default)
 *   off     … pass no identity for this project
 *   custom  … use a different App's identity for this project only
 */
export const CommitIdentityModeSchema = z.union([z.literal('inherit'), z.literal('off'), z.literal('custom')])
export type CommitIdentityMode = z.infer<typeof CommitIdentityModeSchema>

export const AppSettingsSchema = z.object({
  /** Whether to start the scheduler automatically on app launch. */
  autoStartScheduler: z.boolean(),
  /** Whether to keep running in the background after the window is closed. */
  keepRunningInBackground: z.boolean(),
  /** Whether to notify when something reaches review. */
  notifyOnReview: z.boolean(),
  /** Whether to notify on failure. */
  notifyOnFailure: z.boolean(),
  /** Scheduler tick interval (milliseconds). */
  tickIntervalMs: z.number().int().positive(),
  /** Whether to import sessions from directly launched AI CLIs (IMPORTABLE_ADAPTERS). */
  importExternalSessions: z.boolean(),
  /** How many days of past logs to import. 0 means all time. */
  importHistoryDays: z.number().int().nonnegative(),
  /** Whether import auto-creates projects from unregistered working directories. */
  importCreateProjects: z.boolean(),
  /** Whether to hand agents the GitHub App identity. Can be turned off per project. */
  commitIdentityEnabled: z.boolean(),
  /** The default identity. Differs only when a project chooses `custom`. */
  commitIdentity: CommitIdentitySchema,
  /**
   * IDE / editor that opens tasks (absolute path of the `.app`). Empty means undecided.
   * A project can specify a different one (`Project.editorApp`).
   */
  editorApp: z.string(),
  /**
   * Whether to talk to the iPhone app via iCloud Drive.
   *
   * **On by default, with a fixed location** (`iCloud Drive/Quuu`).
   * Every setting we expose creates a "which place does it point at" step that
   * has to be matched on both Mac and iPhone, and a mismatch on either side
   * silently stops syncing. With a fixed location there is nothing to match.
   *
   * Kept for people who want it off, but never asked about by default.
   */
  mobileSyncEnabled: z.boolean(),
  /**
   * Whether a change report is written when a task reaches review.
   *
   * Off until a writer is named: the feature costs one agent run per review, which is not a
   * cost to start incurring on someone's behalf. A project can opt out (`Project.reportEnabled`).
   */
  reportEnabled: z.boolean(),
  /**
   * Whether the writer below is one agent or a group.
   *
   * A group says **"whoever can take it"**: the agents doing the work are busy, and a report is
   * the job to hand to whichever one is free.
   */
  reportTargetKind: RunTargetKindSchema,
  /** The agent or group that writes reports. Empty means undecided. */
  reportTargetId: z.string(),
  /** Added to the end of the instructions handed to that agent. */
  reportInstructions: z.string(),
  theme: z.union([z.literal('dark'), z.literal('light'), z.literal('system')])
})
export type AppSettings = z.infer<typeof AppSettingsSchema>

export const IdentityPreviewSchema = z.object({ slug: z.string(), login: z.string(), email: z.string(), complete: z.boolean(), current: z.boolean(), url: z.string(), resolved: CommitIdentitySchema.nullable() })
export type IdentityPreview = z.infer<typeof IdentityPreviewSchema>
