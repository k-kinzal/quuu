import { z } from 'zod'

export const AssistantSettingsSchema = z.object({
  enabled: z.boolean(), intervalHours: z.number().int().min(1).max(168), confidenceThreshold: z.number().int().min(70).max(100)
})
export const AssistantProposalSchema = z.object({
  taskId: z.string(), projectId: z.string(), title: z.string(), prompt: z.string(), reason: z.string(), confidence: z.number(),
  // Older hosts omit feedback; never infer it from task acceptance in the renderer.
  reaction: z.enum(['approve', 'dismiss']).nullable().optional(),
  status: z.enum(['pending', 'accepted', 'dismissed']), createdAt: z.string(), respondedAt: z.string().nullable(), executionTaskId: z.string().nullable()
})
export const AssistantThreadSchema = z.object({
  taskId: z.string(), preview: z.string(), replies: z.number(), revision: z.string(), unread: z.boolean()
})
export const AssistantStateSchema = z.object({
  settings: AssistantSettingsSchema, activity: z.enum(['off', 'waiting', 'checking', 'awaiting-response']),
  lastCheckAt: z.string().nullable(), nextCheckAt: z.string().nullable(), error: z.string().nullable(), unread: z.boolean(),
  threads: AssistantThreadSchema.array(), proposals: AssistantProposalSchema.array()
})
export const AssistantMemorySchema = z.object({ content: z.string(), revision: z.string(), bytes: z.number(), maxBytes: z.number() })
export type AssistantState = z.infer<typeof AssistantStateSchema>
export type AssistantProposal = z.infer<typeof AssistantProposalSchema>
export type AssistantSettings = z.infer<typeof AssistantSettingsSchema>
