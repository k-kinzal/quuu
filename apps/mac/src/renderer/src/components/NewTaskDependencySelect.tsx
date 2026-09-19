import { Badge, ContextChip, IconButton, Menu, SearchPicker } from '@design-system/react'
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { newTaskLinkItems, useNewTaskLink } from '../interaction/taskLink.js'
import { projectMap, sortTasks } from '../model/derive.js'
import { t } from '../model/i18n/index.js'
import { LINK_DIRECTION_LABEL, LINK_SUFFIX_LABEL } from '../model/taskLinkModel.js'
import { useStore } from '../state/store.js'
import { StatusDot } from '../ui/StatusDot.js'
import { ICON, ListTree, iconProps } from '../ui/icons.js'

/** Make ordering available where the task is written, before it can enter the queue. */
export function NewTaskDependencySelect({ projectId, compact = false, onPicking }: {
  projectId: string
  compact?: boolean
  onPicking?(open: boolean): void
}): JSX.Element {
  const snapshot = useStore(state => state.snapshot)
  const setLink = useStore(state => state.setNewTaskLink)
  const linked = useNewTaskLink()
  const [surface, setSurface] = useState<{ kind: 'picker' | 'menu'; anchor: HTMLElement } | null>(null)
  const isOpen = surface !== null
  useEffect(() => { onPicking?.(isOpen) }, [isOpen, onPicking])

  const options = useMemo(() => {
    const projects = projectMap(snapshot?.projects ?? [])
    const tasks = sortTasks((snapshot?.tasks ?? []).filter(task => !task.archived && task.status !== 'done'), projects)
    // Keep the list's ordering within each group, with the destination's tasks first.
    return [...tasks.filter(task => task.projectId === projectId), ...tasks.filter(task => task.projectId !== projectId)]
      .map(task => ({
        value: task.id, label: task.title,
        description: projects.get(task.projectId)?.name ?? t('inspector.unassigned'),
        icon: <StatusDot status={task.status} />
      }))
  }, [snapshot?.projects, snapshot?.tasks, projectId])

  const open = (event: MouseEvent<HTMLElement>): void => {
    // Quick add must survive the input losing focus to either selection surface.
    onPicking?.(true)
    setSurface({ kind: linked ? 'menu' : 'picker', anchor: event.currentTarget })
  }
  const title = linked
    ? `${linked.task.title}\n${LINK_DIRECTION_LABEL[linked.link.direction]}`
    : t('taskLink.chooseDependency')
  const icon = <ListTree size={ICON.sm} {...iconProps} />

  return <>
    {compact ? <IconButton
      size="xs" title={title} icon={icon}
      aria-haspopup={linked ? 'menu' : 'listbox'} aria-expanded={isOpen}
      onMouseDown={event => { event.preventDefault(); open(event) }}
      onClick={event => { if (event.detail === 0) open(event) }}
    /> : <ContextChip
      title={title} icon={icon} onClick={open}
      aria-haspopup={linked ? 'menu' : 'listbox'} aria-expanded={isOpen}
      badge={linked && <>
        <Badge>{LINK_SUFFIX_LABEL[linked.link.direction]}</Badge>
        {linked.link.mode === 'finished' && <Badge>{t('taskComposer.afterRun')}</Badge>}
      </>}
    >{linked?.task.title ?? t('taskLink.dependency')}</ContextChip>}
    <SearchPicker
      open={surface?.kind === 'picker'} anchorEl={surface?.anchor ?? null}
      label={t('taskLink.chooseDependency')} placeholder={t('taskLink.searchDependencies')}
      emptyLabel={t('taskLink.noDependencies')} options={options}
      value={linked?.link.direction === 'after' ? linked.task.id : null}
      onChange={taskId => setLink({ taskId, direction: 'after', mode: linked?.link.direction === 'after' ? linked.link.mode : 'done' })}
      onClose={() => setSurface(null)}
    />
    <Menu
      open={surface?.kind === 'menu'} anchorEl={surface?.anchor ?? null}
      label={t('taskComposer.link')}
      items={() => linked ? [
        {
          label: t('taskLink.chooseDependency'),
          onSelect: () => setSurface(current => current && { ...current, kind: 'picker' })
        },
        ...newTaskLinkItems(linked.link, linked.task.title)
      ] : []}
      // Selecting another task hands focus to the picker without closing quick add.
      onClose={() => setSurface(current => current?.kind === 'menu' ? null : current)}
    />
  </>
}
