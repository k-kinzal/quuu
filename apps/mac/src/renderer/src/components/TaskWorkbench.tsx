import {
  ActivityBar,
  IconButton,
  MotionLayout,
  PaneStack,
  Panel,
  Resizer,
  Spacer,
  StackResizer,
  WorkbenchPane,
  WorkbenchPaneBody,
  WorkbenchPaneHeader,
  motionRegion
} from '@design-system/react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { Project } from '../../../preload/api/projects.js'
import type { ReviewFile, ReviewFileRequest } from '../../../preload/api/review.js'
import type { Task } from '../../../preload/api/tasks.js'
import { useReviewSnapshot } from '../interaction/useReviewSnapshot.js'
import type { InspectorTool, WorkTool } from '../interaction/workbench.js'
import { inspectorTools, useWorkbenchLayout, visibleInspectorTools } from '../interaction/workbench.js'
import { t } from '../model/i18n/index.js'
import { useStore } from '../state/store.js'
import { ChartNoAxesColumnIncreasing, Code2, ICON, ListChecks, MessageSquareText, Settings2, Terminal, X, iconProps } from '../ui/icons.js'
import { CodeStructurePane } from './CodeStructurePane.js'
import { CoveragePane } from './CoveragePane.js'
import { Inspector } from './Inspector.js'
import { ProjectTasksPane } from './ProjectTasksPane.js'
import type { ReviewReveal } from './TaskMainPane.js'
import { TaskMainPane } from './TaskMainPane.js'
import type { TerminalRunRequest } from './TerminalPane.js'
import { TerminalPane } from './TerminalPane.js'

const WORK_LABEL: Record<WorkTool, string> = {
  main: t('taskWorkbench.work.main'),
  terminal: t('taskWorkbench.work.terminal')
}

const INSPECTOR_LABEL: Record<InspectorTool, string> = {
  task: t('taskWorkbench.inspector.task'),
  symbols: t('taskWorkbench.inspector.symbols'),
  coverage: t('taskWorkbench.inspector.coverage'),
  'project-tasks': t('taskWorkbench.inspector.project-tasks')
}

function workIcon(id: WorkTool): JSX.Element {
  if (id === 'main') return <MessageSquareText size={ICON.md} {...iconProps} />
  return <Terminal size={ICON.md} {...iconProps} />
}

function inspectorIcon(id: InspectorTool): JSX.Element {
  if (id === 'task') return <Settings2 size={ICON.md} {...iconProps} />
  if (id === 'symbols') return <Code2 size={ICON.md} {...iconProps} />
  if (id === 'coverage') return <ChartNoAxesColumnIncreasing size={ICON.md} {...iconProps} />
  return <ListChecks size={ICON.md} {...iconProps} />
}

function paneShare<T extends string>(sizes: Record<T, number>, before: T, after: T): number {
  return sizes[before] / (sizes[before] + sizes[after])
}

/** Task details stay available across the main and terminal surfaces. */
export function TaskWorkbench({ task, project }: { task: Task; project: Project | undefined }): JSX.Element {
  const appLayout = useStore((state) => state.layout)
  const setAppLayout = useStore((state) => state.setLayout)
  const pushToast = useStore((state) => state.pushToast)
  const dock = useWorkbenchLayout()

  const [reviewFile, setReviewFile] = useState<ReviewFile | null>(null)
  const [requestedLine, setRequestedLine] = useState<{ line: number } | null>(null)
  const [reviewReveal, setReviewReveal] = useState<ReviewReveal | null>(null)

  const [terminalRunRequest, setTerminalRunRequest] = useState<TerminalRunRequest | null>(null)

  const selectReviewFile = useCallback((file: ReviewFile | null): void => {
    setReviewFile(file)
    setRequestedLine(null)
  }, [])

  useEffect(() => {
    setReviewFile(null)
    setRequestedLine(null)
    setReviewReveal(null)
  }, [task.id])

  const shownInspectors = visibleInspectorTools(dock.layout)
  const needsProjectData =
    dock.layout.visibleWork.includes('main') ||
    shownInspectors.some((id) => id === 'coverage' || id === 'project-tasks' || id === 'symbols')

  const { snapshot, loading: snapshotLoading, error: snapshotError, refresh: loadReview } =
    useReviewSnapshot(task.id, needsProjectData)

  const reportTerminalError = useCallback(
    (caught: unknown): void => {
      pushToast({
        id: `terminal-${Date.now()}`,
        level: 'warn',
        message: t('taskWorkbench.terminalFailed'),
        detail: caught instanceof Error ? caught.message : String(caught)
      })
    },
    [pushToast]
  )

  const runProjectTask = (id: string): void => {
    dock.openWork('terminal')
    setTerminalRunRequest({ id, nonce: Date.now() })
  }

  const revealCoverage = (path: string, line: number | null): void => {
    const request: ReviewFileRequest = { source: 'working', path }
    dock.openWork('main')
    setReviewReveal({ request, line, nonce: Date.now() })
  }

  const workItems = useMemo(
    () =>
      dock.layout.workOrder.map((id) => ({
        id,
        label: WORK_LABEL[id],
        icon: workIcon(id),
        badge:
          id === 'main' &&
            (snapshot?.changes.length ?? 0) + (snapshot?.pullRequests.length ?? 0) > 0
            ? 'dot' as const
            : undefined
      })),
    [dock.layout.workOrder, snapshot?.changes.length, snapshot?.pullRequests.length]
  )

  const availableInspectors = inspectorTools(dock.layout.activeWork)
  const inspectorItems = dock.layout.inspectorOrder
    .filter((id) => availableInspectors.includes(id))
    .map((id) => ({ id, label: INSPECTOR_LABEL[id], icon: inspectorIcon(id) }))
  const shownWork = dock.layout.workOrder.filter((id) => dock.layout.visibleWork.includes(id))

  const toggleInspector = (id: string): void => {
    const inspector = id as InspectorTool
    const closing = shownInspectors.includes(inspector)
    dock.toggleInspector(inspector)
    if (closing && shownInspectors.length === 1) setAppLayout({ inspectorOpen: false })
    else if (!closing && !appLayout.inspectorOpen) setAppLayout({ inspectorOpen: true })
  }

  const inspectorBody = (id: InspectorTool): JSX.Element => {
    if (id === 'task') {
      return <Inspector task={task} project={project} width={appLayout.inspector} embedded />
    }
    if (id === 'symbols') {
      return (
        <CodeStructurePane
          file={reviewFile}
          requestedLine={requestedLine?.line ?? null}
          onLine={(line) => {
            dock.openWork('main')
            setRequestedLine({ line })
          }}
        />
      )
    }
    if (id === 'coverage') {
      return <CoveragePane coverage={snapshot?.coverage ?? null} onReveal={revealCoverage} />
    }
    return (
      <ProjectTasksPane
        tasks={snapshot?.projectTasks ?? []}
        onRun={runProjectTask}
      />
    )
  }

  return (
    <MotionLayout
      motionKey={`${shownWork.join(',')}:${appLayout.inspectorOpen}:${shownInspectors.join(',')}`}
      contextKey={task.id}
    >
      <ActivityBar
        label={t('taskWorkbench.workArea')}
        items={workItems}
        visibleIds={dock.layout.visibleWork}
        activeId={dock.layout.visibleWork.includes(dock.layout.activeWork) ? dock.layout.activeWork : null}
        onToggle={(id) => dock.toggleWork(id as WorkTool)}
        onReorder={dock.reorderWork}
      />

      <PaneStack>
        {shownWork.map((id, index) => {
          const previous = shownWork[index - 1]
          return (
            <Fragment key={id}>
              {previous && (
                <StackResizer
                  value={paneShare(dock.layout.workSizes, previous, id)}
                  label={t('taskWorkbench.paneHeights', { first: WORK_LABEL[previous], second: WORK_LABEL[id] })}
                  onChange={(share) => dock.resizeWork(previous, id, share)}
                />
              )}
              <WorkbenchPane
                {...motionRegion(`work-${id}`, id === 'terminal' ? 'bottom' : 'left')}
                grow={dock.layout.workSizes[id]}
                onMouseDown={() => dock.focusWork(id)}
              >
                <WorkbenchPaneBody>
                  {id === 'main' && (
                    <TaskMainPane
                      key={task.id}
                      task={task}
                      project={project}
                      snapshot={snapshot}
                      loading={snapshotLoading}
                      error={snapshotError}
                      requestedLine={requestedLine}
                      reveal={reviewReveal}
                      onRefresh={() => void loadReview()}
                      onFile={selectReviewFile}
                    />
                  )}
                  {id === 'terminal' && (
                    <TerminalPane
                      key={task.id}
                      taskId={task.id}
                      cwd={snapshot?.cwd ?? project?.path ?? ''}
                      runRequest={terminalRunRequest}
                      onRunHandled={(nonce) => {
                        setTerminalRunRequest((current) => current?.nonce === nonce ? null : current)
                      }}
                      onError={reportTerminalError}
                    />
                  )}
                </WorkbenchPaneBody>
              </WorkbenchPane>
            </Fragment>
          )
        })}
      </PaneStack>

      {appLayout.inspectorOpen && shownInspectors.length > 0 && (
        <>
          <Resizer
            value={appLayout.inspector}
            profile="inspector"
            invert
            onChange={(inspector) => setAppLayout({ inspector })}
          />
          <Panel width={appLayout.inspector} surface="default" bordered="left" {...motionRegion('inspector', 'right')}>
            <MotionLayout direction="vertical" motionKey={shownInspectors.join(',')} contextKey={task.id}>
              {shownInspectors.map((id, index) => {
                const previous = shownInspectors[index - 1]
                return (
                  <Fragment key={id}>
                    {previous && (
                      <StackResizer
                        value={paneShare(dock.layout.inspectorSizes, previous, id)}
                        label={t('taskWorkbench.paneHeights', { first: INSPECTOR_LABEL[previous], second: INSPECTOR_LABEL[id] })}
                        onChange={(share) => dock.resizeInspectors(previous, id, share)}
                      />
                    )}
                    <WorkbenchPane grow={dock.layout.inspectorSizes[id]} surface="default" {...motionRegion(id, 'right')}>
                      <WorkbenchPaneHeader>
                        {inspectorIcon(id)}
                        <span>{INSPECTOR_LABEL[id]}</span>
                        <Spacer />
                        <IconButton
                          size="xs"
                          title={t('taskWorkbench.closeInspector', { name: INSPECTOR_LABEL[id] })}
                          icon={<X size={ICON.sm} {...iconProps} />}
                          onClick={() => dock.closeInspector(id)}
                        />
                      </WorkbenchPaneHeader>
                      <WorkbenchPaneBody>{inspectorBody(id)}</WorkbenchPaneBody>
                    </WorkbenchPane>
                  </Fragment>
                )
              })}
            </MotionLayout>
          </Panel>
        </>
      )}

      <ActivityBar
        label={t('taskWorkbench.infoArea')}
        side="right"
        items={inspectorItems}
        visibleIds={appLayout.inspectorOpen ? shownInspectors : []}
        onToggle={toggleInspector}
        onReorder={dock.reorderInspectors}
      />
    </MotionLayout>
  )
}
