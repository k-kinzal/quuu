// ---------------------------------------------------------------------------
// Sessions (the chat view)
// ---------------------------------------------------------------------------

export type SessionRole = 'user' | 'assistant' | 'system'

/**
 * Where an image in a conversation lives.
 *
 * The bytes (base64) are not carried here. They reach tens of MB per session, so shipping them
 * all to the renderer the moment it opens freezes the screen.
 * They are fetched with `session.image(id)` when displayed.
 */
export interface SessionImage {
  /** The key for pulling the bytes within the session. */
  id: string
  mediaType: string
  /** Size of the original data in bytes. */
  byteSize: number
  /** Pixel dimensions. null when unreadable. Held so space can be reserved before loading. */
  width: number | null
  height: number | null
}

export interface PlanStep { text: string | null; status: string }

export interface ToolCall {
  /** The log format is already parsed in main. The UI just shows the progress. */
  plan?: PlanStep[]
  id: string
  name: string
  input: unknown
  /**
   * "What it acts on", said as one value (a command, a path, a query). null when unavailable.
   *
   * CLIs whose input arrives as named values (Claude's `{file_path}`) let the display side pull it
   * by key, but not all do. Codex writes its calls as **a JavaScript fragment**
   * (`tools.exec_command({cmd:"..."})`), and a diff names its target only inside the patch body.
   * Unpicking that in the display scatters per-CLI reading across the UI. **The parser unpicks it and puts it here.**
   */
  target: string | null
  /** The contents of the matching tool_result. null until it arrives. */
  result: string | null
  isError: boolean
  /** When the result was an image (reading a screenshot, say). */
  images: SessionImage[]
}

export type SessionBlock =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool'; tool: ToolCall }
  | { kind: 'image'; image: SessionImage }

/**
 * One record of the structured session log.
 *
 * Every CLI keeps its conversation in its own shape; the adapter's parser turns that shape into
 * this one, and everything Quuu derives from a session - the pages on screen, the commits and
 * Pull Requests filed against the task, where the agent worked - reads this record and never
 * the provider's file. Whatever a rule needs has to arrive here, or the rule ends up reading the
 * raw log with a regular expression of its own (which is how the working directory was found
 * until it stopped matching what Codex writes).
 */
export interface SessionMessage {
  /** The log line's uuid. A generated stable key when there is none. */
  id: string
  role: SessionRole
  /** Does it come from a sub-agent (sidechain)? */
  isSidechain: boolean
  timestamp: string | null
  blocks: SessionBlock[]
  model: string | null
  /**
   * The directory the CLI recorded this entry against, absolute.
   *
   * Claude Code stamps it on every line; Codex names it once per turn and again on each command
   * it runs (`workdir`); Copilot says it when the session starts. Absent where the CLI keeps
   * none, and on pages materialized before it was read.
   */
  cwd?: string
}

export interface SessionSnapshot {
  first?: number
  last?: number
  generation?: string
  hasNewer?: boolean
  indexing?: boolean
  sessionId: string
  /** Absolute path of the log file. Returned even when it does not exist (to show "not created yet"). */
  logPath: string | null
  exists: boolean
  title: string | null
  messages: SessionMessage[]
  /** Are there more lines readable towards the start? */
  hasMore: boolean
  /** Total messages loaded so far (the whole count, before the head is trimmed). */
  totalMessages: number
  /** When retention removed this conversation (`AppSettings.retentionDays`). Absent while it is kept. */
  prunedAt?: string
}
