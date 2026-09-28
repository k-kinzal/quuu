import { z } from 'zod'
import { SessionSnapshotSchema } from './session.js'

export const AuxiliaryPageInputSchema = z.object({
  id: z.string(),
  before: z.number().int().nonnegative().optional(),
  after: z.number().int().nonnegative().optional(),
  generation: z.string().optional()
})
export type AuxiliaryPageInput = z.infer<typeof AuxiliaryPageInputSchema>

export const AuxiliaryPageSchema = SessionSnapshotSchema.extend({
  cwd: z.string(),
  input: z.string(),
  structured: z.boolean()
})
export type AuxiliaryPage = z.infer<typeof AuxiliaryPageSchema>

export const AuxiliaryImageInputSchema = z.object({ id: z.string(), imageId: z.string() })
