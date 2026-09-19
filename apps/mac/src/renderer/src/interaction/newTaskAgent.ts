import type { Project } from '../../../preload/api/projects.js'
import { targetLabel } from '../model/derive.js'
import { useStore } from '../state/store.js'

export function useNewTaskAgent(project: Project | undefined) {
  const snapshot = useStore(state => state.snapshot)
  const chosen = useStore(state => project ? state.newTaskAgentIds[project.id] : undefined)
  const setAgent = useStore(state => state.setNewTaskAgent)
  const group = project?.targetKind === 'group' ? snapshot?.groups.find(group => group.id === project.targetId) : undefined
  const agents = [...new Set(group?.memberIds ?? [])].flatMap(id => {
    const agent = snapshot?.agents.find(agent => agent.id === id)
    return agent ? [agent] : []
  })
  const selected = agents.length > 1 ? agents.find(agent => agent.id === chosen) : undefined
  return {
    agents,
    agentOverrideId: selected?.id ?? null,
    label: selected?.name ?? (snapshot ? targetLabel(snapshot, project) : '—'),
    groupLabel: snapshot ? targetLabel(snapshot, project) : '—',
    onChange: (id: string | null) => { if (project) setAgent(project.id, id) }
  }
}
