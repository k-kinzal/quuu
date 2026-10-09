import { Select } from '@design-system/react'
import type { Project } from '../../../api/schemas/projects.js'
import { userAgents } from '../model/agents.js'
import { t } from '../model/i18n/index.js'
import { useStore } from '../state/store.js'

type Target = Pick<Project, 'targetKind' | 'targetId'>

/** Project settings and QuuuAI edit the same execution assignment. */
export function ProjectTargetSelect({ project, disabled, onChange }: {
  project: Target
  disabled?: boolean
  onChange(target: Target): void
}): JSX.Element {
  const snapshot = useStore(s => s.snapshot)
  const agents = userAgents(snapshot?.agents ?? [])
  const groups = snapshot?.groups ?? []
  const value = project.targetId ? `${project.targetKind}:${project.targetId}` : ''
  const available = (project.targetKind === 'group' ? groups : agents).some(item => item.id === project.targetId)
  return <Select aria-label={t('projectDetail.target')} value={value} disabled={disabled}
    onChange={event => {
      const [kind, id] = event.target.value.split(':')
      onChange({ targetKind: kind === 'group' ? 'group' : 'agent', targetId: id || null })
    }}
    options={[
      { value: '', label: t('projectDetail.unassigned') },
      ...(value && !available ? [{ value, label: t('projectDetail.targetUnavailable', { id: project.targetId }), disabled: true }] : []),
      ...groups.map(group => ({ value: `group:${group.id}`, label: group.name, group: t('projectDetail.groupsGroup') })),
      ...agents.map(agent => ({ value: `agent:${agent.id}`, label: agent.name, group: t('projectDetail.agentsGroup') }))
    ]} />
}
