import { z } from 'zod'
import { SessionMessageSchema } from './session.js'
import { TaskSchema, TaskStatusSchema } from './tasks.js'

export const TaskListInputSchema = z.object({
  projectId: z.string().optional(),
  status: TaskStatusSchema.optional(),
  archived: z.enum(['exclude', 'include', 'only']).optional(),
  after: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(200).optional(),
}).strict()
export const TaskPageSchema = z.object({ tasks: TaskSchema.array(), next: z.number().nullable() })
export const LogPageInputSchema = z.object({
  runId: z.string(),
  offset: z.number().int().nonnegative().optional(),
  generation: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  search: z.string().max(1000).optional(),
}).strict()
export const LogPageSchema = z.object({
  runId: z.string(), sessionId: z.string(), exists: z.boolean(), generation: z.string(),
  messages: SessionMessageSchema.array(), next: z.number().nullable(), total: z.number(),
})
