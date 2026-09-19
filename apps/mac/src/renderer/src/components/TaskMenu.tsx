import type { MenuItemSpec } from '@design-system/react'
import type { Priority } from '../../../preload/api/tasks.js'
import { confirmDestructive, copyItem, group } from '../interaction/contextMenu.js'
import { copyWorkingDirItem, openWithItems } from '../interaction/openWith.js'
import { startNewTask } from '../interaction/taskLink.js'
import { t } from '../model/i18n/index.js'
import { PRIORITY_LABEL } from '../model/labels.js'
import type { LinkDirection } from '../model/taskLinkModel.js'
import { LINK_DIRECTION_LABEL } from '../model/taskLinkModel.js'
import { useStore } from '../state/store.js'

import { latestRunMap } from '../model/derive.js'

/**
 * What can be done to a single task.
 *
 * **Operations on a single task are decided here, in one place.** A list row, a row in the
 * side-by-side list, the detail header, and the detail `⋯` all point at the same task, so if
 * they offered different things you'd have to remember "where did I open this from" to pick
 * an operation. The contents also line up with the native "Task" menu (same things in the
 * same place).
 *
 * The OS draws it (`lib/menu.ts` → main). This only returns the contents.
 */
export function taskMenuItems(
  taskId: string,
  /** A menu opened from the pane already showing the detail omits "Open" (it's already open) */
  { origin, ordered }: { origin: 'list' | 'detail'; ordered: string[] }
): MenuItemSpec[] {
  const state = useStore.getState()
  const task = state.snapshot?.tasks.find((t) => t.id === taskId)
  if (!task) return []

  /**
   * Make sure something removed from the list doesn't stay open.
   * This menu also opens from the side-by-side list (rule C-7),
   * so the removed target may be sitting in L2.
   */
  const closeIfOpen = (): void => {
    const now = useStore.getState()
    if (now.detailOpen && now.cursorTaskId === task.id) now.closeDetail()
  }

  const runNow = async (): Promise<void> => {
    const result = await window.quuu.tasks.runNow(task.id)
    if (!result.ok) {
      state.pushToast({
        id: `run-${Date.now()}`,
        level: 'warn',
        message: t('taskMenu.runFailed'),
        detail: result.reason
      })
    }
  }

  const items: MenuItemSpec[] = []
  if (origin === 'list') {
    items.push({ label: t('taskMenu.open'), accelerator: 'Cmd+O', onSelect: () => void state.openTask(task.id) })
  }

  const stateStart = items.length

  if (task.status !== 'running' && task.status !== 'done') {
    items.push({ label: t('taskMenu.runNow'), accelerator: 'Cmd+R', onSelect: () => void runNow() })
  }
  /*
   * A failed task gets back in line the same way anything else does.
   *
   * "Run Now" was the only way back, and it jumps the queue: when a whole group went down with
   * one account's limit, putting the work back meant taking a slot away from whatever was
   * already waiting, one task at a time, by hand. Nothing about a run that died on someone
   * else's limit needs a human to watch it start.
   */
  if (task.status === 'draft' || task.status === 'held' || task.status === 'failed') {
    items.push({
      label: t('taskMenu.enqueue'),
      onSelect: () => void window.quuu.tasks.enqueue(task.id)
    })
  }
  // Hold only takes it off the queue. The instructions are written, so don't revert to draft
  if (task.status === 'draft' || task.status === 'queued') {
    items.push({ label: t('taskMenu.hold'), onSelect: () => void window.quuu.tasks.hold(task.id) })
  }
  if (task.status === 'queued' || task.status === 'held') {
    items.push({ label: t('taskMenu.unqueue'), onSelect: () => void window.quuu.tasks.unqueue(task.id) })
  }
  if (task.status === 'running') {
    items.push({ label: t('taskMenu.cancel'), onSelect: () => void window.quuu.tasks.cancel(task.id) })
  }
  if (task.status === 'review' || task.status === 'failed') {
    items.push({
      label: t('taskMenu.markDone'),
      accelerator: 'Cmd+Shift+D',
      onSelect: () => void state.markDoneAndAdvance(task.id, ordered)
    })
  }
  if (task.status === 'done') {
    items.push({ label: t('taskMenu.reopen'), onSelect: () => void window.quuu.tasks.reopen(task.id) })
  }
  // Rule a separator between "Open" and the state operations (a destination and a state change are different ranks)
  if (stateStart > 0 && items.length > stateStart) items[stateStart].separatorBefore = true

  /*
   * It's just re-picking one value, so fold it into a submenu.
   * Laid flat it would take four rows and look the same rank as the operations
   * above and below. The current value is shown by the submenu's check
   * (the OS menu convention)
   */
  items.push({
    label: t('taskMenu.priority'),
    separatorBefore: true,
    submenu: ([0, 1, 2, 3] as Priority[]).map((p) => ({
      label: PRIORITY_LABEL[p],
      checked: p === task.priority,
      onSelect: () => void window.quuu.tasks.update({ id: task.id, patch: { priority: p } })
    }))
  })

  /*
   * Entry point for queueing while keeping the link.
   *
   * The order is usually **decided before writing** ("once this is done, this is next"),
   * yet the only place to wire a dependency used to be the inspector after creation.
   * Opening the compose pane from here removes the create → open → specify round trip.
   *
   * Don't fold into a submenu. Folding is only for re-picking one value, and this is
   * two separate operations (which side the new task stands on).
   */
  items.push(
    ...(['after', 'before'] as LinkDirection[]).map((direction, i) => ({
      label: t('taskMenu.addLinked', { direction: LINK_DIRECTION_LABEL[direction] }),
      separatorBefore: i === 0,
      onSelect: () => startNewTask({ taskId: task.id, direction, mode: 'done' })
    }))
  )

  /*
   * Entry point for moving to the workplace. **The destination is not necessarily the
   * project directory** — a session that ran on its own worktree has its output
   * elsewhere (`app.workingDir`).
   */
  items.push(...group(openWithItems({ kind: 'task', id: task.id }, { accelerators: true })))

  /*
   * Entry point for extracting values.
   * List rows don't allow text selection (a row is a button, not prose),
   * so right-click fills the "visible but can't copy" gap
   */
  /*
   * The failure reason shows in the list's "status" column, but the column width
   * always truncates it. Pasting it somewhere is the next move, so make the
   * truncated remainder extractable.
   */
  const failure = latestRunMap(state.snapshot?.runs ?? []).get(task.id)?.errorMessage

  items.push(
    ...group([
      ...copyItem(t('taskMenu.copyTitle'), task.title),
      ...copyItem(t('taskMenu.copyFailure'), task.status === 'failed' ? failure : null),
      // Paste the same place "open" goes to (not the project's registered directory)
      copyWorkingDirItem({ kind: 'task', id: task.id })
    ])
  )

  items.push(
    {
      label: t('taskMenu.archive'),
      accelerator: 'Cmd+Backspace',
      separatorBefore: true,
      onSelect: () => {
        void window.quuu.tasks.archive({ id: task.id, archived: true })
        closeIfOpen()
      }
    },
    {
      label: t('taskMenu.remove'),
      onSelect: () => {
        void confirmDestructive(
          t('taskMenu.deleteConfirm', { title: task.title }),
          t('taskMenu.deleteDetail')
        ).then((ok) => {
          if (!ok) return
          void window.quuu.tasks.remove(task.id)
          closeIfOpen()
        })
      }
    }
  )

  return items
}
