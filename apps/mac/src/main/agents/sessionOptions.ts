import type { Run } from '../execution/types.js'
import type { Task } from '../tasks/types.js'
import { externalAgentName } from './catalog.js'
import { resumeInvocation } from './cli.js'
import { adapterOfExternalKey, IMPORTABLE_ADAPTERS } from './cliAdapter.js'
import type { Agent } from './types.js'

/** Launching and the display query resolve the same resume command. */
export function invocationFor(task: Task, latest: Run | null, agent: Agent | null): ReturnType<typeof resumeInvocation> {
  return resumeInvocation({ command: latest?.command ?? null, adapter: agent?.logAdapter ?? adapterOfExternalKey(task.externalKey), sessionId: latest?.sessionId ?? task.sessionId })
}

export function sessionOptions(tasks: Task[], runs: Run[], agents: Agent[]): { resumeCommands: Record<string, string | null>; externalAgentNames: Record<string, string> } {
  const latest = new Map<string, Run>()
  for (const run of runs) {
    const previous = latest.get(run.taskId)
    if (!previous || previous.startedAt < run.startedAt) latest.set(run.taskId, run)
  }
  const byId = new Map(agents.map(agent => [agent.id, agent]))
  return {
    resumeCommands: Object.fromEntries(tasks.map(task => {
      const run = latest.get(task.id) ?? null
      return [task.id, invocationFor(task, run, run ? byId.get(run.agentId) ?? null : null)?.cliName ?? null]
    })),
    externalAgentNames: Object.fromEntries(IMPORTABLE_ADAPTERS.map(adapter => [adapter, externalAgentName(adapter)]))
  }
}
