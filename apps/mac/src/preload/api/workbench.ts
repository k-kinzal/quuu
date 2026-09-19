import { z } from 'zod'


/** Renderer CSS px and BrowserWindow DIP share the same coordinate system, so pass through to main as-is. */
export const PullRequestViewBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative()
})
export type PullRequestViewBounds = z.infer<typeof PullRequestViewBoundsSchema>

export const PullRequestViewRequestSchema = z.object({
  /** Tab-specific ID, so re-showing the same PR carries over the WebContents and scroll position. */
  id: z.string(),
  url: z.string(),
  bounds: PullRequestViewBoundsSchema
})
export type PullRequestViewRequest = z.infer<typeof PullRequestViewRequestSchema>

export const TerminalSessionSchema = z.object({
  id: z.string(),
  cwd: z.string(),
  shell: z.string(),
  columns: z.number(),
  rows: z.number()
})
export type TerminalSession = z.infer<typeof TerminalSessionSchema>

export const TerminalEventSchema = z.union([z.object({
  sessionId: z.string(),
  type: z.literal('output'),
  data: z.string()
}), z.object({
  sessionId: z.string(),
  type: z.literal('exit'),
  exitCode: z.union([z.number(), z.null()])
})])
export type TerminalEvent = z.infer<typeof TerminalEventSchema>
