import {
  Button,
  CellButton,
  ColumnResizer,
  DataCell,
  DataRow,
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableHeadRow,
  Dot,
  EmptyState,
  FillerCell,
  GROUP_ROW_HEIGHT,
  HeadCell,
  IconButton,
  InlineMarker,
  InlineNote,
  Panel,
  PanelBody,
  PanelHeader,
  PanelHeading,
  Row,
  RowActions,
  SortLabel,
  SpacerRow,
  TableGroupRow,
  Text,
  WindowDragArea,
  claimContextMenu,
  motionRegion,
  motionAnchor,
  tableMetrics,
  useTheme,
  type CellTone
} from '@design-system/react'

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type RefObject
} from 'react'
import type { Run } from '../../../preload/api/execution.js'
import type { TaskRule } from '../../../preload/api/automation.js'
import type { Project } from '../../../preload/api/projects.js'
import type { Priority, Task, TaskStatus } from '../../../preload/api/tasks.js'
import { useWindowLayout } from '../interaction/useWindowLayout.js'
import { t } from '../model/i18n/index.js'
import { PRIORITY_LABEL, RUN_STATUS_LABEL, TASK_STATUS_LABEL } from '../model/labels.js'

import { focusAny, pane } from '../interaction/focus.js'
import { runTaskListKey, taskRowId } from '../interaction/listNav.js'
import { contextMenu } from '../interaction/menu.js'
import { useTaskView } from '../interaction/useTasks.js'
import { blockingTasks, dependencySatisfied, queuePositions, taskMap } from '../model/derive.js'
import { clockOrDate, clockTime, duration, relativeTime } from '../model/format.js'
import type { ColumnWidths, TaskColumn, TaskColumnId } from '../model/table.js'
import { COLUMN_MAX_WIDTH, columnWidth, filterOptions, filterValues, isTableViewDirty, setFilterValues, visibleColumns } from '../model/table.js'
import { holdsSlot } from '../model/taskStatus.js'
import type { VisibleRange } from '../model/windowing.js'
import { rowOffsets, visibleRange } from '../model/windowing.js'
import { useStore } from '../state/store.js'
import { ICON, Lock, Settings, iconProps } from '../ui/icons.js'
import { Priority as PriorityText } from '../ui/panes.js'
import { StatusDot } from '../ui/StatusDot.js'
import { columnMenuItems, doneScopeItems } from './ColumnMenu.js'
import { sectionMenuItems } from './SectionMenu.js'
import { TaskComposer } from './TaskComposer.js'
import { TaskFilterBar } from './TaskFilterBar.js'
import { taskMenuItems } from './TaskMenu.js'
import { RecurringTaskTableRow } from './RecurringTaskRow.js'

/** Actions at the row's right edge. Not a column but margin, so the table owns the fixed width. */
const ACTIONS_WIDTH = tableMetrics.actionsWidth

/** What the table lists. Group headers are also one line in the same column (for windowing). */
type Line = { kind: 'group'; status: TaskStatus | 'recurring'; count: number } | { kind: 'task'; task: Task } | { kind: 'rule'; rule: TaskRule }

/**
 * The range to draw right now. Derived from scroll position and pane height.
 *
 * Position math lives in `lib/windowing.ts` (which never touches the DOM).
 * All this does is pick up scroll and size changes and pass them along.
 */
function useVisibleRange(
  ref: RefObject<HTMLDivElement>,
  offsets: number[],
  headHeight: number
): VisibleRange {
  const [metrics, setMetrics] = useState({ scrollTop: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = (): void =>
      setMetrics((prev) =>
        prev.scrollTop === el.scrollTop && prev.height === el.clientHeight
          ? prev
          : { scrollTop: el.scrollTop, height: el.clientHeight }
      )
    read()
    el.addEventListener('scroll', read, { passive: true })
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', read)
      observer.disconnect()
    }
  }, [ref])

  return useMemo(
    // The header band is sticky, so row positions sit lower by its height
    () => visibleRange(offsets, metrics.scrollTop - headHeight, metrics.height),
    [headHeight, metrics, offsets]
  )
}

/**
 * L1: the collection at a glance (rule A-2).
 *
 * With no detail open the full width is available, so show more columns —
 * enough information to decide which row to open.
 * The creation input sits at the bottom edge (same place and shape as the conversation composer).
 *
 * Once rows reach the hundreds, "see everything" stops working, so give the table
 * its own handles (column widths, sorting, filtering). They belong to **the table itself**,
 * not to a separate search screen.
 */
export function TaskOverview(): JSX.Element {
  const { WINDOW_BUTTONS_OVERHANG } = useWindowLayout()
  const snapshot = useStore((s) => s.snapshot)
  const layout = useStore((s) => s.layout)
  const section = useStore((s) => s.section)
  const toggleShowDone = useStore((s) => s.toggleShowDone)
  const cursorTaskId = useStore((s) => s.cursorTaskId)
  const moveCursor = useStore((s) => s.moveCursor)
  const openTask = useStore((s) => s.openTask)
  const landedTaskId = useStore((s) => s.landedTaskId)
  const pushToast = useStore((s) => s.pushToast)
  const markDoneAndAdvance = useStore((s) => s.markDoneAndAdvance)
  const openProjectSettings = useStore((s) => s.openProjectSettings)

  const savedWidths = useStore((s) => s.table.widths)
  const sort = useStore((s) => s.table.sort)
  const filters = useStore((s) => s.filters)
  const toggleSort = useStore((s) => s.toggleSort)
  const setSort = useStore((s) => s.setSort)
  const setFilters = useStore((s) => s.setFilters)
  const setColumnWidth = useStore((s) => s.setColumnWidth)
  const resetColumnWidth = useStore((s) => s.resetColumnWidth)
  const resetTableView = useStore((s) => s.resetTableView)

  const theme = useTheme()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const view = useTaskView()
  const tasks = view.ordered
  const projects = view.context.projects
  const runs = view.context.runs
  const positions = useMemo(
    () => queuePositions(snapshot?.tasks ?? [], projects),
    [snapshot?.tasks, projects]
  )
  const byId = useMemo(() => taskMap(snapshot?.tasks ?? []), [snapshot?.tasks])

  useEffect(() => {
    if (tasks.length === 0) return
    if (cursorTaskId && tasks.some((t) => t.id === cursorTaskId)) return
    void moveCursor(tasks[0].id)
  }, [tasks, cursorTaskId, moveCursor])

  const project = section.kind === 'project' ? projects.get(section.id) : undefined
  const title =
    section.kind === 'review'
      ? t('taskOverview.needsReview')
      : section.kind === 'project'
        ? (project?.name ?? t('taskOverview.projectFallback'))
        : t('taskOverview.allTasks')

  const crossProject = section.kind !== 'project'
  /* Done tasks never reach the review section. Don't show an item that does nothing when pressed */
  const canIncludeDone = section.kind !== 'review'
  const columns = useMemo(() => visibleColumns(crossProject), [crossProject])
  /* Widths handed to rows go in one object. Resolving per row defeats the memo */
  const widths = useMemo(() => resolveWidths(savedWidths), [savedWidths])

  /*
   * Use the sum of column widths as the table's minimum.
   *
   * The table is `table-layout: auto`, so when the window is too narrow it **ignores the
   * specified widths and crushes everything**. Crushed, even the 34px mark column gets an
   * ellipsis and the status mark is clipped (it actually was). With a minimum, the shortfall
   * becomes horizontal scroll and columns keep their specified widths.
   */
  const minWidth = useMemo(
    () => columns.reduce((sum, c) => sum + widths[c.id], 0) + ACTIONS_WIDTH,
    [columns, widths]
  )

  /* Keep the passed functions identity-stable so the row memo holds. If the once-a-second
     tick rebuilt every row, that alone would eat the time budget as rows grow */
  const orderedIds = useMemo(() => tasks.map((t) => t.id), [tasks])

  /*
   * Flatten group headers and rows into a single sequence.
   * Windowing (drawing only what's visible) needs a shape where position follows
   * from the index counted from the top.
   */
  const lines = useMemo<Line[]>(() => {
    const taskLines: Line[] = !view.groups ? tasks.map((task) => ({ kind: 'task', task })) : view.groups.flatMap((group): Line[] => [
      { kind: 'group', status: group.status, count: group.tasks.length },
      ...group.tasks.map((task): Line => ({ kind: 'task', task }))
    ])
    if (view.groups && view.rules.length > 0) {
      taskLines.push({ kind: 'group', status: 'recurring', count: view.rules.length })
    }
    return [...taskLines, ...view.rules.map((rule): Line => ({ kind: 'rule', rule }))]
  }, [tasks, view.groups, view.rules])

  const rowHeight = theme.density.row.xl
  const headHeight = theme.density.row.xs
  const offsets = useMemo(
    () => rowOffsets(lines.map((l) => (l.kind === 'group' ? GROUP_ROW_HEIGHT : rowHeight))),
    [lines, rowHeight]
  )
  const bodyRef = useRef<HTMLDivElement>(null)
  const range = useVisibleRange(bodyRef, offsets, headHeight)

  /*
   * When the cursor leaves the window, scroll to it.
   * Never let "↑↓ moves but the selected row is invisible" happen (with many rows it
   * inevitably goes out of view).
   *
   * **Only move when the cursor changed.** Following on sort/filter changes too would
   * mean "I re-sorted yet I'm stranded mid-list".
   */
  const cursorLine = cursorTaskId
    ? lines.findIndex((l) => l.kind === 'task' && l.task.id === cursorTaskId)
    : -1
  const followed = useRef<string | null>(null)
  useEffect(() => {
    const el = bodyRef.current
    if (!el || cursorLine < 0) return
    if (cursorTaskId === followed.current) return
    followed.current = cursorTaskId
    // The header is sticky, so the visible range starts below it
    if (offsets[cursorLine] < el.scrollTop) el.scrollTop = offsets[cursorLine]
    else if (headHeight + offsets[cursorLine + 1] > el.scrollTop + el.clientHeight) {
      el.scrollTop = headHeight + offsets[cursorLine + 1] - el.clientHeight
    }
  }, [cursorLine, cursorTaskId, headHeight, offsets])

  /* On sort/filter change, read from the top (the user pressed it to see what came first) */
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [sort, filters])

  const onOpen = useCallback((id: string) => void openTask(id), [openTask])
  /*
   * Right-click doesn't open the row. It's the entry to run/complete/delete without opening.
   * The OS draws it (`lib/menu.ts`) and the OS already knows where the pointer is.
   */
  const onMenu = useCallback(
    (id: string) => {
      void moveCursor(id)
      void contextMenu(taskMenuItems(id, { origin: 'list', ordered: orderedIds }))
    },
    [moveCursor, orderedIds]
  )
  /* Where there is no row (table margin, empty pane), offer operations on the list itself */
  const onSectionMenu = useCallback((e: MouseEvent): void => {
    if (claimContextMenu(e)) void contextMenu(sectionMenuItems())
  }, [])

  /*
   * Operations on a header column.
   *
   * With only mouse gestures (drag, click, chips) for width, sort, and filter,
   * **you can't even discover the operations exist**. Make them reachable from the
   * header, the column's own surface.
   */
  const onColumnMenu = useCallback(
    (column: TaskColumn): void => {
      const axis = column.filterAxis
      void contextMenu(
        columnMenuItems({
          column,
          sort,
          filter: axis
            ? {
              axis,
              options: filterOptions(axis, view.candidates, view.context),
              selected: filterValues(filters, axis),
              apply: (values) => setFilters(setFilterValues(filters, axis, values)),
              /* Same contents as what the chip opens (rule N-2-5) */
              extra: doneScopeItems({
                axis,
                available: canIncludeDone,
                included: filters.includeDone,
                toggle: toggleShowDone
              })
            }
            : undefined,
          resized: savedWidths[column.id] !== undefined,
          dirty: isTableViewDirty(sort, savedWidths, filters),
          setSort,
          resetWidth: () => resetColumnWidth(column.id),
          resetView: resetTableView
        })
      )
    },
    [
      canIncludeDone,
      filters,
      resetColumnWidth,
      resetTableView,
      savedWidths,
      setFilters,
      setSort,
      sort,
      toggleShowDone,
      view.candidates,
      view.context
    ]
  )
  const onDone = useCallback(
    (id: string) => void markDoneAndAdvance(id, orderedIds),
    [markDoneAndAdvance, orderedIds]
  )
  const onEnqueue = useCallback((id: string) => void window.quuu.tasks.enqueue(id), [])
  const onRun = useCallback(
    (id: string): void => {
      void (async () => {
        const result = await window.quuu.tasks.runNow(id)
        if (!result.ok) {
          pushToast({
            id: `run-${Date.now()}`,
            level: 'warn',
            message: t('taskOverview.runRejected'),
            detail: result.reason
          })
        }
      })()
    },
    [pushToast]
  )

  // The width-absorbing column (FillerCell) and the actions column also count into the group header's colSpan
  const colSpan = columns.length + 2

  const renderRow = (task: Task): JSX.Element => (
    <TaskRow
      key={task.id}
      task={task}
      project={projects.get(task.projectId)}
      showProject={crossProject}
      widths={widths}
      agent={view.context.agentLabel(task)}
      state={stateText(task, runs.get(task.id), positions.get(task.id), now, byId)}
      tone={stateTone(task, byId)}
      lastRun={lastRunText(runs.get(task.id), now)}
      selected={task.id === cursorTaskId}
      flashing={task.id === landedTaskId}
      onOpen={onOpen}
      onMenu={onMenu}
      onRun={onRun}
      onDone={onDone}
      onEnqueue={onEnqueue}
    />
  )

  return (
    <Panel surface="canvas" windowHeader grow onContextMenu={onSectionMenu} {...motionRegion('collection', 'left')}>
      <PanelHeader startInset={layout.railCollapsed ? WINDOW_BUTTONS_OVERHANG : undefined}>
        {project && <Dot color={project.color} />}
        <PanelHeading title={title} count={tasks.length}><span {...motionAnchor('heading')}>{title}</span></PanelHeading>
        {/* The band's empty space is a window-drag surface. The window has no title bar, so give that back here */}
        <WindowDragArea />
        {/* The band's right edge is this pane's settings. Table appearance (sort, filter) belongs to the bar below */}
        {project && (
          <IconButton
            title={t('taskOverview.projectSettings')}
            icon={<Settings size={ICON.md} {...iconProps} />}
            onClick={() => openProjectSettings(true)}
          />
        )}
      </PanelHeader>

      {/*
        If done tasks are hidden, show the bar even when the range has 0 items.
        Without it there is no path to "show done too", and a section where everything
        is done becomes impossible to get back from
      */}
      {(view.total > 0 || view.doneHidden > 0) && (
        <TaskFilterBar
          candidates={view.candidates}
          context={view.context}
          matched={tasks.length}
          total={view.total}
          crossProject={crossProject}
          canIncludeDone={canIncludeDone}
        />
      )}

      {/*
        The list itself is a keyboard widget (rule A-2's L1, made traversable by hand).
        Catching ↑↓ at the window so it "works wherever focus is" dies silently the
        moment focus is in an input. Let the pane hold focus and answer only while it does
      */}
      <PanelBody
        ref={bodyRef}
        {...pane('list', { tab: true })}
        role="listbox"
        aria-label={t('taskOverview.listLabel', { title })}
        aria-activedescendant={cursorTaskId ? taskRowId(cursorTaskId) : undefined}
        onKeyDown={(e) => runTaskListKey(e, tasks)}
      >
        {lines.length === 0 ? (
          /*
            Don't write "do this to fill it" on an empty pane (rule Q).
            If you can go back, offer the way back; if you can add, offer the add. An empty
            with no handle (needs review) stays empty — that pane doesn't fill because a
            human did something
          */
          view.narrowed ? (
            <EmptyState
              title={t('taskOverview.emptyFiltered')}
              action={{ label: t('taskOverview.resetView'), onClick: resetTableView }}
            />
          ) : (
            <EmptyState
              title={section.kind === 'review' ? t('taskOverview.emptyReview') : t('taskOverview.emptyTasks')}
              action={
                section.kind === 'review'
                  ? undefined
                  : { label: t('taskOverview.addTask'), onClick: () => focusAny('composer') }
              }
            />
          )
        ) : (
          <DataTable minWidth={minWidth}>
            <DataTableHead>
              <DataTableHeadRow>
                {/*
                  Keep attribute columns next to the identifier; FillerCell absorbs whatever
                  widening the window adds. That's also why the task name gets a width. Without
                  one this column soaks up all the slack, an empty band opens between name and
                  attributes, and reading one row means sweeping your eyes across it
                */}
                {columns.map((column, i) => {
                  const key = column.sortKey
                  return (
                    <HeadCell
                      key={column.id}
                      width={widths[column.id]}
                      edge={i === 0 ? 'start' : undefined}
                      /* The header band is the column's surface. Right-click answers about that column (rule N-2) */
                      onContextMenu={(e) => {
                        if (claimContextMenu(e)) onColumnMenu(column)
                      }}
                    >
                      {key ? (
                        <SortLabel
                          direction={sort?.key === key ? sort.direction : null}
                          title={t('taskOverview.sortBy', { column: column.label })}
                          onToggle={() => toggleSort(key)}
                        >
                          {column.label}
                        </SortLabel>
                      ) : (
                        column.label
                      )}
                      {column.resizable && (
                        <ColumnResizer
                          value={widths[column.id]}
                          min={column.min}
                          max={COLUMN_MAX_WIDTH}
                          onChange={(w) => setColumnWidth(column.id, w)}
                          onReset={() => resetColumnWidth(column.id)}
                        />
                      )}
                    </HeadCell>
                  )
                })}
                <HeadCell />
                <HeadCell width={ACTIONS_WIDTH} edge="end" />
              </DataTableHeadRow>
            </DataTableHead>

            {/*
              Draw only what fits on screen. SpacerRow holds the height of undrawn rows,
              so the scroll thumb still behaves as if all rows were there.
              Group headers line up as rows in the same column (absent while sorting,
              since there are no groups then)
            */}
            <DataTableBody>
              {range.padTop > 0 && <SpacerRow height={range.padTop} colSpan={colSpan} />}
              {lines
                .slice(range.start, range.end)
                .map((line) =>
                  line.kind === 'group' ? (
                    <TableGroupRow
                      key={`group-${line.status}`}
                      label={<span {...motionAnchor(`group-${line.status}`)}>{line.status === 'recurring' ? t('taskRules.recurringSection') : TASK_STATUS_LABEL[line.status]}</span>}
                      count={line.count}
                      colSpan={colSpan}
                    />
                  ) : line.kind === 'rule' ? (
                    <RecurringTaskTableRow key={line.rule.id} rule={line.rule}
                      project={projects.get(line.rule.projectId)} showProject={crossProject} widths={widths} />
                  ) : (
                    renderRow(line.task)
                  )
                )}
              {range.padBottom > 0 && <SpacerRow height={range.padBottom} colSpan={colSpan} />}
            </DataTableBody>
          </DataTable>
        )}
      </PanelBody>

      {section.kind !== 'review' && (
        <TaskComposer fixedProjectId={section.kind === 'project' ? section.id : undefined} />
      )}
    </Panel>
  )
}

type ResolvedWidths = Record<TaskColumnId, number>

function resolveWidths(saved: ColumnWidths): ResolvedWidths {
  const out = {} as ResolvedWidths
  for (const column of visibleColumns(true)) out[column.id] = columnWidth(column.id, saved)
  return out
}

interface TaskRowProps {
  task: Task
  project: Project | undefined
  showProject: boolean
  widths: ResolvedWidths
  agent: string
  state: string
  tone: CellTone
  lastRun: string
  selected: boolean
  flashing: boolean
  onOpen(id: string): void
  onMenu(id: string): void
  onRun(id: string): void
  onDone(id: string): void
  onEnqueue(id: string): void
}

/**
 * One row.
 *
 * **Memoized so the clock recompute doesn't rebuild rows.** Elapsed time updates every
 * second, but only running rows get a new value; the rest produce the same string.
 * With hundreds of rows, skipping this memo means everything redraws every second
 * while nothing is happening.
 */
const TaskRow = memo(function TaskRow({
  task,
  project,
  showProject,
  widths,
  agent,
  state,
  tone,
  lastRun,
  selected,
  flashing,
  onMenu,
  onOpen,
  onRun,
  onDone,
  onEnqueue
}: TaskRowProps): JSX.Element {
  return (
    <DataRow
      id={taskRowId(task.id)}
      role="option"
      aria-selected={selected}
      selected={selected}
      flashing={flashing}
      dimmed={task.status === 'done'}
      /*
       * Clicking anywhere on the row opens it (rule A-2: L2 opens only via selection in L1).
       * Inserting a select-only step buys nothing — there's nothing else to do with a
       * selected row. To act without opening, right-click (menu) and the buttons at the
       * right edge take it
       */
      onClick={() => onOpen(task.id)}
      /* Over an input (`claimContextMenu` returns false), yield to the OS edit menu */
      onContextMenu={(e) => {
        if (claimContextMenu(e)) onMenu(task.id)
      }}
    >
      <DataCell width={widths.mark} edge="start" clip>
        <StatusDot status={task.status} />
      </DataCell>
      {/* CellButton renders the ellipsis. Truncating here too would put two `…` in a row */}
      <DataCell clip>
        {/* The row handles opening, so this only carries the pressable shape and the truncated full text (title) */}
        {/*
          Buttons inside a row stay off the ⇥ order (`tabIndex={-1}`).
          With hundreds of rows, tabbing past the list alone takes hundreds of presses,
          and "⇥ to the next pane" stops working. The list handles row operations
          (↑↓ ⏎ ⌘⌥⏎); the pointer can still press this as before
        */}
        <CellButton
          {...motionAnchor(task.id)}
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            onOpen(task.id)
          }}
          title={task.title}
        >
          {task.title}
        </CellButton>
        {holdsSlot(task) && (
          <InlineMarker title={t('taskOverview.holdMarker')}>
            <Lock size={ICON.sm} {...iconProps} />
          </InlineMarker>
        )}
        {!task.prompt.trim() && !task.sessionId && (
          <InlineNote size="xs" tone="tertiary">
            {t('taskOverview.noInstructions')}
          </InlineNote>
        )}
      </DataCell>
      {showProject && (
        <DataCell width={widths.project} tone="muted">
          {/* td is table-cell, so things laid side by side go in a flex container */}
          <Row gap="icon" min>
            <Dot color={project?.color} muted={!project} />
            <Text truncate>{project?.name ?? '—'}</Text>
          </Row>
        </DataCell>
      )}
      <DataCell width={widths.priority}>
        <PriorityText level={task.priority}>
          {task.priority === 2 ? '' : PRIORITY_LABEL[task.priority as Priority]}
        </PriorityText>
      </DataCell>
      <DataCell width={widths.agent} tone="muted">
        {agent}
      </DataCell>
      {/*
        Failure reasons always get cut by the column width. Restore what was truncated via
        title (rule K-1). Taking the whole thing out is the row's right-click ("copy failure reason")
      */}
      <DataCell
        width={widths.state}
        tone={tone}
        title={task.status === 'failed' ? state : undefined}
      >
        {state}
      </DataCell>
      <DataCell width={widths.lastRun} tone="muted">
        {lastRun}
      </DataCell>
      <FillerCell />
      <DataCell width={ACTIONS_WIDTH} edge="end">
        {/* Rule E: operations with heavy consequences get labels. Never icon-only. */}
        <RowActions>
          {task.status === 'held' && (
            <Button
              size="xs"
              tabIndex={-1}
              title={t('taskOverview.enqueueTitle')}
              onClick={(e) => {
                e.stopPropagation()
                onEnqueue(task.id)
              }}
            >
              {t('taskOverview.enqueue')}
            </Button>
          )}
          {task.status !== 'running' && task.status !== 'done' && (
            <Button
              size="xs"
              tabIndex={-1}
              title={t('taskOverview.runTitle')}
              onClick={(e) => {
                e.stopPropagation()
                onRun(task.id)
              }}
            >
              {t('taskOverview.run')}
            </Button>
          )}
          {(task.status === 'review' || task.status === 'failed') && (
            <Button
              size="xs"
              color="success"
              tabIndex={-1}
              title={t('taskOverview.doneTitle')}
              onClick={(e) => {
                e.stopPropagation()
                onDone(task.id)
              }}
            >
              {t('taskOverview.done')}
            </Button>
          )}
        </RowActions>
      </DataCell>
    </DataRow>
  )
})

/**
 * Whether the state column gets color.
 *
 * **Ink only failures and in-progress** (`02-ui-design.md` §1.4).
 * What review shows is a time, "26 minutes ago" — not a warning.
 * Coloring the list's most common state would tint most rows and color would stop
 * being a signal. That a task awaits review is already said by the mark at the left
 * edge and the group header.
 */
function stateTone(task: Task, byId: Map<string, Task>): CellTone {
  if (task.status === 'failed') return 'danger'
  if (task.status === 'running') return 'info'
  if (task.status === 'held') return 'muted'
  if (task.status === 'queued' && !dependencySatisfied(task, byId)) return 'quiet'
  return 'default'
}

function stateText(
  task: Task,
  run: Run | undefined,
  queuePos: number | undefined,
  now: number,
  byId: Map<string, Task>
): string {
  switch (task.status) {
    case 'queued': {
      const blockers = blockingTasks(task, byId)
      if (blockers.length > 0) {
        // Can't list everything being waited on, so show the first one plus a remainder count
        return blockers.length > 1
          ? t('taskOverview.waitingMore', { title: blockers[0].title, count: blockers.length - 1 })
          : t('taskOverview.waiting', { title: blockers[0].title })
      }
      // Off the queue until its time comes (a schedule a human set, or an agent's Limit).
      // Showing a queue number here would promise a turn at the next free slot that is not coming
      if (task.scheduledAt !== null && Date.parse(task.scheduledAt) > now) {
        return t('taskOverview.waitingUntil', { time: clockOrDate(task.scheduledAt, now) })
      }
      return queuePos ? t('taskOverview.queuePosition', { position: queuePos }) : TASK_STATUS_LABEL.queued
    }
    case 'held':
      return t('taskOverview.offQueue')
    case 'running':
      return run
        ? t('taskOverview.runningFor', { duration: duration(run.startedAt, null, now) })
        : RUN_STATUS_LABEL.starting
    case 'review':
      return relativeTime(run?.endedAt ?? task.updatedAt, now)
    case 'failed':
      return run?.errorMessage ? run.errorMessage : TASK_STATUS_LABEL.failed
    case 'done':
      return relativeTime(task.doneAt ?? task.updatedAt, now)
    default:
      return '—'
  }
}

function lastRunText(run: Run | undefined, now: number): string {
  if (!run) return '—'
  const label = RUN_STATUS_LABEL[run.status]
  if (run.status === 'running' || run.status === 'starting') {
    return `${label} ${duration(run.startedAt, null, now)}`
  }
  return `${label} · ${clockTime(run.endedAt ?? run.startedAt)}`
}
