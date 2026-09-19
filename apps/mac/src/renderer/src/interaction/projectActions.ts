import type { MenuItemSpec } from '@design-system/react'
import type { Project } from '../../../preload/api/projects.js'
import { t } from '../model/i18n/index.js'
import { useStore } from '../state/store.js'
import { confirmDestructive } from './contextMenu.js'

/**
 * Actions that change a project's state.
 *
 * The same thing is reachable from three places — a rail row, the surface menu, and
 * project settings — so the wording and the cleanup (where to move the visible surface)
 * are gathered here. So that "the rail asks for confirmation but the settings screen
 * deletes silently" never exists.
 */

/**
 * Delete. Tasks and run history don't come back.
 *
 * The project row itself stays, though (a soft delete). So **starting work in the same
 * directory again brings the project back**. It looks like something deleted returned,
 * so say so before the press.
 */
export function confirmDeleteProject(project: Project): void {
  void confirmDestructive(
    t('projectActions.deleteConfirm', { name: project.name }),
    t('projectActions.deleteDetail')
  ).then((ok) => {
    if (!ok) return
    void window.quuu.projects.remove(project.id)
    useStore.getState().setSection({ kind: 'all' })
  })
}

/**
 * Stop / delete.
 * The rail row and the surface menu show the same order and the same words (so the options
 * don't change with the route you took).
 */
export function projectStateItems(project: Project): MenuItemSpec[] {
  return [
    {
      label: project.enabled ? t('projectActions.stop') : t('projectActions.resume'),
      onSelect: () => void window.quuu.projects.update({ id: project.id, patch: { enabled: !project.enabled } })
    },
    {
      label: t('projectActions.delete'),
      separatorBefore: true,
      onSelect: () => confirmDeleteProject(project)
    }
  ]
}
