import type { Run } from '../../../preload/api/execution.js'

/** Follow recorded handoffs, not row adjacency: history may contain unrelated or missing runs. */
export function fallbackAgentChain(run: Run, runs: ReadonlyMap<string, Run>): string[] {
  const agents: string[] = []
  const seen = new Set<string>()
  let current: Run | undefined = run
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    if (agents[0] !== current.agentId) agents.unshift(current.agentId)
    current = current.fallbackFromRunId ? runs.get(current.fallbackFromRunId) : undefined
  }
  return agents
}
