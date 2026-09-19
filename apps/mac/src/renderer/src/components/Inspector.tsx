import {
  Badge,
  Button,
  DescriptionList,
  DetailStack,
  Dot,
  GroupTitle,
  HintList,
  LinkButton,
  Menu,
  Panel,
  ScrollArea,
  Spinner,
  SupportingText,
  Text,
  claimContextMenu,
  useMenu,
  type MenuItemSpec
} from '@design-system/react'
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import type { Project } from '../../../preload/api/projects.js'
import type { DependsMode, Task, TaskDependency } from '../../../preload/api/tasks.js'
import { t } from '../model/i18n/index.js'
import { DEPENDS_MODE_LABEL, PRIORITY_LABEL, TASK_STATUS_LABEL } from '../model/labels.js'

import { copyItem, group } from '../interaction/contextMenu.js'
import { pane } from '../interaction/focus.js'
import { contextMenu } from '../interaction/menu.js'
import { openWithItems } from '../interaction/openWith.js'
import { startNewTask } from '../interaction/taskLink.js'
import { blockingTasks, projectIssues, projectMap, sortTasks, targetLabel, taskMap, taskTargetLabel, wouldCycleWith } from '../model/derive.js'
import { homeRelative, relativeTime } from '../model/format.js'
import { holdsSlot } from '../model/taskStatus.js'
import { useTaskReport } from '../interaction/useTaskReport.js'
import { useStore } from '../state/store.js'
import { StatusDot } from '../ui/StatusDot.js'
import { FolderOpen, ICON, ListTree, Plus, ScrollText, Settings2, TriangleAlert, iconProps } from '../ui/icons.js'
import { InspectorFixed, InspectorGroup, InspectorRuns, Pending, Priority as PriorityText } from '../ui/panes.js'
import { RunHistory } from './RunHistory.js'

/** What can be done with the project directory. The open set, plus extracting the value. */
function projectPathItems(projectId: string, path: string): MenuItemSpec[] {
  return [
    ...openWithItems({ kind: 'project', id: projectId }),
    ...group(copyItem(t('inspector.copyDirectory'), path))
  ]
}

/**
 * How many candidates per project to show **initially** for predecessor tasks.
 *
 * The quotas are separate so **a project with many tasks doesn't push out the others**.
 * The same project gets a wider quota because that's where the things you want
 * finished first tend to gather.
 *
 * This is a fold point, **not a cutoff of candidates**. The rest fold into one
 * "N more" line that expands in place when pressed (`MenuItemSpec.more`). Back when
 * we cut instead of folding, projects with many tasks had **candidates that could
 * not be selected**.
 */
const CANDIDATES_OWN = 12
const CANDIDATES_OTHER = 5

/**
 * The pane that takes everything but the lead role (rule B).
 * Attributes are for checking, so lay them out at a density that scans without reading.
 */
export function Inspector({
  task,
  project,
  width,
  embedded = false
}: {
  task: Task
  project: Project | undefined
  width: number
  /** When embedded in the workbench's stacked pane, leave width and outer borders to the parent. */
  embedded?: boolean
}): JSX.Element {
  const snapshot = useStore((s) => s.snapshot)
  const runs = useStore((s) => s.runs)
  const selectedRunId = useStore((s) => s.selectedRunId)
  const selectRun = useStore((s) => s.selectRun)
  const refreshRuns = useStore((s) => s.refreshRuns)
  const setSection = useStore((s) => s.setSection)
  const openProjectSettings = useStore((s) => s.openProjectSettings)
  // Read rather than required: this pane is on screen before settings have arrived
  const settings = useStore((s) => s.settings)
  const { report, generating: reportWriting, generate: writeReport } = useTaskReport(task.id, true)

  const [now, setNow] = useState(() => Date.now())
  /*
   * Offered while the feature is on for this project, and kept visible afterwards whenever a
   * report exists — a row that disappears takes the only route back to what was written with it.
   */
  const reportShown = (settings?.reportEnabled === true && project?.reportEnabled !== false) || report !== null
  // A page exists, not merely a row: a generation that failed before writing one is not a report
  const reportWritten = (report?.path.length ?? 0) > 0

  const pushToast = useStore((s) => s.pushToast)

  const byId = useMemo(() => taskMap(snapshot?.tasks ?? []), [snapshot?.tasks])
  const projects = useMemo(() => projectMap(snapshot?.projects ?? []), [snapshot?.projects])
  const blocking = useMemo(() => new Set(blockingTasks(task, byId).map((t) => t.id)), [task, byId])

  const setDependencies = async (next: TaskDependency[]): Promise<void> => {
    try {
      await window.quuu.tasks.update({ id: task.id, patch: { dependsOn: next } })
    } catch {
      pushToast({
        id: `dep-${Date.now()}`,
        level: 'warn',
        message: t('inspector.depRejected'),
        detail: t('inspector.depCycle')
      })
    }
  }
  const addDependency = (taskId: string): Promise<void> =>
    setDependencies([...task.dependsOn, { taskId, mode: 'done' }])
  const removeDependency = (taskId: string): Promise<void> =>
    setDependencies(task.dependsOn.filter((d) => d.taskId !== taskId))
  const setDependencyMode = (taskId: string, mode: DependsMode): Promise<void> =>
    setDependencies(task.dependsOn.map((d) => (d.taskId === taskId ? { ...d, mode } : d)))

  /**
   * Menu opened from a value row. **A surface attached to the pressed row** (`Menu`).
   *
   * Every row on this pane is a "currently effective value", and the menu offers
   * re-choosing that value and operations on it. Detached from where you pressed,
   * you can't tell what the surface is about — so the right-click vessel
   * (the OS menu) is not used.
   */
  const menu = useMenu<{ label: string; items(): MenuItemSpec[] }>()
  const openAt = (e: MouseEvent<HTMLElement>, label: string, items: () => MenuItemSpec[]): void =>
    menu.open(e, { label, items })

  /** Right-click reaches the same contents too, but through the OS vessel (invoked differently). */
  const alsoOnRightClick =
    (items: () => MenuItemSpec[]) =>
      (e: MouseEvent<HTMLElement>): void => {
        if (claimContextMenu(e)) void contextMenu(items())
      }

  /**
   * Group candidates by project, **with this task's own project first**.
   *
   * We used to mix all projects' task names into a 30-item list. Task names are written
   * to be read inside their project ("apply review feedback"), so a list of bare names
   * can't tell you which one you're after.
   * Besides, what you want finished first usually lives in the same project.
   *
   * Ordering follows the list's rule (`sortTasks`). A different order here would break
   * finding things by the order you saw in the list.
   */
  const candidateGroups = useMemo(() => {
    const taken = new Set(task.dependsOn.map((d) => d.taskId))
    const groups = new Map<string, Task[]>()
    for (const t of sortTasks(
      (snapshot?.tasks ?? []).filter(
        (t) => t.id !== task.id && !t.archived && t.status !== 'done' && !taken.has(t.id)
      ),
      projects
    )) {
      const group = groups.get(t.projectId)
      if (group) group.push(t)
      else groups.set(t.projectId, [t])
    }
    const own = groups.get(task.projectId)
    return [
      ...(own ? [[task.projectId, own] as const] : []),
      ...[...groups].filter(([id]) => id !== task.projectId)
    ]
  }, [snapshot?.tasks, task.id, task.projectId, task.dependsOn, projects])

  /**
   * Add a prerequisite task. Never offer one that would cycle (being refused after
   * pressing is unkind).
   *
   * The candidates used to be existing tasks only. But you notice "this has to happen
   * first" precisely **when that prerequisite doesn't exist yet**, so it can be created
   * and linked from right here.
   */
  const addItems = (): MenuItemSpec[] => [
    { label: t('inspector.addHeading'), disabled: true },
    {
      label: t('inspector.newTask'),
      onSelect: () => startNewTask({ taskId: task.id, direction: 'before', mode: 'done' })
    },
    ...candidateGroups.flatMap(([projectId, tasks]) => {
      const limit = projectId === task.projectId ? CANDIDATES_OWN : CANDIDATES_OTHER
      const row = (t: Task): MenuItemSpec => ({
        label: t.title,
        disabled: wouldCycleWith(task, t.id, byId),
        onSelect: () => void addDependency(t.id)
      })
      const rest = tasks.slice(limit)
      return [
        // Show the project name once, as a heading. Attaching it to every row means
        // a long name truncates the task title — the part that matters — first
        {
          label: projects.get(projectId)?.name ?? t('inspector.unassigned'),
          separatorBefore: true,
          disabled: true
        },
        ...tasks.slice(0, limit).map(row),
        // The folded remainder opens on press. Just stating a count would leave those candidates unpickable
        ...(rest.length > 0 ? [{ label: t('inspector.showMore', { count: rest.length }), more: rest.map(row) }] : [])
      ]
    })
  ]

  /** Change or remove the condition on one prerequisite */
  const depItems = (taskId: string): MenuItemSpec[] => [
    { label: byId.get(taskId)?.title ?? t('inspector.archivedDependency'), disabled: true },
    ...(['done', 'finished'] as DependsMode[]).map((mode) => ({
      label: DEPENDS_MODE_LABEL[mode],
      checked: mode === task.dependsOn.find((d) => d.taskId === taskId)?.mode,
      onSelect: () => void setDependencyMode(taskId, mode)
    })),
    {
      label: t('inspector.removeDependency'),
      separatorBefore: true,
      onSelect: () => void removeDependency(taskId)
    }
  ]

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const agentNames = new Map((snapshot?.agents ?? []).map((a) => [a.id, a.name]))
  // Where the latest run actually was. Absent until something has run (`runs` is newest first)
  const workingDir = runs[0]?.cwd ?? null
  const override = task.agentOverrideId
    ? (snapshot?.agents.find((a) => a.id === task.agentOverrideId)?.name ?? null)
    : null

  // Pick up only the settings that are blocking execution, so "does anything need changing?"
  // is answerable before opening settings
  const issues = snapshot && project ? projectIssues(snapshot, project, task.agentOverrideId) : []
  // Show the origin of anything an automation queued (not found if the definition was deleted)
  const rule = task.ruleId ? (snapshot?.rules ?? []).find((r) => r.id === task.ruleId) : undefined

  // What gets sent on the next run does not appear here; the end of the conversation
  // (`PendingTurn`) holds it. To whoever sent it, it is "something already said", so
  // separating it from the conversation loses track of where it went

  return (
    <Panel
      width={embedded ? undefined : width}
      grow={embedded}
      surface="default"
      bordered={embedded ? 'none' : 'left'}
      scroll
      {...pane('inspector', { tab: true })}
      aria-label={t('inspector.paneLabel')}
    >
      <InspectorFixed>
        <InspectorGroup>
          <DescriptionList>
            <dt>{t('inspector.status')}</dt>
            <dd>
              <StatusDot status={task.status} />
              <span>{TASK_STATUS_LABEL[task.status]}</span>
            </dd>

            <dt>{t('inspector.project')}</dt>
            <dd>
              <Dot color={project?.color} />
              <Text truncate>{project?.name ?? t('inspector.unassigned')}</Text>
            </dd>

            <dt>{t('inspector.priority')}</dt>
            <dd>
              <PriorityText level={task.priority}>{PRIORITY_LABEL[task.priority]}</PriorityText>
              {/* P0 stalls the rest of the queue for this task, so say in words that it is in effect (rule H) */}
              {holdsSlot(task) && <Badge tone="accent">{t('inspector.slotHeld')}</Badge>}
            </dd>

            <dt>{t('inspector.agent')}</dt>
            <dd>
              <Text truncate>{snapshot ? taskTargetLabel(snapshot, task, project) : '—'}</Text>
              {override && <Badge tone="accent">{t('inspector.pinned')}</Badge>}
            </dd>

            {/* Unless something queued automatically looks that way, "who made this" is unreadable */}
            {rule && (
              <>
                <dt>{t('inspector.origin')}</dt>
                <dd>
                  <Text truncate>{rule.name}</Text>
                  <Badge>{t('inspector.auto')}</Badge>
                </dd>
              </>
            )}

            <dt>{t('inspector.dependencies')}</dt>
            {/* It can wait on several. One row each, each carrying its own waiting condition */}
            <DetailStack>
              {task.dependsOn.map((dep) => {
                /*
                 * An archived blocker is in no list, so there is no title to show — but the
                 * condition is still stored on **this** task. It gets a row anyway: a dependency
                 * the pane hides is one nobody can remove, and hiding it made the pane claim a
                 * shorter list than the one being saved. It no longer holds anything up
                 * (`dependencyCleared`), so it is drawn settled, not waiting.
                 */
                const blocker = byId.get(dep.taskId)
                const waiting = blocker !== undefined && blocking.has(blocker.id)
                // Name the project only when the task belongs to a different one (rule I)
                const from =
                  !blocker || blocker.projectId === task.projectId
                    ? ''
                    : t('inspector.fromProject', {
                      name: projects.get(blocker.projectId)?.name ?? t('inspector.otherProject')
                    })
                const title = blocker?.title ?? t('inspector.archivedDependency')
                return (
                  <LinkButton
                    key={dep.taskId}
                    type="button"
                    tone={waiting ? 'warning' : 'secondary'}
                    title={t('inspector.dependencyTitle', {
                      from,
                      title,
                      mode: DEPENDS_MODE_LABEL[dep.mode]
                    })}
                    onClick={(e) => openAt(e, t('inspector.dependency'), () => depItems(dep.taskId))}
                    onContextMenu={alsoOnRightClick(() => depItems(dep.taskId))}
                  >
                    <ListTree size={ICON.sm} {...iconProps} />
                    <Text truncate>{title}</Text>
                    {/* Don't draw the default ("once it is done"). Show only what differs (rule I) */}
                    {blocker && dep.mode === 'finished' && <Badge>{t('inspector.afterRun')}</Badge>}
                  </LinkButton>
                )
              })}
              <LinkButton
                type="button"
                tone="tertiary"
                title={t('inspector.addDependencyTitle')}
                onClick={(e) => openAt(e, t('inspector.addDependencyMenu'), addItems)}
                onContextMenu={alsoOnRightClick(addItems)}
              >
                <Plus size={ICON.sm} {...iconProps} />
                <span>{task.dependsOn.length > 0 ? t('inspector.add') : t('inspector.specify')}</span>
              </LinkButton>
            </DetailStack>

            {reportShown && (
              <>
                <dt>{t('inspector.report')}</dt>
                <dd>
                  {/*
                    **One thing per state.** While it is being written there is nothing to press,
                    so the row is a status; the rest of the time there is nothing to report, so it
                    is a control. A failure is told through the notification that carries its
                    reason — kept here it would be a label with no reason and no action, and it
                    would still be sitting there over the report written after it.
                    Whether a report exists at all is the Report tab's job, not this row's.
                  */}
                  {reportWriting ? (
                    <Spinner label={t('inspector.reportWriting')} />
                  ) : (
                    <LinkButton
                      type="button"
                      tone="tertiary"
                      title={t('inspector.reportTitle')}
                      onClick={() => void writeReport().then((result) => {
                        if (result.ok) return
                        pushToast({
                          id: `report-${task.id}`,
                          level: 'warn',
                          message: t('inspector.reportRejected'),
                          detail: result.reason
                        })
                      })}
                    >
                      <ScrollText size={ICON.sm} {...iconProps} />
                      <span>{reportWritten ? t('inspector.reportAgain') : t('inspector.reportWrite')}</span>
                    </LinkButton>
                  )}
                </dd>
              </>
            )}

            {/*
              Shown only when it ran somewhere other than the project directory (rule I).
              For a session that ran in a worktree, the output lives here.
              **Don't draw it when they match** — the "Directory" row below already says it
            */}
            {workingDir && workingDir !== project?.path && (
              <>
                <dt>{t('inspector.workingDir')}</dt>
                <dd>
                  <LinkButton
                    type="button"
                    mono
                    /* Just gives back what was truncated (rule K-1). Never explain how to press it */
                    title={workingDir}
                    onClick={(e) =>
                      openAt(e, t('inspector.workingDir'), () => openWithItems({ kind: 'task', id: task.id }))
                    }
                    onContextMenu={alsoOnRightClick(() =>
                      openWithItems({ kind: 'task', id: task.id })
                    )}
                  >
                    <FolderOpen size={ICON.sm} {...iconProps} />
                    <Text truncate>{homeRelative(workingDir)}</Text>
                  </LinkButton>
                </dd>
              </>
            )}

            <dt>{t('inspector.updated')}</dt>
            <dd>{relativeTime(task.updatedAt, now)}</dd>

            {task.doneAt && (
              <>
                <dt>{t('inspector.done')}</dt>
                <dd>{relativeTime(task.doneAt, now)}</dd>
              </>
            )}
          </DescriptionList>
        </InspectorGroup>

        {task.reservedMessage.trim().length > 0 && (
          <InspectorGroup>
            <GroupTitle>
              {task.status === 'running' || task.status === 'queued'
                ? t('inspector.reservedQueued')
                : t('inspector.reservedUnsent')}
            </GroupTitle>
            {/* A read-only section. Fold it so a long one can't stretch the fixed area, and let the full text escape into title */}
            <Pending title={task.reservedMessage} collapsed>
              {task.reservedMessage}
            </Pending>
          </InspectorGroup>
        )}

        {project && (
          <InspectorGroup last>
            <GroupTitle>{t('inspector.projectSettings')}</GroupTitle>
            <DescriptionList>
              <dt>{t('inspector.target')}</dt>
              <dd>
                <Text truncate>{snapshot ? targetLabel(snapshot, project) : '—'}</Text>
              </dd>

              <dt>{t('inspector.priority')}</dt>
              {/* "Lower goes first" is said by the unit. Everyone knows 1st comes before 2nd (rule G-③) */}
              <dd>{t('inspector.rank', { rank: project.priority })}</dd>

              <dt>{t('inspector.concurrency')}</dt>
              <dd>{t('inspector.maxConcurrent', { count: project.maxConcurrent })}</dd>

              <dt>{t('inspector.intake')}</dt>
              <dd>
                <Text tone={project.enabled ? undefined : 'warning'}>
                  {project.enabled ? t('inspector.enabled') : t('inspector.paused')}
                </Text>
              </dd>

              <dt>{t('inspector.directory')}</dt>
              <dd>
                <LinkButton
                  type="button"
                  mono
                  title={project.path}
                  onClick={(e) =>
                    openAt(e, t('inspector.directory'), () => projectPathItems(project.id, project.path))
                  }
                  onContextMenu={alsoOnRightClick(() => projectPathItems(project.id, project.path))}
                >
                  <FolderOpen size={ICON.sm} {...iconProps} />
                  <Text truncate>{homeRelative(project.path)}</Text>
                </LinkButton>
              </dd>
            </DescriptionList>

            {/*
              Answer "do I need to open settings?" before the button, once and for all.
              Draw nothing when there is no problem (rule I: never draw a success label).
              The current values above are already the answer.
            */}
            {issues.length > 0 && (
              <HintList>
                {issues.map((issue) => (
                  <li key={issue.kind}>
                    <TriangleAlert size={ICON.sm} {...iconProps} />
                    <span>{issue.message}</span>
                  </li>
                ))}
              </HintList>
            )}

            <Button
              size="xs"
              title={t('inspector.projectSettingsTitle')}
              startIcon={<Settings2 size={ICON.sm} {...iconProps} />}
              onClick={() => {
                setSection({ kind: 'project', id: project.id })
                openProjectSettings(true)
              }}
            >
              {t('inspector.openProjectSettings')}
            </Button>
          </InspectorGroup>
        )}
      </InspectorFixed>

      {/* Only the run history flexes, and only this surface scrolls */}
      <InspectorRuns>
        <GroupTitle>
          {t('inspector.runHistory')}
          <SupportingText tabular>{runs.length}</SupportingText>
        </GroupTitle>
        <ScrollArea>
          <RunHistory
            runs={runs}
            agentNames={agentNames}
            selectedRunId={selectedRunId}
            now={now}
            onSelect={(runId) => void selectRun(runId)}
            onCancel={(runId) => {
              void window.quuu.runs.cancel(runId).then(() => refreshRuns(task.id))
            }}
          />
        </ScrollArea>
      </InspectorRuns>

      {/* The surface opened from a value row. Anchored to the row that was pressed (drawn in a portal) */}
      <Menu
        open={menu.isOpen}
        anchorEl={menu.anchorEl}
        onClose={menu.close}
        items={menu.payload?.items ?? (() => [])}
        label={menu.payload?.label ?? t('inspector.menu')}
      />
    </Panel>
  )
}
