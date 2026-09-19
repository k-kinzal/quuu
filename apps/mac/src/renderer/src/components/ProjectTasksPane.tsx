import {
  IconButton,
  SearchInput,
  Spacer,
  Text,
  ToolPanel,
  ToolPanelDisclosure,
  ToolPanelFooter,
  ToolPanelGroup,
  ToolPanelGroupHeader,
  ToolPanelRow,
  ToolPanelRowBody,
  ToolPanelRowDetail,
  ToolPanelRowLabel,
  ToolPanelScroller,
  ToolPanelToolbar
} from '@design-system/react'
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import type { ProjectTask } from '../../../preload/api/review.js'
import { t } from '../model/i18n/index.js'
import { ChevronRight, FileText, ICON, Play, Search, iconProps } from '../ui/icons.js'

const SOURCES: Array<{ id: ProjectTask['source']; label: string }> = [
  { id: 'package', label: 'package.json' },
  { id: 'composer', label: 'composer.json' },
  { id: 'make', label: 'Makefile' }
]

interface ProjectTasksPaneProps {
  tasks: ProjectTask[]
  onRun(id: string): void
}

function rowId(id: string): string {
  return `project-task-${id.replace(/[^A-Za-z0-9_-]/g, '-')}`
}

/** The Tasks pane: pick starting from the definition file, confirm the command, and send it to the terminal. */
export function ProjectTasksPane({ tasks, onRun }: ProjectTasksPaneProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openSources, setOpenSources] = useState<Record<ProjectTask['source'], boolean>>({
    package: true,
    composer: true,
    make: true
  })
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return tasks.filter((task) =>
      !normalized || `${task.label} ${task.command}`.toLocaleLowerCase().includes(normalized)
    )
  }, [query, tasks])
  const navigable = useMemo(
    () => filtered.filter((task) => query.trim() || openSources[task.source]),
    [filtered, openSources, query]
  )
  const selected = tasks.find((task) => task.id === selectedId) ?? null

  useEffect(() => {
    if (selectedId && navigable.some((task) => task.id === selectedId)) return
    setSelectedId(navigable[0]?.id ?? null)
  }, [navigable, selectedId])

  const moveSelection = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (navigable.length === 0) return
    const current = Math.max(0, navigable.findIndex((task) => task.id === selectedId))
    let next = current
    if (event.key === 'ArrowDown') next = Math.min(navigable.length - 1, current + 1)
    else if (event.key === 'ArrowUp') next = Math.max(0, current - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = navigable.length - 1
    else if (event.key === 'Enter' && selected) {
      event.preventDefault()
      onRun(selected.id)
      return
    } else return
    event.preventDefault()
    setSelectedId(navigable[next]?.id ?? null)
  }

  return (
    <ToolPanel>
      <ToolPanelToolbar>
        <SearchInput
          fill
          value={query}
          aria-label={t('projectTasksPane.searchLabel')}
          placeholder={t('projectTasksPane.searchPlaceholder')}
          icon={<Search size={ICON.sm} {...iconProps} />}
          onChange={(event) => setQuery(event.target.value)}
        />
        <IconButton
          size="xs"
          title={t('projectTasksPane.runSelected')}
          disabled={!selected}
          icon={<Play size={ICON.sm} {...iconProps} />}
          onClick={() => selected && onRun(selected.id)}
        />
      </ToolPanelToolbar>

      <ToolPanelScroller
        role="listbox"
        aria-label={t('projectTasksPane.listLabel')}
        aria-activedescendant={selected ? rowId(selected.id) : undefined}
        tabIndex={0}
        onKeyDown={moveSelection}
      >
        {SOURCES.map((source) => {
          const sourceTasks = filtered.filter((task) => task.source === source.id)
          if (sourceTasks.length === 0) return null
          return (
            <ToolPanelGroup
              key={source.id}
              open={Boolean(query.trim()) || openSources[source.id]}
              onToggle={(event) => {
                // currentTarget can't be referenced after the event, so copy the value synchronously before keeping it.
                const open = event.currentTarget.open
                setOpenSources((values) => ({ ...values, [source.id]: open }))
              }}
            >
              <ToolPanelGroupHeader>
                <ToolPanelDisclosure><ChevronRight size={ICON.sm} {...iconProps} /></ToolPanelDisclosure>
                <FileText size={ICON.sm} {...iconProps} />
                <Text size="xs" truncate>{source.label}</Text>
                <Spacer />
                <Text size="xs" tone="tertiary" tabular>{sourceTasks.length}</Text>
              </ToolPanelGroupHeader>
              {sourceTasks.map((task) => (
                <ToolPanelRow
                  key={task.id}
                  id={rowId(task.id)}
                  type="button"
                  role="option"
                  aria-selected={selectedId === task.id}
                  lines={2}
                  selected={selectedId === task.id}
                  title={`${task.label} — ${task.command}`}
                  tabIndex={-1}
                  onClick={() => setSelectedId(task.id)}
                  onDoubleClick={() => onRun(task.id)}
                >
                  <ToolPanelRowBody>
                    <ToolPanelRowLabel>{task.label}</ToolPanelRowLabel>
                    <ToolPanelRowDetail>{task.command}</ToolPanelRowDetail>
                  </ToolPanelRowBody>
                </ToolPanelRow>
              ))}
            </ToolPanelGroup>
          )
        })}
      </ToolPanelScroller>

      {selected && (
        <ToolPanelFooter>
          <Text size="xs" mono truncate title={selected.command}>{selected.command}</Text>
          <Spacer />
          <IconButton
            size="xs"
            title={t('projectTasksPane.runInTerminal', { label: selected.label })}
            icon={<Play size={ICON.sm} {...iconProps} />}
            onClick={() => onRun(selected.id)}
          />
        </ToolPanelFooter>
      )}
    </ToolPanel>
  )
}
