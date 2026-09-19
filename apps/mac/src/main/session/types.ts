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

export interface SessionMessage {
  /** The log line's uuid. A generated stable key when there is none. */
  id: string
  role: SessionRole
  /** Does it come from a sub-agent (sidechain)? */
  isSidechain: boolean
  timestamp: string | null
  blocks: SessionBlock[]
  model: string | null
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
}
