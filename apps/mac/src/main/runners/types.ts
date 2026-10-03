import type { LogAdapter } from '../agents/cliAdapter.js'
import type { Project } from '../projects/types.js'
import type { ReviewBaseline } from '../review/git.js'
import type { ReviewEvidence } from '../review/types.js'
import type { ReviewCommentInput, ReviewFileRequest } from '../review/types.js'
import type { ReportRequest } from '../report/prompt.js'

import type { RunnerAuthentication, RunnerLoginAgent } from './agentAuth.js'

/** `signedIn` is the Runner's own credential check; older workers omit it. */
export interface RunnerAgent { name: string; command: string; version: string; signedIn?: boolean; auth?: RunnerAuthentication }
export interface RemoteRunner {
  id: string
  name: string
  agents: RunnerAgent[]
  labels?: string[]
  capacity: number
  root: string
  lastSeen: string
  revoked: boolean
  tokenHash: string
}
export interface RunnerWorkspace {
  taskId: string
  runnerId: string
  repository: string
  subdirectory: string
  cwd: string
}
export interface RunnerConfig { enabled: boolean; port: number }
export interface GitCredential { token: string; expiresAt: number; repository: string; user: string }

/** Immutable instructions. Credentials travel separately and never enter the job journal. */
export interface RemoteJobSpec {
  id: string
  taskId: string
  projectId: string
  workspace: RunnerWorkspace
  action: 'agent' | 'command' | 'report' | 'snapshot' | 'file' | 'comment'
  command: string
  args: string[]
  env: Record<string, string | undefined>
  sessionId: string
  adapter: LogAdapter
  timeoutSeconds: number
  createWorkspace: boolean
  project: Project
  report?: { request: ReportRequest; template: string[] }
  review?: { baseline: ReviewBaseline | null; evidence: ReviewEvidence; windows: Array<{ from: string; to: string | null }>; recorded: string[] }
  file?: ReviewFileRequest
  comment?: ReviewCommentInput
}

export interface RemoteJob {
  id: string
  runnerId: string
  taskId: string
  status: 'queued' | 'running' | 'finished'
  spec: RemoteJobSpec
  cancelRequested: boolean
  logPath: string
  sessionPath: string | null
  logOffset: number
  sessionOffset: number
  result: RemoteResult | null
}
export interface RemoteResult {
  started?: boolean
  exitCode: number | null
  canceled: boolean
  timedOut: boolean
  error: string
  sessionId: string
  baseline?: ReviewBaseline
  value?: unknown
  page?: string
}

export interface RunnerUpdate {
  id: string
  logOffset: number
  log: string
  sessionOffset: number
  session: string
  sessionId: string
  result?: RemoteResult
}
export interface RunnerPoll {
  version: 1
  labels?: string[]
  agents: RunnerAgent[]
  updates: RunnerUpdate[]
  /** Runner-owned logins written since the previous poll. */
  installed?: string[]
}
/** A login minted for exactly one Runner; Quuu forgets it once the Runner confirms. */
export interface RunnerLoginDelivery { id: string; agent: RunnerLoginAgent; credential: string }
export interface RunnerReply {
  jobs: RemoteJobSpec[]
  cancel: string[]
  acknowledgements: Array<{ id: string; logOffset: number; sessionOffset: number; finished: boolean }>
  credentials: Record<string, GitCredential>
  logins?: RunnerLoginDelivery[]
}
