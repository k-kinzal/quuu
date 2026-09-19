import {
  FilterChip,
  LinkButton,
  SearchPicker,
  Row,
  Spacer,
  Text,
  Toolbar,
  useMenu,
  type MenuItemSpec
} from '@design-system/react'
import { useMemo } from 'react'
import type { Task } from '../../../preload/api/tasks.js'
import { t } from '../model/i18n/index.js'
import type { FilterAxis, FilterOption, TableContext } from '../model/table.js'
import { AXIS_LABEL, axisValue, filterOptions, filterValues, isTableViewDirty, setFilterValues } from '../model/table.js'
import { useStore } from '../state/store.js'

import { doneScopeItems, filterMenuItems } from './ColumnMenu.js'

export interface TaskFilterBarProps {
  /** The set before filtering. Options and counts come from here */
  candidates: Task[]
  context: TableContext
  /** Count after filtering */
  matched: number
  /** Count of the section's scope */
  total: number
  /** Hide the project axis while a project is open */
  crossProject: boolean
  /** Whether done arrives on this surface (needs-review never gets it, so hide "show done too") */
  canIncludeDone: boolean
}

/**
 * Table filtering. **Lays out the active axes and values so they read without opening.**
 *
 * Folded into a single "Filter" button, the count just shrinks with no way to tell what
 * it's filtered by. To avoid a hunt for vanished rows, each axis gets its own entry.
 *
 * The entry to undo sorting also lives here. Sort and filter are one possession —
 * "how the table looks" — so the way back isn't split across two places.
 *
 * The menu comes from the same function as the header's right-click (`filterMenuItems`).
 * The same thing doesn't change with "where it was opened from" (rule N-2-5).
 *
 * **Whether done is shown is also owned here.** Turning what is merely a kind of status
 * into a button outside the band splits "what's not shown" across two reading spots.
 * It goes inside the status axis, and being active reads from the entry's value
 * ("includes done").
 */
export function TaskFilterBar({
  candidates,
  context,
  matched,
  total,
  crossProject,
  canIncludeDone
}: TaskFilterBarProps): JSX.Element {
  const filters = useStore((s) => s.filters)
  const setFilters = useStore((s) => s.setFilters)
  const table = useStore((s) => s.table)
  const resetTableView = useStore((s) => s.resetTableView)
  const toggleShowDone = useStore((s) => s.toggleShowDone)
  /* Menu opened from a chip. Anchors to the pressed chip (not the right-click vessel) */
  const menu = useMenu<{ label: string; items(): MenuItemSpec[] }>()
  const choices = useMemo(() => {
    const items = menu.payload?.items() ?? []
    return {
      items,
      options: items.map((item, index) => ({ value: String(index), label: item.label, separatorBefore: item.separatorBefore, disabled: item.disabled })),
      selected: items.flatMap((item, index) => item.checked ? [String(index)] : [])
    }
  }, [menu.payload])

  /*
   * Options are a tally, so one pass gets heavy with many rows.
   * This re-renders on the once-a-second elapsed-time updates too, so count
   * only when the set changes.
   */
  const options = useMemo<Record<FilterAxis, FilterOption[]>>(
    () => ({
      status: filterOptions('status', candidates, context),
      project: filterOptions('project', candidates, context),
      priority: filterOptions('priority', candidates, context),
      target: filterOptions('target', candidates, context)
    }),
    [candidates, context]
  )

  const axes: FilterAxis[] = crossProject
    ? ['status', 'project', 'priority', 'target']
    : ['status', 'priority', 'target']

  return (
    <Toolbar placement="panel">
      {axes.map((axis) => {
        const selected = filterValues(filters, axis)
        /* The status axis alone carries the scope itself (include done?) besides the values */
        const extra = doneScopeItems({
          axis,
          available: canIncludeDone,
          included: filters.includeDone,
          toggle: toggleShowDone
        })
        return (
          <FilterChip
            key={axis}
            label={AXIS_LABEL[axis]}
            value={axisValue(axis, filters, options[axis])}
            title={t('filterBar.filterBy', { axis: AXIS_LABEL[axis] })}
            disabled={options[axis].length === 0 && extra.length === 0}
            aria-haspopup="listbox"
            aria-expanded={menu.isOpen && menu.payload?.label === AXIS_LABEL[axis]}
            /* A surface anchored to the pressed chip. It's re-picking a value, so don't detach it */
            onClick={(e) =>
              menu.open(e, {
                label: AXIS_LABEL[axis],
                items: () =>
                  filterMenuItems(
                    options[axis],
                    selected,
                    (values) => setFilters(setFilterValues(filters, axis, values)),
                    extra
                  )
              })
            }
          />
        )
      })}

      <Spacer />

      <Row gap="lg">
        {/* Show the denominator only when reduced. Otherwise the heading's count suffices */}
        {matched !== total && (
          <Text size="xs" tone="tertiary" tabular>
            {matched} / {total}
          </Text>
        )}
        {/* Widths count as "view" too. Without an entry to undo a widened column, there's no way back */}
        {isTableViewDirty(table.sort, table.widths, filters) && (
          <LinkButton onClick={resetTableView} title={t('filterBar.resetTitle')}>
            {t('filterBar.reset')}
          </LinkButton>
        )}
      </Row>

      <SearchPicker
        open={menu.isOpen}
        anchorEl={menu.anchorEl}
        onClose={menu.close}
        options={choices.options}
        value={choices.selected}
        onChange={value => choices.items[Number(value)]?.onSelect?.()}
        label={menu.payload?.label ?? t('filterBar.menu')}
      />
    </Toolbar>
  )
}
