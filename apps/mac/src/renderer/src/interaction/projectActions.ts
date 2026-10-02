import type { MenuItemSpec } from '@design-system/react'
import type { Project } from '../../../api/schemas/projects.js'
import { t } from '../model/i18n/index.js'
import { useStore } from '../state/store.js'
import { confirmDestructive, copyItem, group } from './contextMenu.js'
import { openWithItems } from './openWith.js'

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
  const toggle: MenuItemSpec = {
    label: project.enabled ? t('projectActions.stop') : t('projectActions.resume'),
    onSelect: () => void window.quuu.projects.update({ id: project.id, patch: { enabled: !project.enabled } })
  }
  // The built-in project cannot be deleted; stopping it is how its tasks are kept from running
  if (project.builtIn) return [toggle]
  return [
    toggle,
    {
      label: t('projectActions.delete'),
      separatorBefore: true,
      onSelect: () => confirmDeleteProject(project)
    }
  ]
}

/**
 * What can be done to a single project, after "Open". Opens from both a rail row and the list surface.
 *
 * Ordered the way Finder and most desktop tools order a right-click menu: open → copy →
 * change state → delete, with configuration in the last place — the same place the rail
 * pins Settings. The groups never move, so the hand learns one menu for both routes.
 */
export function projectItems(project: Project, settings: MenuItemSpec): MenuItemSpec[] {
  if (project.builtIn) return []
  return [
    ...group(openWithItems({ kind: 'project', id: project.id })),
    ...group(copyItem(t('rail.copyDirectory'), project.path)),
    ...group(projectStateItems(project)),
    ...group([settings])
  ]
}

/** The rail row's menu. */
export function projectMenuItems(projectId: string): MenuItemSpec[] {
  const state = useStore.getState()
  const project = state.snapshot?.projects.find((p) => p.id === projectId)
  if (!project) return []

  return [
    { label: t('rail.open'), onSelect: () => state.setSection({ kind: 'project', id: project.id }) },
    ...projectItems(project, {
      label: t('rail.projectSettings'),
      onSelect: () => {
        state.setSection({ kind: 'project', id: project.id })
        state.openProjectSettings(true)
      }
    })
  ]
}
