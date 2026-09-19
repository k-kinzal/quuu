import {
  Button,
  COLLAPSE_HANDLE_WIDTH,
  IconButton,
  InlineInput,
  Menu,
  Panel,
  PanelHeader,
  PanelHeaderLead,
  PanelHeaderTrail,
  WindowDragArea,
  claimContextMenu,
  useMenu,
  motionRegion
} from '@design-system/react'
import { useEffect, useRef, useState } from 'react'
import type { Task } from '../../../preload/api/tasks.js'
import { contextMenu } from '../interaction/menu.js'
import { useOrderedTasks } from '../interaction/useTasks.js'
import { useWindowLayout } from '../interaction/useWindowLayout.js'
import { isImeComposing } from '../model/composer.js'
import { t } from '../model/i18n/index.js'
import { useStore } from '../state/store.js'
import { Check, ICON, Inbox, MoreHorizontal, Play, Undo2, X, iconProps } from '../ui/icons.js'
import { taskMenuItems } from './TaskMenu.js'
import { TaskWorkbench } from './TaskWorkbench.js'

/**
 * The L2 entity (rules A-2 / B / C).
 *
 *   Center = the conversation (the lead) / Right = the inspector (attributes)
 *   Keep frequent task actions visible in the header; sending back is the composer's
 *   job at the end of the conversation.
 */
export function TaskWorkspace({ task }: { task: Task }): JSX.Element {
  const { WINDOW_BUTTONS_OVERHANG } = useWindowLayout()
  const snapshot = useStore((s) => s.snapshot)
  const closeDetail = useStore((s) => s.closeDetail)
  const layout = useStore((s) => s.layout)
  const markDoneAndAdvance = useStore((s) => s.markDoneAndAdvance)
  const refreshRuns = useStore((s) => s.refreshRuns)
  const pushToast = useStore((s) => s.pushToast)
  const ordered = useOrderedTasks()

  const [title, setTitle] = useState(task.title)
  /* The `⋯` menu. Anchored to the button pressed (not the right-click container) */
  const more = useMenu()
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => setTitle(task.title), [task.id, task.title])

  const project = snapshot?.projects.find((p) => p.id === task.projectId)
  const reviewable = task.status === 'review' || task.status === 'failed'

  const commitTitle = (): void => {
    const next = title.trim()
    if (next.length === 0) {
      setTitle(task.title)
      return
    }
    if (next !== task.title) void window.quuu.tasks.update({ id: task.id, patch: { title: next } })
  }

  /*
   * Use the same contents as a list row. Assembling this one separately would make what
   * you can do to one task depend on where you opened it from
   */
  const menuItems = (): ReturnType<typeof taskMenuItems> =>
    taskMenuItems(task.id, { origin: 'detail', ordered: ordered.map((t) => t.id) })

  const runNow = async (): Promise<void> => {
    const result = await window.quuu.tasks.runNow(task.id)
    if (!result.ok) {
      pushToast({
        id: `run-${Date.now()}`,
        level: 'warn',
        message: t('workspace.runFailed'),
        detail: result.reason
      })
    }
    await refreshRuns(task.id)
  }

  return (
    <Panel surface="canvas" windowHeader grow {...motionRegion(`detail-${task.id}`, 'right')}>
      {/*
        Right-clicking anywhere in the header raises the same menu as `⋯`.
        "Summonable on the thing itself" is what a context menu means, so don't make anyone
        hunt for three dots (over the title input alone, yield to the OS's edit menu)
      */}
      <PanelHeader
        size="lg"
        leadingColumn
        trailingColumn
        startInset={
          layout.railCollapsed && layout.listMode === 'hidden'
            ? WINDOW_BUTTONS_OVERHANG - COLLAPSE_HANDLE_WIDTH
            : undefined
        }
        onContextMenu={(e) => {
          if (claimContextMenu(e)) void contextMenu(menuItems())
        }}
      >
        <PanelHeaderLead>
          <IconButton
            title={t('workspace.closeTitle')}
            icon={<X size={ICON.md} {...iconProps} />}
            onClick={closeDetail}
          />
        </PanelHeaderLead>
        {/* Rule K-1: the header is a one-line surface. Truncate rather than wrap, and let title give the full text back */}
        <InlineInput
          ref={titleRef}
          type="text"
          value={title}
          title={task.title}
          spellCheck={false}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            /* Never mistake committing an IME conversion for "commit / discard the edit" */
            if (isImeComposing(e)) return
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setTitle(task.title)
              e.currentTarget.blur()
            }
          }}
        />

        {/* The empty part of the bar is a drag surface. It gives back what the window loses by having no title bar */}
        <WindowDragArea />

        {task.status === 'held' && (
          <Button
            title={t('workspace.enqueueTitle')}
            startIcon={<Inbox size={ICON.sm} {...iconProps} />}
            onClick={() => void window.quuu.tasks.enqueue(task.id)}
          >
            {t('workspace.enqueue')}
          </Button>
        )}

        {task.status === 'queued' && (
          <Button
            title="⌘R"
            startIcon={<Play size={ICON.sm} {...iconProps} />}
            onClick={() => void runNow()}
          >
            {t('workspace.runNow')}
          </Button>
        )}

        {reviewable && (
          <Button
            color="success"
            title={t('workspace.markDoneTitle')}
            startIcon={<Check size={ICON.sm} {...iconProps} />}
            onClick={() =>
              void markDoneAndAdvance(
                task.id,
                ordered.map((t) => t.id)
              )
            }
          >
            {t('workspace.markDone')}
          </Button>
        )}

        {task.status === 'done' && (
          <Button
            startIcon={<Undo2 size={ICON.sm} {...iconProps} />}
            onClick={() => void window.quuu.tasks.reopen(task.id)}
          >
            {t('workspace.reopen')}
          </Button>
        )}

        {/*
          A menu opened by pressing is a surface anchored to the button pressed (`Menu`).
          Don't reuse the right-click container (the OS menu) — that container IS the
          vocabulary "the thing that appears on right-click", and moving it elsewhere
          doesn't make it something else
        */}
        <PanelHeaderTrail>
          <IconButton
            title={t('workspace.moreTitle')}
            menu
            aria-expanded={more.isOpen}
            icon={<MoreHorizontal size={ICON.md} {...iconProps} />}
            onClick={more.open}
          />
        </PanelHeaderTrail>
        <Menu
          open={more.isOpen}
          anchorEl={more.anchorEl}
          onClose={more.close}
          items={menuItems}
          label={t('workspace.menuLabel')}
        />
      </PanelHeader>

      <TaskWorkbench task={task} project={project} />
    </Panel>
  )
}
