import type { MenuItemSpec } from '@design-system/react'
import type { DependsMode, Task, TaskDependency } from '../../../preload/api/tasks.js'
import { t } from '../model/i18n/index.js'
import { DEPENDS_MODE_LABEL } from '../model/labels.js'
import { useStore } from '../state/store.js'

import type { LinkDirection, NewTaskLink } from '../model/taskLinkModel.js'
import { LINK_DIRECTION_LABEL } from '../model/taskLinkModel.js'
export { LINK_DIRECTION_LABEL, LINK_SUFFIX_LABEL, type LinkDirection, type NewTaskLink } from '../model/taskLinkModel.js'

/**
 * Open the queueing surface. If the task is to be linked, pass the link spec
 * with it.
 *
 * The queueing surface differs by screen (the composer at the bottom of the
 * full-width table; the list's one-line input while the detail is open), so
 * open with **a signal that reaches whichever is present**. Same path as
 * `⌘N`.
 *
 * Passing `null` means "queue a task with no link". A previously chosen spec
 * lingering onto the next task quietly creates queueing nobody asked for.
 */
export function startNewTask(link: NewTaskLink | null): void {
  const state = useStore.getState()
  state.setNewTaskLink(link)

  // In a surface that can't queue, move to one that can (review and settings have no queueing entry)
  if (state.section.kind === 'settings' || state.section.kind === 'review') {
    state.setSection({ kind: 'all' })
  }
  // Don't close the detail. Never lose what was being read in order to queue (same as ⌘N)
  if (state.detailOpen && state.layout.listMode === 'hidden') {
    state.setLayout({ listMode: 'compact' })
  }

  /*
   * Queue into the linked task's project.
   * A task in another project can be made to wait, but landing in a
   * destination you never chose is the bigger accident. Read this as
   * "choosing the other task = choosing the destination".
   */
  const other = link && state.snapshot?.tasks.find((t) => t.id === link.taskId)
  if (other) state.setTargetProject(other.projectId)

  // Call after the surfaces have swapped (setLayout / setSection above need a redraw)
  setTimeout(() => window.dispatchEvent(new CustomEvent('quuu:focus-quickadd')), 0)
}

/**
 * The link currently held, and the task on the other end.
 *
 * If the other task is gone, return **no link**. A spec waiting on a deleted
 * task is meaningless to attach, and a leftover chip makes "what is this
 * waiting for" unreadable.
 */
export function useNewTaskLink(): { link: NewTaskLink; task: Task } | null {
  const link = useStore((s) => s.newTaskLink)
  const tasks = useStore((s) => s.snapshot?.tasks)
  if (!link) return null
  const task = tasks?.find((t) => t.id === link.taskId)
  return task ? { link, task } : null
}

/** Predecessors passed at creation. Has a value only when the new task is the waiting side (`after`). */
export function linkDependsOn(link: NewTaskLink | null): TaskDependency[] | undefined {
  return link?.direction === 'after' ? [{ taskId: link.taskId, mode: link.mode }] : undefined
}

/**
 * Attach a link where the other task is the one waiting (`before`), after creation.
 *
 * This direction alone rewrites the other task, so it can't finish in the one create call.
 * Append to that task's current prerequisites so its existing links aren't erased.
 */
export async function attachNewTaskLink(
  createdTaskId: string,
  link: NewTaskLink | null
): Promise<void> {
  if (link?.direction !== 'before') return
  const state = useStore.getState()
  /*
   * Never stay quiet about a link that couldn't be made. The task did get queued, so going
   * unnoticed leaves one task you believe is running in the order you asked for.
   */
  const failed = (): void =>
    state.pushToast({
      id: `link-${Date.now()}`,
      level: 'warn',
      message: t('taskLink.linkFailed'),
      taskId: createdTaskId
    })

  const other = state.snapshot?.tasks.find((t) => t.id === link.taskId)
  if (!other) {
    failed()
    return
  }
  try {
    await window.quuu.tasks.update({
      id: other.id, patch: {
        dependsOn: [...other.dependsOn, { taskId: createdTaskId, mode: link.mode }]
      }
    })
  } catch {
    failed()
  }
}

/**
 * The menu opened from the chip on the queueing surface.
 * Just three things: re-pick the direction, re-pick the waiting condition, and drop the link.
 */
export function newTaskLinkItems(link: NewTaskLink, title: string): MenuItemSpec[] {
  const setLink = useStore.getState().setNewTaskLink
  return [
    { label: title, disabled: true },
    ...(['after', 'before'] as LinkDirection[]).map((direction) => ({
      label: LINK_DIRECTION_LABEL[direction],
      checked: direction === link.direction,
      onSelect: () => setLink({ ...link, direction })
    })),
    ...(['done', 'finished'] as DependsMode[]).map((mode, i) => ({
      label: DEPENDS_MODE_LABEL[mode],
      separatorBefore: i === 0,
      checked: mode === link.mode,
      onSelect: () => setLink({ ...link, mode })
    })),
    {
      label: t('taskLink.removeLink'),
      separatorBefore: true,
      onSelect: () => setLink(null)
    }
  ]
}
