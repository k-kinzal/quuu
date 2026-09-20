import { IconButton, SearchPicker, useMenu } from '@design-system/react'
import type { useNewTaskAgent } from '../interaction/newTaskAgent.js'
import { PromptAgentChip } from './PromptComposer.js'
import { t } from '../model/i18n/index.js'
import { Bot, ICON, iconProps } from '../ui/icons.js'

/** What the project itself decides, said in the project's own terms. */
function defaultLabel(target: ReturnType<typeof useNewTaskAgent>): string {
  if (target.targetKind === 'group') return t('taskComposer.agentGroup', { name: target.targetLabel })
  if (target.targetKind === 'agent') return t('taskComposer.agentProject', { name: target.targetLabel })
  return target.targetLabel
}

export function NewTaskAgentSelect({ target, compact = false, onPicking }: {
  target: ReturnType<typeof useNewTaskAgent>
  compact?: boolean
  onPicking?(open: boolean): void
}): JSX.Element | null {
  const menu = useMenu<null>()
  if (!target.pickable) return compact ? null : <PromptAgentChip label={target.label} />
  const open = (event: React.MouseEvent<HTMLElement>): void => {
    onPicking?.(true)
    menu.open(event, null)
  }
  const title = t('taskComposer.agentTitle', { name: target.label })
  return <>
    {compact ? <IconButton
      size="xs" title={title} menu aria-haspopup="listbox" icon={<Bot size={ICON.sm} {...iconProps} />}
      aria-expanded={menu.isOpen}
      onMouseDown={event => { event.preventDefault(); open(event) }}
      onClick={event => { if (event.detail === 0) open(event) }}
    /> : <PromptAgentChip label={target.label} open={menu.isOpen} onClick={open} />}
    <SearchPicker
      open={menu.isOpen} anchorEl={menu.anchorEl} label={t('taskComposer.agent')}
      onClose={() => { menu.close(); onPicking?.(false) }}
      value={target.agentOverrideId ?? ''}
      onChange={value => target.onChange(value || null)}
      options={[
        { value: '', label: defaultLabel(target) },
        ...target.linked.map((agent, index) => ({
          value: agent.id, label: agent.name, separatorBefore: index === 0
        })),
        // Off the project's target: kept behind a heading, because reaching for one is a decision
        ...target.others.map(agent => ({
          value: agent.id, label: agent.name, group: t('taskComposer.agentOther')
        }))
      ]}
    />
  </>
}
