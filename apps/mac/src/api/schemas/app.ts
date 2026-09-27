import { z } from 'zod'

/**
 * Where the automatic updater is. `local` is a build that never updates itself (a checkout's
 * `npm run dist`, a development launch); the rest are the updater's own states.
 */
export const UpdateStateSchema = z.enum(['local', 'starting', 'unsigned', 'idle', 'checking', 'downloading', 'ready'])
export type UpdateState = z.infer<typeof UpdateStateSchema>

/** What the app menu and Help menu know about the running Quuu, for callers without a window. */
export const AppInfoSchema = z.object({
  version: z.string(),
  /** Where the database, run logs, reports and worktrees live. */
  dataDirectory: z.string(),
  updates: UpdateStateSchema
})
export type AppInfo = z.infer<typeof AppInfoSchema>
