import type { MenuItemSpec } from '@design-system/react'
import { t } from '../model/i18n/index.js'
import type { FilterAxis, FilterOption, SortDirection, TaskColumn, TaskSort } from '../model/table.js'
import { AXIS_LABEL, toggleValue } from '../model/table.js'

/**
 * What can be done to a column.
 *
 * **The header band is the column's surface**, so right-click answers about that column
 * (rule N-2-4's "on a row, that one item; off the rows, that list" applied to columns).
 * If width, sort, and filter are only reachable by mouse gestures (drag, click, chips),
 * **you can't even discover that those operations exist**.
 *
 * The OS draws it (`lib/menu.ts` → main). This only returns the contents.
 */

/**
 * Filtering on one axis. The chip and the header open the same thing
 * (rule N-2-5: the same thing doesn't change with "where it was opened from").
 *
 * Counts are folded into the label. OS menus have no right-edge column — that spot is
 * for shortcuts (`accelerator`) — so a count placed there reads as a pressable key
 * (rule N-1b-3).
 *
 * Closing on select is the OS convention, so picking multiple means reopening and
 * stacking. Checks and the entry chip show what's in.
 */
export function filterMenuItems(
  options: FilterOption[],
  selected: string[],
  apply: (values: string[]) => void,
  /** Operations on the axis itself (status's "show done too"). Placed right below the values */
  extra: MenuItemSpec[] = []
): MenuItemSpec[] {
  return [
    { label: t('columnMenu.all'), checked: selected.length === 0, onSelect: () => apply([]) },
    ...options.map((option, i) => ({
      label: t('columnMenu.option', { label: option.label, n: option.count }),
      checked: selected.includes(option.value),
      separatorBefore: i === 0,
      onSelect: () => apply(toggleValue(selected, option.value))
    })),
    ...extra
  ]
}

export interface DoneScopeInput {
  axis: FilterAxis
  /** Hidden on surfaces where done never arrives (needs-review). Don't create items that do nothing when pressed */
  available: boolean
  included: boolean
  toggle(): void
}

/**
 * The "show done too" item that follows the status filter.
 *
 * Done only accumulates, so it's out of scope by default. **Including / excluding it is
 * also a status matter**, so it goes in the same menu as the status filter, not a button
 * outside the band. It works differently from the values (needs review, waiting…), so a
 * separator sets it apart below.
 */
export function doneScopeItems({
  axis,
  available,
  included,
  toggle
}: DoneScopeInput): MenuItemSpec[] {
  if (axis !== 'status' || !available) return []
  return [{ label: t('columnMenu.includeDone'), checked: included, separatorBefore: true, onSelect: toggle }]
}

const DIRECTION_LABEL: Record<SortDirection, string> = { asc: t('columnMenu.asc'), desc: t('columnMenu.desc') }

export interface ColumnMenuInput {
  column: TaskColumn
  /** The current sort (one for the whole table) */
  sort: TaskSort | null
  /** Only when the column can filter. Axis, options, and the current selection */
  filter?: {
    axis: FilterAxis
    options: FilterOption[]
    selected: string[]
    apply(values: string[]): void
    /** Operations on the axis itself (status's "show done too") */
    extra?: MenuItemSpec[]
  }
  /** Whether this column's width differs from the default */
  resized: boolean
  /** Whether the table's appearance (sort, widths, filters) has drifted from the default */
  dirty: boolean
  setSort(sort: TaskSort | null): void
  resetWidth(): void
  resetView(): void
}

export function columnMenuItems({
  column,
  sort,
  filter,
  resized,
  dirty,
  setSort,
  resetWidth,
  resetView
}: ColumnMenuInput): MenuItemSpec[] {
  const items: MenuItemSpec[] = []
  const key = column.sortKey

  if (key) {
    /*
     * The direction folds into a submenu. It's **re-picking one value**, so folding is
     * allowed (the submenu conditions of rules N-1b / N-3), and the current value is
     * shown by a check. "Unsorted" sits in the same column so a way back to queue
     * order always remains.
     */
    items.push({
      label: t('columnMenu.sortBy', { column: column.label }),
      submenu: [
        ...(['asc', 'desc'] as const).map((direction) => ({
          label: DIRECTION_LABEL[direction],
          checked: sort?.key === key && sort.direction === direction,
          onSelect: () => setSort({ key, direction })
        })),
        {
          label: t('columnMenu.unsorted'),
          checked: sort === null,
          separatorBefore: true,
          onSelect: () => setSort(null)
        }
      ]
    })
  }

  if (filter) {
    items.push({
      label: t('columnMenu.filterBy', { axis: AXIS_LABEL[filter.axis] }),
      separatorBefore: items.length > 0,
      submenu: filterMenuItems(filter.options, filter.selected, filter.apply, filter.extra)
    })
  }

  if (column.resizable) {
    items.push({
      label: t('columnMenu.resetWidth'),
      separatorBefore: items.length > 0,
      // At the default, pressing would do nothing. Don't let it look pressable
      disabled: !resized,
      onSelect: resetWidth
    })
  }

  items.push({
    label: t('columnMenu.resetView'),
    separatorBefore: items.length > 0,
    disabled: !dirty,
    onSelect: resetView
  })

  return items
}
