import type { RunTargetKind } from '../agents/types.js'
import type { RecordSource } from '../tasks/status.js'

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface Project {
  id: string
  name: string
  /** Lower comes first. */
  priority: number
  targetKind: RunTargetKind
  targetId: string | null
  /** Concurrency limit within one project. */
  maxConcurrent: number
  enabled: boolean
  /**
   * When it was deleted. null means it is alive (**a soft delete**).
   *
   * The row stays so import can tell "this one was deleted".
   * A hard delete takes the already-imported markers (`runs.external_key`) with it, so the same
   * session logs get picked up as un-imported and the deleted project comes back.
   */
  deletedAt: string | null
  /**
   * Only import sessions that started after this time.
   *
   * It is stamped on deletion and **not cleared on revival**. That is the line: a new run after
   * the deletion brings the project back, but the history from before it does not come with it.
   */
  importSince: string | null
  source: RecordSource
  sortOrder: number
  createdAt: string
  updatedAt: string

  /** Absolute path. It becomes the agent's cwd. */
  path: string

  color: string

  /** How the commit identity is decided. */
  commitIdentityMode: CommitIdentityMode

  /** The identity used only when `commitIdentityMode` is `custom`. */
  commitIdentity: CommitIdentity

  /**
   * The IDE / editor that opens this project (absolute path to a `.app`).
   * Empty follows the app settings. The IDE differs by language, so the project decides.
   */
  editorApp: string

  /**
   * Whether this project's tasks get a change report.
   *
   * Only consulted while reports are on app-wide; this is the "not for this one" switch, not a
   * second way to turn the feature on. It starts on, so enabling the feature does not then ask
   * for the same answer once per project.
   */
  reportEnabled: boolean
}


import type { CommitIdentity, CommitIdentityMode } from '../settings/identity.js'

/**
 * The values accepted on create and update.
 * The deletion marks (`deletedAt` / `importSince`) are not values a human edits, so they are left out
 * (only `repo.deleteProject` and `repo.reviveProject` write them).
 */
export type ProjectInput = Omit<
  Project,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'source'
  | 'deletedAt'
  | 'importSince'
  | 'commitIdentityMode'
  | 'commitIdentity'
  | 'editorApp'
  | 'reportEnabled'
> & {
  source?: RecordSource
  commitIdentityMode?: CommitIdentityMode
  commitIdentity?: CommitIdentity
  editorApp?: string
  reportEnabled?: boolean
}
