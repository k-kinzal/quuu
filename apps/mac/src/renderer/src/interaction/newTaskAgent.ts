import type { Agent } from '../../../preload/api/agents.js'
import type { Project } from '../../../preload/api/projects.js'
import { candidateAgentsFor, projectAgentIds, targetLabel } from '../model/derive.js'
import { useStore } from '../state/store.js'

/**
 * Which AI the next task added to this project runs on.
 *
 * Two lists, because they are two different decisions. `linked` is what the project already
 * chose — picking one of them narrows the group to a member. `others` is **every other
 * definition**, off this project's target entirely: the way to say "that one, this once" when
 * the project's own AI is sitting out a Limit and waiting for it is not an option.
 *
 * A project that names a single agent has no `linked` list: that agent *is* the default, and
 * listing it a second time would read as two different choices with the same name.
 *
 * The choice sticks per project until it is changed, and holds even if the agent later leaves
 * the project's group — a deliberate pick does not expire because the group was edited. It is
 * on the chip the whole time, so it is never forced without being visible.
 */
export function useNewTaskAgent(project: Project | undefined) {
  const snapshot = useStore(state => state.snapshot)
  const chosen = useStore(state => project ? state.newTaskAgentIds[project.id] : undefined)
  const setAgent = useStore(state => state.setNewTaskAgent)
  const candidates: Agent[] = snapshot ? candidateAgentsFor(snapshot, project, chosen ?? null) : []
  const linkedIds = new Set(snapshot ? projectAgentIds(snapshot, project) : [])
  const linked = project?.targetKind === 'group' ? candidates.filter(agent => linkedIds.has(agent.id)) : []
  const others = candidates.filter(agent => !linkedIds.has(agent.id))
  const selected = candidates.find(agent => agent.id === chosen)
  return {
    linked,
    others,
    /** The picker earns its place only where there is something to pick besides the project's own. */
    pickable: others.length > 0 || linked.length > 1,
    agentOverrideId: selected?.id ?? null,
    label: selected?.name ?? (snapshot ? targetLabel(snapshot, project) : '—'),
    /** How the project's own assignment reads: a group, one named agent, or nothing set. */
    targetKind: project?.targetId ? project.targetKind : null,
    targetLabel: snapshot ? targetLabel(snapshot, project) : '—',
    onChange: (id: string | null) => { if (project) setAgent(project.id, id) }
  }
}
