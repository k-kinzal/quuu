import type { RunTargetKind } from '../agents/types.js'

export const HOOK_EVENTS = ['created', 'queued', 'held', 'started', 'stopped', 'review', 'failed', 'beforeComplete', 'completed', 'reopened', 'archived', 'restored', 'deleted'] as const
export type HookEvent = typeof HOOK_EVENTS[number]

/** Omission inherits one field; false, an empty string and [] are explicit overrides. */
export interface TaskHook {
  id: string
  name?: string
  enabled?: boolean
  events?: HookEvent[]
  kind?: 'agent' | 'command'
  targetKind?: RunTargetKind
  targetId?: string
  prompt?: string
  command?: string
  timeoutSeconds?: number
}
export type ResolvedHook = Required<TaskHook>
export type HookStatus = 'queued' | 'starting' | 'running' | 'succeeded' | 'failed' | 'canceled'
export interface HookRun {
  id: string
  taskId: string
  taskTitle: string
  projectId: string
  hookId: string
  name: string
  event: HookEvent
  kind: 'agent' | 'command'
  status: HookStatus
  cwd: string
  input: string
  agentId: string | null
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  exitCode: number | null
  error: string
  logPath: string
}
