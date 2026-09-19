import { z } from 'zod'
import { RunTargetKindSchema } from './agents.js'
import { CommitIdentityModeSchema, CommitIdentitySchema } from './settings.js'
import { RecordSourceSchema } from './tasks.js'

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Smaller wins. */
  priority: z.number(),
  targetKind: RunTargetKindSchema,
  targetId: z.union([z.string(), z.null()]),
  /** Concurrency cap within the same project. */
  maxConcurrent: z.number(),
  enabled: z.boolean(),
  /**
   * When it was deleted. Null means alive (**soft delete**).
   *
   * The row is kept so import can tell "this place was deleted". With a hard
   * delete, the imported markers (`runs.external_key`) would vanish with it,
   * the same session logs would be picked up as not-yet-imported again, and
   * what was deleted would come back.
   */
  deletedAt: z.union([z.string(), z.null()]),
  /**
   * Import only sessions that started after this time.
   *
   * A marker stamped at deletion, and **not cleared on revival**. If a new run
   * arrives after deletion the project comes back, but the pre-deletion history
   * does not — this is what draws that line.
   */
  importSince: z.union([z.string(), z.null()]),
  source: RecordSourceSchema,
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Absolute path. Becomes the agent's cwd. */
  path: z.string(),
  color: z.string(),
  /** How the commit identity is decided. */
  commitIdentityMode: CommitIdentityModeSchema,
  /** Identity used only when `commitIdentityMode` is `custom`. */
  commitIdentity: CommitIdentitySchema,
  /**
   * IDE / editor that opens this project (absolute path of the `.app`).
   * Empty means follow the app settings. IDEs differ by language, so the
   * project decides.
   */
  editorApp: z.string(),
  /**
   * Whether this project's tasks get a change report.
   * Only consulted while reports are on app-wide; this is the "not for this one" switch.
   */
  reportEnabled: z.boolean()
})
export type Project = z.infer<typeof ProjectSchema>

/**
 * Values accepted for create / update.
 * The deletion markers (`deletedAt` / `importSince`) are not values a person
 * edits, so they are excluded (only `repo.deleteProject` and
 * `repo.reviveProject` write them).
 */
export const ProjectInputSchema = ProjectSchema.omit({ id: true, createdAt: true, updatedAt: true, source: true, deletedAt: true, importSince: true, commitIdentityMode: true, commitIdentity: true, editorApp: true, reportEnabled: true }).extend({
  priority: z.number().int().nonnegative(),
  maxConcurrent: z.number().int().positive(),
  source: RecordSourceSchema.optional(),
  commitIdentityMode: CommitIdentityModeSchema.optional(),
  commitIdentity: CommitIdentitySchema.optional(),
  editorApp: z.string().optional(),
  reportEnabled: z.boolean().optional()
})
export type ProjectInput = z.infer<typeof ProjectInputSchema>
