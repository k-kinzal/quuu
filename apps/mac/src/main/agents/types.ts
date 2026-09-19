import type { RecordSource } from '../tasks/status.js'

/**
 * What a run may be aimed at: one named agent, or a group that decides among its members.
 *
 * It lives beside the agents rather than with whoever chose one, because both things it names
 * are agent definitions. A project picks one (`Project.targetKind`), and so does the report
 * feature (`AppSettings.reportTargetKind`) - neither has to know about the other to say it.
 */
export type RunTargetKind = 'agent' | 'group'

export interface Agent {
  id: string
  name: string
  description: string
  /** How many may run in parallel. */
  concurrency: number
  /** The agent ID to fall back to on a limit / error. */
  fallbackAgentId: string | null
  /** Cooldown in seconds once a limit is detected. */
  cooldownSeconds: number
  /** Run timeout in seconds. 0 for unlimited. */
  timeoutSeconds: number
  enabled: boolean
  /**
   * Whether the user defined it, or Quuu made and maintains it behind the scenes.
   * `imported` is a definition import creates for its own purposes; it does not belong to the user.
   */
  source: RecordSource
  sortOrder: number
  createdAt: string
  updatedAt: string

  /** The command to run. e.g. "claude" */
  command: string

  /** The argument template. Placeholders such as {{prompt}} are expanded. */
  argsTemplate: string[]

  /** The argument template for a resume (a follow-up message). Empty means it cannot be resumed. */
  resumeArgsTemplate: string[]

  env: Record<string, string>

  /** Output matching any of these regexes counts as a limit. Empty means `DEFAULT_LIMIT_PATTERNS`. */
  limitPatterns: string[]

  logAdapter: LogAdapter
}

/**
 * An agent Quuu keeps behind the scenes. Never shown to the user, never editable.
 *
 * Import creates one definition it never runs, purely so a "directly started session" can be
 * recorded as a run. Putting it in settings would line the list with rows whose purpose is
 * unreadable, and deleting or renaming one is a lie because import recreates it.
 * Whether to show or allow editing is always decided through here.
 */
export function isManagedAgent(agent: Agent): boolean {
  return agent.source !== 'user'
}

export type GroupStrategy = 'priority' | 'round-robin' | 'least-busy'

export interface AgentGroup {
  id: string
  name: string
  description: string
  strategy: GroupStrategy
  memberIds: string[]
  /**
   * Whether a project added without naming a run target is assigned to this group.
   * At most one group carries the mark; marking another moves it there.
   */
  isDefault: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/**
 * The values accepted on create and update.
 * The default mark may be left out: absent means "not the default" on create and "unchanged"
 * on update, so a caller that only cares about members never has to say.
 */
export type AgentGroupInput = Omit<AgentGroup, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'> & {
  isDefault?: boolean
}

export interface AgentCooldown {
  agentId: string
  until: string
  reason: string
}

/** The caller fetches the run counts and the previously chosen ID. The order is a business rule. */
export function orderAgents<T extends Agent>(
  strategy: GroupStrategy,
  members: readonly T[],
  activeRuns: ReadonlyMap<string, number>,
  lastAgentId: string | null
): T[] {
  const enabled = members.filter((agent) => agent.enabled)
  if (strategy === 'least-busy') {
    return enabled.sort((a, b) =>
      (activeRuns.get(a.id) ?? 0) / Math.max(1, a.concurrency) -
      (activeRuns.get(b.id) ?? 0) / Math.max(1, b.concurrency) || a.sortOrder - b.sortOrder)
  }
  if (strategy === 'round-robin' && lastAgentId && enabled.length > 1) {
    const index = enabled.findIndex((agent) => agent.id === lastAgentId)
    if (index >= 0) return [...enabled.slice(index + 1), ...enabled.slice(0, index + 1)]
  }
  return enabled
}

/** Even when readable, an automatic continuation must never move to a different party. */
export function mayContinueSession(agentId: string, ownerId: string, readable: boolean): boolean {
  return readable && agentId === ownerId
}


import type { LogAdapter } from './cliAdapter.js'

export type AgentInput = Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'source'> & {
  source?: RecordSource
}
