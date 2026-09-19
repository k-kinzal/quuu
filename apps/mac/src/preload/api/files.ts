import { z } from 'zod'

export const PromptFileSchema = z.object({
  name: z.string(),
  data: z.base64()
}).strict()

/** DOM Files cannot cross IPC; only this local preload bridge resolves their backing paths. */
export interface QuuuFiles {
  getPathForFile(file: File): string
}
