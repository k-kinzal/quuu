import { z } from 'zod'

export const HookEventSchema = z.enum(['created', 'queued', 'held', 'started', 'stopped', 'review', 'failed', 'beforeComplete', 'completed', 'reopened', 'archived', 'restored', 'deleted'])
export type HookEvent = z.infer<typeof HookEventSchema>
export const TaskHookSchema = z.object({
  id: z.string().min(1).max(200).regex(/^(?!system:)/),
  name: z.string().optional(), enabled: z.boolean().optional(), events: HookEventSchema.array().optional(),
  kind: z.enum(['agent', 'command']).optional(), targetKind: z.enum(['agent', 'group']).optional(),
  targetId: z.string().optional(), prompt: z.string().optional(), command: z.string().optional(),
  timeoutSeconds: z.number().int().min(1).max(86400).optional()
})
export type TaskHook = z.infer<typeof TaskHookSchema>
export const HookRunSchema = z.object({
  id: z.string(), taskId: z.string(), taskTitle: z.string(), projectId: z.string(), hookId: z.string(),
  name: z.string(), event: HookEventSchema, kind: z.enum(['agent', 'command']),
  status: z.enum(['queued', 'starting', 'running', 'succeeded', 'failed', 'canceled']),
  cwd: z.string(), input: z.string(), agentId: z.string().nullable(),
  createdAt: z.string(), startedAt: z.string().nullable(), endedAt: z.string().nullable(),
  exitCode: z.number().nullable(), error: z.string(), logPath: z.string()
})
export type HookRun = z.infer<typeof HookRunSchema>
