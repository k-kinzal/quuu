import { IconButton, SearchPicker, useMenu } from '@design-system/react'
import type { useNewTaskAgent } from '../interaction/newTaskAgent.js'
import { PromptAgentChip } from './PromptComposer.js'
import { t } from '../model/i18n/index.js'
import { Bot, ICON, iconProps } from '../ui/icons.js'

export function NewTaskAgentSelect({ target, compact = false, onPicking }: {
  target: ReturnType<typeof useNewTaskAgent>
  compact?: boolean
  onPicking?(open: boolean): void
}): JSX.Element | null {
  const menu = useMenu<null>()
  if (target.agents.length <= 1) return compact ? null : <PromptAgentChip label={target.label} />
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
        { value: '', label: t('taskComposer.agentGroup', { name: target.groupLabel }) },
        ...target.agents.map((agent, index) => ({
          value: agent.id, label: agent.name, separatorBefore: index === 0
        }))
      ]}
    />
  </>
}
