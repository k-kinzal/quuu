import { z } from 'zod'
import { RecordSourceSchema, RunStatusSchema } from './tasks.js'

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------
export const RunErrorKindSchema = z.union([z.literal('limit'), z.literal('auth'), z.literal('timeout'), z.literal('spawn'), z.literal('nonzero-exit'), z.literal('orphaned'), z.literal('canceled'), z.literal('no-agent')])
export type RunErrorKind = z.infer<typeof RunErrorKindSchema>

/** What this Run was launched for. */
export const RunKindSchema = z.union([z.literal('initial'), z.literal('followup')])
export type RunKind = z.infer<typeof RunKindSchema>

export const RunSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  agentId: z.string(),
  /** When resolved via a group, that group's ID. */
  resolvedFromGroupId: z.union([z.string(), z.null()]),
  sessionId: z.string(),
  kind: RunKindSchema,
  status: RunStatusSchema,
  attempt: z.number(),
  fallbackFromRunId: z.union([z.string(), z.null()]),
  /** For a follow-up run, the prompt that was sent. */
  promptPreview: z.string(),
  errorKind: z.union([RunErrorKindSchema, z.null()]),
  errorMessage: z.string(),
  source: RecordSourceSchema,
  externalKey: z.union([z.string(), z.null()]),
  startedAt: z.string(),
  endedAt: z.union([z.string(), z.null()]),
  pid: z.union([z.number(), z.null()]),
  cwd: z.string(),
  command: z.string(),
  args: z.string().array(),
  exitCode: z.union([z.number(), z.null()]),
  sessionLogPath: z.union([z.string(), z.null()]),
  stdoutLogPath: z.string()
})
export type Run = z.infer<typeof RunSchema>

// ---------------------------------------------------------------------------
// Scheduler / operating status
// ---------------------------------------------------------------------------
export const AgentSlotStatusSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  concurrency: z.number(),
  active: z.number(),
  /** Number of slots reserved and unavailable to other tasks. */
  reserved: z.number(),
  cooldownUntil: z.union([z.string(), z.null()]),
  cooldownReason: z.string(),
  enabled: z.boolean()
})
export type AgentSlotStatus = z.infer<typeof AgentSlotStatusSchema>

/** A task keeping an execution slot (an unfinished P0 task). */
export const SlotHoldSchema = z.object({
  taskId: z.string(),
  taskTitle: z.string(),
  projectName: z.string(),
  /** Agent being kept open. Null if it has never run yet (only the project slot then). */
  agentName: z.union([z.string(), z.null()])
})
export type SlotHold = z.infer<typeof SlotHoldSchema>

export const SchedulerStatusSchema = z.object({
  running: z.boolean(),
  /** Total number of active Runs. */
  activeRuns: z.number(),
  /** Sum of all agents' parallelism (enabled ones only). */
  totalSlots: z.number(),
  queued: z.number(),
  review: z.number(),
  failed: z.number(),
  agents: AgentSlotStatusSchema.array(),
  /** Tasks currently holding slots. Empty in the normal case. */
  holds: SlotHoldSchema.array(),
  /** Recent scheduler-originated warnings. Empty in the normal case. */
  warnings: z.string().array(),
  lastTickAt: z.union([z.string(), z.null()])
})
export type SchedulerStatus = z.infer<typeof SchedulerStatusSchema>
