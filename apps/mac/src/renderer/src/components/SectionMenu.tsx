import type { MenuItemSpec } from '@design-system/react'
import { copyItem, group } from '../interaction/contextMenu.js'
import { openWithItems } from '../interaction/openWith.js'
import { projectStateItems } from '../interaction/projectActions.js'
import { t } from '../model/i18n/index.js'
import { isTableViewDirty } from '../model/table.js'
import { useStore } from '../state/store.js'

/**
 * Actions on the pane itself (not a row — what can be done to the list being viewed).
 *
 * Right-clicking where there is no row and getting nothing looks "broken" in a
 * desktop app. Even Finder offers New and view switching in the window's empty
 * space. Same here: offer **what this pane can do right now**.
 *
 * Align the items with what the header and toolbar already offer.
 * An action that exists only here becomes unreachable for anyone who doesn't right-click.
 */
export function sectionMenuItems(): MenuItemSpec[] {
  const state = useStore.getState()
  const { snapshot, section, filters } = state

  const project = section.kind === 'project' ? snapshot?.projects.find((p) => p.id === section.id) : undefined
  const hasProjects = (snapshot?.projects ?? []).length > 0
  const items: MenuItemSpec[] = []

  /* Needs-review is a "look at what piled up" pane, so it gets no queueing action (same as its list) */
  if (section.kind !== 'review' && hasProjects) {
    items.push({
      label: t('sectionMenu.newTask'),
      accelerator: 'Cmd+N',
      onSelect: () => window.dispatchEvent(new CustomEvent('quuu:focus-quickadd'))
    })
  }

  /* Part of the status filter (`filters.includeDone`). The same item also appears on the status chips */
  if (section.kind !== 'review') {
    items.push({
      label: t('sectionMenu.includeDone'),
      checked: filters.includeDone,
      separatorBefore: items.length > 0,
      onSelect: state.toggleShowDone
    })
  }

  /*
   * Reset the table view. **An action from the toolbar also lives here** (this is the pane's inventory).
   * Column order, widths, and filters all leave visible traces on screen, but if the
   * only way back is the single spot at the band's right edge, a hidden state
   * (filtered down to 0 rows) has no way back.
   */
  if (isTableViewDirty(state.table.sort, state.table.widths, state.filters)) {
    items.push({
      label: t('sectionMenu.resetView'),
      separatorBefore: items.length > 0,
      onSelect: state.resetTableView
    })
  }

  if (project) {
    items.push(
      {
        label: t('sectionMenu.projectSettings'),
        separatorBefore: items.length > 0,
        onSelect: () => state.openProjectSettings(true)
      },
      ...group(openWithItems({ kind: 'project', id: project.id })),
      ...group(copyItem(t('sectionMenu.copyDirectory'), project.path)),
      ...group(projectStateItems(project))
    )
  }

  return items
}
