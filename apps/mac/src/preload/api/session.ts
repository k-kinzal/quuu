import { z } from 'zod'


// ---------------------------------------------------------------------------
// Sessions (the chat view)
// ---------------------------------------------------------------------------
export const SessionRoleSchema = z.union([z.literal('user'), z.literal('assistant'), z.literal('system')])
export type SessionRole = z.infer<typeof SessionRoleSchema>

/**
 * Where an image in the conversation lives.
 *
 * The payload (base64) is not carried here. One session can reach tens of MB,
 * and hauling it all to the renderer the moment it opens freezes the screen.
 * The viewer fetches with `session.image(id)` at display time.
 */
export const SessionImageSchema = z.object({
  /** Key for fetching the payload within the session. */
  id: z.string(),
  mediaType: z.string(),
  /** Byte size of the original data. */
  byteSize: z.number(),
  /** Pixel dimensions. Null when unreadable. Kept so space can be reserved before loading. */
  width: z.union([z.number(), z.null()]),
  height: z.union([z.number(), z.null()])
})
export type SessionImage = z.infer<typeof SessionImageSchema>

export const PlanStepSchema = z.object({
  text: z.union([z.string(), z.null()]),
  status: z.string()
})
export type PlanStep = z.infer<typeof PlanStepSchema>

export const ToolCallSchema = z.object({
  /** The log format is already parsed in main. The screen displays progress. */
  plan: PlanStepSchema.array().optional(),
  id: z.string(),
  name: z.string(),
  input: z.unknown(),
  /**
   * "What it acts on" as a single value (command, path, query). Null when unavailable.
   *
   * CLIs whose input arrives as named values (Claude's `{file_path}`) let the
   * viewer pick it out by key, but not all CLIs do. Codex writes calls as a
   * **JavaScript fragment** (`tools.exec_command({cmd:"…"})`), and its diffs
   * name their target only inside the patch body. Solving this in the viewer
   * would scatter per-CLI reading rules across the screen. **The parser solves
   * it and puts the answer here.**
   */
  target: z.union([z.string(), z.null()]),
  /** Content of the matching tool_result. Null until it arrives. */
  result: z.union([z.string(), z.null()]),
  isError: z.boolean(),
  /** When the result was an image (reading a screenshot, etc.). */
  images: SessionImageSchema.array()
})
export type ToolCall = z.infer<typeof ToolCallSchema>

export const SessionBlockSchema = z.union([z.object({
  kind: z.literal('text'),
  text: z.string()
}), z.object({
  kind: z.literal('thinking'),
  text: z.string()
}), z.object({
  kind: z.literal('tool'),
  tool: ToolCallSchema
}), z.object({
  kind: z.literal('image'),
  image: SessionImageSchema
})])
export type SessionBlock = z.infer<typeof SessionBlockSchema>

export const SessionMessageSchema = z.object({
  /** uuid of the log line. When absent, a generated stable key. */
  id: z.string(),
  role: SessionRoleSchema,
  /** Whether it came from a subagent (sidechain). */
  isSidechain: z.boolean(),
  timestamp: z.union([z.string(), z.null()]),
  blocks: SessionBlockSchema.array(),
  model: z.union([z.string(), z.null()])
})
export type SessionMessage = z.infer<typeof SessionMessageSchema>

export const SessionSnapshotSchema = z.object({
  first: z.number().optional(),
  last: z.number().optional(),
  generation: z.string().optional(),
  hasNewer: z.boolean().optional(),
  indexing: z.boolean().optional(),
  sessionId: z.string(),
  /** Absolute path of the log file. Returned even when it does not exist (to show "not yet created"). */
  logPath: z.union([z.string(), z.null()]),
  exists: z.boolean(),
  title: z.union([z.string(), z.null()]),
  messages: SessionMessageSchema.array(),
  /** Whether more lines can still be read toward the beginning. */
  hasMore: z.boolean(),
  /** Total messages loaded so far (the full count before head truncation). */
  totalMessages: z.number()
})
export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>
