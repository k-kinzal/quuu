import {
  Dot,
  IconButton,
  InlineMarker,
  ItemBody,
  ItemGroupHeader,
  ItemList,
  ItemMarker,
  ItemMeta,
  ItemRow,
  ItemSubline,
  Panel,
  PanelHeader,
  PanelHeading,
  Reveal,
  Spacer,
  SupportingText,
  Text,
  WindowDragArea,
  claimContextMenu,
  motionRegion,
  motionAnchor
} from '@design-system/react'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { Task, TaskStatus } from '../../../preload/api/tasks.js'
import { useWindowLayout } from '../interaction/useWindowLayout.js'
import { t } from '../model/i18n/index.js'
import { TASK_STATUS_LABEL } from '../model/labels.js'

import { pane } from '../interaction/focus.js'
import { runTaskListKey, taskRowId } from '../interaction/listNav.js'
import { contextMenu } from '../interaction/menu.js'
import { useTaskView } from '../interaction/useTasks.js'
import { defaultTargetProjectId, queuePositions } from '../model/derive.js'
import { duration, relativeTime } from '../model/format.js'
import { holdsSlot } from '../model/taskStatus.js'
import { useStore } from '../state/store.js'
import { ICON, Lock, PanelLeftClose, Plus, iconProps } from '../ui/icons.js'
import { StatusDot } from '../ui/StatusDot.js'
import { sectionMenuItems } from './SectionMenu.js'
import { taskMenuItems } from './TaskMenu.js'
import { TaskQuickAdd } from './TaskQuickAdd.js'
import { RecurringTaskListRow } from './RecurringTaskRow.js'

/**
 * L1 while a detail is open (rule C).
 *
 * The default is "running alongside". The requirement is that titles are readable and
 * you can move up and down; drop that and the path "check the task that moved and switch
 * to it" is severed.
 *
 * When space is needed, **hide it** rather than squeezing the width.
 * Never build a degenerate form you can't tell apart (a column of dots, say).
 *
 * Size controls sit on this surface (rule C-4a). The medium list offers only minimize;
 * closing the detail is concentrated in the detail header's × and Esc.
 *
 * Even shrunk, **never drop create and delete** (rule C-7).
 * Queue with the one-line input, delete from the row's right-click (the same TaskMenu
 * as the full-width table).
 *
 * The ground is **a surface you can see through**. The reading surface (the conversation)
 * stays opaque paper; only the incidental surfaces in front of it (the rail and this list)
 * are translucent, so the quality of the ground says which one is primary.
 */
export function TaskSidebar(): JSX.Element {
  const { WINDOW_BUTTONS_OVERHANG } = useWindowLayout()
  const snapshot = useStore((s) => s.snapshot)
  const cursorTaskId = useStore((s) => s.cursorTaskId)
  const openTask = useStore((s) => s.openTask)
  const layout = useStore((s) => s.layout)
  const setLayout = useStore((s) => s.setLayout)
  const section = useStore((s) => s.section)
  const landedTaskId = useStore((s) => s.landedTaskId)
  const targetProjectId = useStore((s) => s.targetProjectId)
  const [now, setNow] = useState(() => Date.now())
  const [adding, setAdding] = useState(false)

  /*
   * Grouping is shared with the table. When the full-width table is sorted by a column,
   * don't group here either (re-grouping would drift the on-screen order apart from
   * the ↑↓ movement order)
   */
  const view = useTaskView()
  const tasks = view.ordered
  const groups = useMemo<{ status: TaskStatus | null; tasks: Task[] }[]>(
    () => view.groups ?? [{ status: null, tasks: view.ordered }],
    [view.groups, view.ordered]
  )
  const projects = view.context.projects
  const runs = view.context.runs
  const positions = useMemo(
    () => queuePositions(snapshot?.tasks ?? [], projects),
    [snapshot?.tasks, projects]
  )

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // ⌘N (the rule A shortcut) is taken here with the detail still open.
  // Forcing the detail closed just to queue something loses what you were reading.
  useEffect(() => {
    const open = (): void => setAdding(true)
    window.addEventListener('quuu:focus-quickadd', open)
    return () => window.removeEventListener('quuu:focus-quickadd', open)
  }, [])

  const listRef = useRef<HTMLDivElement>(null)
  // Keep the selection from scrolling out of view when ↑↓ moves it
  useEffect(() => {
    listRef.current?.querySelector('[data-cursor="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursorTaskId])

  // What you queue joins the queued group. Without seeing where it landed, queueing has no feedback
  useEffect(() => {
    if (!landedTaskId) return
    listRef.current?.querySelector('[data-landed="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [landedTaskId])

  const sectionTitle =
    section.kind === 'review'
      ? t('sidebar.review')
      : section.kind === 'project'
        ? (projects.get(section.id)?.name ?? t('sidebar.project'))
        : t('sidebar.allTasks')

  /*
   * In All tasks / Needs review, say **in words** which project a row belongs to (rule C-2a).
   *
   * A colored dot alone doesn't tell you "what is mixed in with what". The question to
   * answer here is "what task is this", and that comes before elapsed time.
   * With a project open, the path already answers it (the same condition under which the
   * full-width table shows the column).
   */
  const showProject = section.kind !== 'project'

  /* Needs review is a surface for looking at what has piled up, so it carries no queueing action (same as the full-width table) */
  const openProjects = snapshot?.projects ?? []
  const targetId = defaultTargetProjectId(
    section.kind === 'project' ? section.id : null,
    targetProjectId,
    snapshot?.tasks.find((t) => t.id === cursorTaskId)?.projectId ?? null,
    snapshot?.projects ?? []
  )
  const target = openProjects.find((p) => p.id === targetId)
  const canAdd = section.kind !== 'review' && target !== undefined

  /* Empty space below the rows acts on the list itself (the same menu as the full-width table) */
  const openSectionMenu = (e: MouseEvent): void => {
    if (claimContextMenu(e)) void contextMenu(sectionMenuItems())
  }

  return (
    <Panel width={layout.list} surface="transparent" onContextMenu={openSectionMenu} {...motionRegion('collection', 'left')}>
      <PanelHeader
        size="sm"
        startInset={layout.railCollapsed ? WINDOW_BUTTONS_OVERHANG : undefined}
      >
        <PanelHeading title={sectionTitle} count={tasks.length}><span {...motionAnchor('heading')}>{sectionTitle}</span></PanelHeading>
        {/* The empty part of the bar is a drag surface. It gives back what the window loses by having no title bar */}
        <WindowDragArea />

        {canAdd && (
          <IconButton
            title={t('sidebar.addTask')}
            icon={<Plus size={ICON.md} {...iconProps} />}
            onClick={() => setAdding(true)}
          />
        )}
        <IconButton
          title={t('sidebar.minimize')}
          icon={<PanelLeftClose size={ICON.md} {...iconProps} />}
          onClick={() => setLayout({ listMode: 'hidden' })}
        />
      </PanelHeader>

      <Reveal open={adding && Boolean(target)}>
        {target && (
          <TaskQuickAdd
            project={target}
            projects={openProjects}
            /* Fix it only when the hierarchy decides it. A destination that fell through because it is archived must stay re-pickable */
            fixed={section.kind === 'project' && target.id === section.id}
            onClose={() => setAdding(false)}
          />
        )}
      </Reveal>

      {/*
        Even running alongside, the list keeps the same set of actions as the full-width table (rule C-7).
        If ↑↓ stopped working in the shrunk form, the path "see the task that moved, go to the next" is severed
      */}
      <ItemList
        inset
        ref={listRef}
        {...pane('list', { tab: true })}
        role="listbox"
        aria-label={t('sidebar.listLabel', { section: sectionTitle })}
        aria-activedescendant={cursorTaskId ? taskRowId(cursorTaskId) : undefined}
        onKeyDown={(e) => runTaskListKey(e, tasks)}
      >
        {groups.map((group) => (
          <div key={group.status ?? 'sorted'}>
            {/* Sorting means there are no groups. Leaving the headers behind would be a lie */}
            {group.status && (
              <ItemGroupHeader surface="glass">
                <span {...motionAnchor(`group-${group.status}`)}>{TASK_STATUS_LABEL[group.status]}</span>
                <SupportingText tabular>{group.tasks.length}</SupportingText>
              </ItemGroupHeader>
            )}

            {group.tasks.map((task) => {
              const project = projects.get(task.projectId)
              const run = runs.get(task.id)
              const current = task.id === cursorTaskId
              const elapsed =
                task.status === 'running' && run
                  ? duration(run.startedAt, null, now)
                  : task.status === 'queued'
                    ? `#${positions.get(task.id) ?? '-'}`
                    : task.status === 'review' || task.status === 'failed'
                      ? relativeTime(run?.endedAt ?? task.updatedAt, now)
                      : ''

              const lock = holdsSlot(task) ? (
                <InlineMarker title={t('sidebar.holdMarker')}>
                  <Lock size={ICON.sm} {...iconProps} />
                </InlineMarker>
              ) : null
              const time = elapsed ? (
                <Text size="xs" tone="tertiary" tabular>
                  {elapsed}
                </Text>
              ) : null

              return (
                <ItemRow
                  key={task.id}
                  id={taskRowId(task.id)}
                  type="button"
                  role="option"
                  aria-selected={current}
                  /* The list points at rows (they aren't in the ⇥ order). Same reason as the full-width table */
                  tabIndex={-1}
                  lines={showProject ? 2 : 1}
                  data-cursor={current || undefined}
                  data-landed={task.id === landedTaskId || undefined}
                  selected={current}
                  flashing={task.id === landedTaskId}
                  title={t('sidebar.rowTitle', { title: task.title })}
                  onClick={() => void openTask(task.id)}
                  /* Keep the full-width table's entry point even in the shrunk form (rules C-7 / J-2) */
                  onContextMenu={(e) => {
                    if (!claimContextMenu(e)) return
                    void contextMenu(
                      taskMenuItems(task.id, { origin: 'list', ordered: tasks.map((t) => t.id) })
                    )
                  }}
                >
                  {showProject ? (
                    <>
                      <ItemMarker>
                        <StatusDot status={task.status} />
                      </ItemMarker>
                      <ItemBody>
                        {/* The identifier survives to the last (rules C-2 / I). Line 1 gets the whole width */}
                        <Text size="sm" truncate {...motionAnchor(task.id)}>
                          {task.title}
                        </Text>
                        {/* Line 2 is "where it belongs". It should be read before the time, so it goes left and gets one step more contrast */}
                        <ItemSubline>
                          <Dot color={project?.color} muted={!project} />
                          <Text tone="secondary" truncate title={project?.name}>
                            {project?.name ?? '—'}
                          </Text>
                          <Spacer />
                          {lock}
                          {time}
                        </ItemSubline>
                      </ItemBody>
                    </>
                  ) : (
                    <>
                      <StatusDot status={task.status} />
                      {/* The identifier survives to the last (rules C-2 / I) */}
                      <Text size="sm" truncate grow {...motionAnchor(task.id)}>
                        {task.title}
                      </Text>
                      <ItemMeta>
                        {lock}
                        <Dot color={project?.color} title={project?.name} />
                        {time}
                      </ItemMeta>
                    </>
                  )}
                </ItemRow>
              )
            })}
          </div>
        ))}
        {view.groups && view.rules.length > 0 && (
          <ItemGroupHeader surface="glass">
            <span {...motionAnchor('group-recurring')}>{t('taskRules.recurringSection')}</span>
            <SupportingText tabular>{view.rules.length}</SupportingText>
          </ItemGroupHeader>
        )}
        {view.rules.map((rule) => (
          <RecurringTaskListRow key={rule.id} rule={rule} project={projects.get(rule.projectId)} showProject={showProject} />
        ))}
      </ItemList>
    </Panel>
  )
}
