import type { Agent, AgentGroup } from './agents/types.js'
import type { TaskRule } from './automation/conditions.js'
import type { SchedulerStatus } from './execution/status.js'
import type { Run } from './execution/types.js'
import type { Project } from './projects/types.js'
import type { Task } from './tasks/types.js'

// ---------------------------------------------------------------------------
// Snapshot (what the renderer mirrors)
// ---------------------------------------------------------------------------

export interface AppSnapshot {
  /** Main assembles the resume commands; the UI only gets the candidate names. */
  resumeCommands?: Record<string, string | null>
  externalAgentNames?: Record<string, string>
  projects: Project[]
  tasks: Task[]
  /** Automation rule definitions. Used by project settings and by showing where generated tasks came from. */
  rules: TaskRule[]
  agents: Agent[]
  groups: AgentGroup[]
  /** Running Runs plus each task's latest Run. Not everything. */
  runs: Run[]
  scheduler: SchedulerStatus
}

export interface ToastPayload {
  id: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  detail?: string
  /** The task a click opens. */
  taskId?: string
}

/**
 * State of sync with the iPhone app. Shown on the settings pane.
 *
 * **Holds only values that change what a person does.** Showing version
 * numbers or export counts gives the reader nothing to act on. What's needed
 * is two things: "when did we last converge" and "was anything not applied".
 */
export interface MobileSyncStatus {
  enabled: boolean
  /** Whether the storage location is reachable (false if iCloud Drive is disabled) */
  reachable: boolean
  lastExportAt: string
  lastImportAt: string
  /** Operations not applied (crossed in flight). The part handed back to the person */
  conflicts: MobileSyncConflict[]
  /** Most recent failure. Empty means no problem */
  error: string
}

export interface MobileSyncConflict {
  intentId: string
  device: string
  seq: number
  taskId: string
  at: string
  outcome: 'applied' | 'skipped' | 'deferred' | 'conflict'
  reason: string
}
