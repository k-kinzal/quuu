import { z } from 'zod'
import { RecordSourceSchema } from './tasks.js'

export const LogAdapterSchema = z.union([z.literal('claude'), z.literal('codex'), z.literal('cursor'), z.literal('grok'), z.literal('copilot'), z.literal('agy'), z.literal('opencode'), z.literal('stdout')])
export type LogAdapter = z.infer<typeof LogAdapterSchema>

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** How many runs in parallel. */
  concurrency: z.number(),
  /** Agent ID to fall back to on Limit / error. */
  fallbackAgentId: z.union([z.string(), z.null()]),
  /** Cooldown seconds after a Limit is detected. */
  cooldownSeconds: z.number(),
  /** Run timeout in seconds. 0 means unlimited. */
  timeoutSeconds: z.number(),
  enabled: z.boolean(),
  /**
   * Whether the user defined it, or Quuu created and maintains it behind the
   * scenes. `imported` is a definition import creates for its own purposes —
   * not the user's property.
   */
  source: RecordSourceSchema,
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Command to run. Example: "claude" */
  command: z.string(),
  /** Argument template. Placeholders like {{prompt}} are expanded. */
  argsTemplate: z.string().array(),
  /** Argument template for continued runs (follow-up messages). Empty means no continuation. */
  resumeArgsTemplate: z.string().array(),
  env: z.record(z.string(), z.string()),
  /** Output matching any of these regexes counts as a Limit. Empty means `DEFAULT_LIMIT_PATTERNS`. */
  limitPatterns: z.string().array(),
  logAdapter: LogAdapterSchema
})
export type Agent = z.infer<typeof AgentSchema>

export const GroupStrategySchema = z.union([z.literal('priority'), z.literal('round-robin'), z.literal('least-busy')])
export type GroupStrategy = z.infer<typeof GroupStrategySchema>

export const AgentGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  strategy: GroupStrategySchema,
  memberIds: z.string().array(),
  /** Whether a project added without naming a run target is assigned to this group. One group at most. */
  isDefault: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type AgentGroup = z.infer<typeof AgentGroupSchema>

/** Leaving the default mark out means "not the default" on create and "unchanged" on update. */
export const AgentGroupInputSchema = AgentGroupSchema.omit({ id: true, createdAt: true, updatedAt: true, isDefault: true }).extend({
  isDefault: z.boolean().optional()
})
export type AgentGroupInput = z.infer<typeof AgentGroupInputSchema>

export const AgentCooldownSchema = z.object({
  agentId: z.string(),
  until: z.string(),
  reason: z.string()
})
export type AgentCooldown = z.infer<typeof AgentCooldownSchema>

export const AgentInputSchema = AgentSchema.omit({ id: true, createdAt: true, updatedAt: true, source: true }).extend({
  concurrency: z.number().int().positive(),
  cooldownSeconds: z.number().int().nonnegative(),
  timeoutSeconds: z.number().int().nonnegative(),
  source: RecordSourceSchema.optional()
})
export type AgentInput = z.infer<typeof AgentInputSchema>
