import type { Agent } from '../../../preload/api/agents.js'
import { isManagedAgent } from './agentVisibility.js'

/** The settings screen lists only definitions the user can edit. */
export function userAgents<T extends Agent>(agents: T[]): T[] {
  return agents.filter((a) => !isManagedAgent(a))
}
