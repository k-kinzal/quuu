import type { RecordSource, RunStatus } from '../tasks/status.js'

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export type RunErrorKind =
  | 'limit'
  | 'auth'
  | 'timeout'
  | 'spawn'
  | 'nonzero-exit'
  | 'orphaned'
  | 'canceled'
  | 'no-agent'

/** What this run was launched for. */
export type RunKind = 'initial' | 'followup'

export interface Run {
  id: string
  taskId: string
  agentId: string
  /** The group ID, when it was resolved through a group. */
  resolvedFromGroupId: string | null
  sessionId: string
  kind: RunKind
  status: RunStatus
  attempt: number
  fallbackFromRunId: string | null
  /** For a follow-up run, the prompt that was sent. */
  promptPreview: string
  errorKind: RunErrorKind | null
  errorMessage: string
  source: RecordSource
  externalKey: string | null
  startedAt: string
  endedAt: string | null

  pid: number | null

  cwd: string

  command: string

  args: string[]

  exitCode: number | null

  sessionLogPath: string | null

  stdoutLogPath: string
}
