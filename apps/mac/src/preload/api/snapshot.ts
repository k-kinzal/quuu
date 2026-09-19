import { z } from 'zod'
import { AgentGroupSchema, AgentSchema } from './agents.js'
import { TaskRuleSchema } from './automation.js'
import { RunSchema, SchedulerStatusSchema } from './execution.js'
import { ProjectSchema } from './projects.js'
import { TaskSchema } from './tasks.js'

// ---------------------------------------------------------------------------
// Snapshot (what the renderer mirrors)
// ---------------------------------------------------------------------------
export const AppSnapshotSchema = z.object({
  /** main assembles resume commands; the screen only receives candidate names. */
  resumeCommands: z.record(z.string(), z.union([z.string(), z.null()])).optional(),
  externalAgentNames: z.record(z.string(), z.string()).optional(),
  projects: ProjectSchema.array(),
  tasks: TaskSchema.array(),
  /** Automation rule definitions. Used by the project settings screen and to show where generated tasks came from. */
  rules: TaskRuleSchema.array(),
  agents: AgentSchema.array(),
  groups: AgentGroupSchema.array(),
  /** Active Runs plus each task's latest Run. Not the full set. */
  runs: RunSchema.array(),
  scheduler: SchedulerStatusSchema
})
export type AppSnapshot = z.infer<typeof AppSnapshotSchema>

export const ToastPayloadSchema = z.object({
  id: z.string(),
  level: z.union([z.literal('info'), z.literal('warn'), z.literal('error'), z.literal('success')]),
  message: z.string(),
  detail: z.string().optional(),
  /** Task to open on click. */
  taskId: z.string().optional()
})
export type ToastPayload = z.infer<typeof ToastPayloadSchema>

export const MobileSyncConflictSchema = z.object({
  intentId: z.string(),
  device: z.string(),
  seq: z.number(),
  taskId: z.string(),
  at: z.string(),
  outcome: z.union([z.literal('applied'), z.literal('skipped'), z.literal('deferred'), z.literal('conflict')]),
  reason: z.string()
})
export type MobileSyncConflict = z.infer<typeof MobileSyncConflictSchema>

/**
 * State of sync with the iPhone app. Shown on the settings surface.
 *
 * **Carries only values that change what a person does.** Showing version
 * numbers or export counts gives the reader nothing to act on. What matters is
 * two things: "when were we last in sync" and "did anything fail to apply".
 */
export const MobileSyncStatusSchema = z.object({
  enabled: z.boolean(),
  /** Whether the location is reachable (false when iCloud Drive is disabled). */
  reachable: z.boolean(),
  lastExportAt: z.string(),
  lastImportAt: z.string(),
  /** Operations that were not applied (crossed in transit). The part handed back to the human. */
  conflicts: MobileSyncConflictSchema.array(),
  /** Most recent failure. Empty means all is well. */
  error: z.string()
})
export type MobileSyncStatus = z.infer<typeof MobileSyncStatusSchema>
