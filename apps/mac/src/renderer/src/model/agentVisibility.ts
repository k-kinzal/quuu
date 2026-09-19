import type { Agent } from '../../../preload/api/agents.js'

/** Definitions the app created for importing are never listed as options. */
export function isManagedAgent(agent: Pick<Agent, 'source'>): boolean { return agent.source !== 'user' }
