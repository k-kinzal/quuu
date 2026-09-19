/** The renderer's CSS px and BrowserWindow's DIP share one coordinate system, so they go to main as-is. */
export interface PullRequestViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface PullRequestViewRequest {
  /** A tab-specific ID, so reopening the same PR carries over the WebContents and the scroll position. */
  id: string
  url: string
  bounds: PullRequestViewBounds
}

export interface TerminalSession {
  id: string
  cwd: string
  shell: string
  columns: number
  rows: number
}

export type TerminalEvent =
  | { sessionId: string; type: 'output'; data: string }
  | { sessionId: string; type: 'exit'; exitCode: number | null }

export interface TerminalActionResult { ok: boolean; reason?: string }
