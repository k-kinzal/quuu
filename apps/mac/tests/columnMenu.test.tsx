import { describe, expect, it, vi } from 'vitest'
import { columnMenuItems, doneScopeItems, filterMenuItems } from '../src/renderer/src/components/ColumnMenu.js'
import { taskColumn } from '../src/renderer/src/model/table.js'
import type { FilterOption, TaskSort } from '../src/renderer/src/model/table.js'

/**
 * What goes into the column and filter menus. **The OS draws them** (rule N-1b), so
 * all this guarantees is "what gets handed over".
 * It also checks that no decoration the OS menu lacks (a right-hand column, color) is assumed.
 */

const OPTIONS: FilterOption[] = [
  { value: 'review', label: 'レビュー待ち', count: 29 },
  { value: 'failed', label: '失敗', count: 55 },
  { value: 'queued', label: '待機中', count: 83 }
]

const base = {
  column: taskColumn('lastRun'),
  sort: null,
  resized: false,
  dirty: false,
  setSort: () => { },
  resetWidth: () => { },
  resetView: () => { }
}

describe('the filter menu', () => {
  it('puts "all" first and checks it while nothing is selected', () => {
    const items = filterMenuItems(OPTIONS, [], () => { })
    expect(items[0].label).toBe('All')
    expect(items[0].checked).toBe(true)
    expect(items.slice(1).every((i) => i.checked === false)).toBe(true)
  })

  it('folds the count into the label (an OS menu has no right-hand column)', () => {
    const items = filterMenuItems(OPTIONS, [], () => { })
    expect(items.map((i) => i.label)).toEqual([
      'All',
      'レビュー待ち (29)',
      '失敗 (55)',
      '待機中 (83)'
    ])
    // The right edge is where shortcuts live. A count there reads as a key you could press
    expect(items.every((i) => i.accelerator === undefined)).toBe(true)
  })

  it('checks the selected value and takes the check off "all"', () => {
    const items = filterMenuItems(OPTIONS, ['failed'], () => { })
    expect(items[0].checked).toBe(false)
    expect(items.find((i) => i.label.startsWith('失敗'))?.checked).toBe(true)
  })

  it('draws the rule only above the first option (separating "all" from the values)', () => {
    const items = filterMenuItems(OPTIONS, [], () => { })
    expect(items.map((i) => i.separatorBefore ?? false)).toEqual([false, true, false, false])
  })

  it('turns on when picked and off when picked again (they stack)', () => {
    const apply = vi.fn()
    filterMenuItems(OPTIONS, ['review'], apply)[2].onSelect?.()
    expect(apply).toHaveBeenCalledWith(['review', 'failed'])

    apply.mockClear()
    filterMenuItems(OPTIONS, ['review', 'failed'], apply)[1].onSelect?.()
    expect(apply).toHaveBeenCalledWith(['failed'])
  })

  it('empties the filter when "all" is picked', () => {
    const apply = vi.fn()
    filterMenuItems(OPTIONS, ['review', 'failed'], apply)[0].onSelect?.()
    expect(apply).toHaveBeenCalledWith([])
  })

  it('puts actions on the axis itself below the values', () => {
    const extra = doneScopeItems({
      axis: 'status',
      available: true,
      included: false,
      toggle: () => { }
    })
    const items = filterMenuItems(OPTIONS, [], () => { }, extra)
    expect(items[items.length - 1].label).toBe('Include Done')
    // They do a different job from the values, so a rule separates them
    expect(items[items.length - 1].separatorBefore).toBe(true)
  })
})

/**
 * Whether done is in range is **part of the status filter**.
 * It belongs in the status menu (right-click on the chip or the header), not on a button outside the band.
 */
describe('show done as well', () => {
  const toggle = vi.fn()

  it('appears only on the status axis', () => {
    const on = { available: true, included: false, toggle }
    expect(doneScopeItems({ axis: 'status', ...on })).toHaveLength(1)
    expect(doneScopeItems({ axis: 'priority', ...on })).toEqual([])
    expect(doneScopeItems({ axis: 'project', ...on })).toEqual([])
  })

  it('does not appear on a surface where done never arrives (needs review)', () => {
    expect(
      doneScopeItems({ axis: 'status', available: false, included: false, toggle })
    ).toEqual([])
  })

  it('shows whether it is on with a check, and toggles it on press', () => {
    expect(
      doneScopeItems({ axis: 'status', available: true, included: true, toggle })[0].checked
    ).toBe(true)
    doneScopeItems({ axis: 'status', available: true, included: false, toggle })[0].onSelect?.()
    expect(toggle).toHaveBeenCalledOnce()
  })
})

describe('the column menu', () => {
  it('passes actions on the axis itself into the filter submenu too', () => {
    const items = columnMenuItems({
      ...base,
      column: taskColumn('state'),
      filter: {
        axis: 'status',
        options: OPTIONS,
        selected: [],
        apply: () => { },
        extra: doneScopeItems({
          axis: 'status',
          available: true,
          included: true,
          toggle: () => { }
        })
      }
    })
    const submenu = items.find((i) => i.label === 'Filter by Status')?.submenu ?? []
    expect(submenu[submenu.length - 1]).toMatchObject({ label: 'Include Done', checked: true })
  })

  it('lists sort, filter, width and reset display in that order', () => {
    const items = columnMenuItems({
      ...base,
      column: taskColumn('state'),
      filter: { axis: 'status', options: OPTIONS, selected: [], apply: () => { } }
    })
    expect(items.map((i) => i.label)).toEqual([
      'Sort by Status',
      'Filter by Status',
      'Reset Column Width to Default',
      'Reset View (Sort, Widths, Filters)'
    ])
  })

  it('keeps submenus one level deep (only re-picking a value may be folded away)', () => {
    const items = columnMenuItems({
      ...base,
      column: taskColumn('state'),
      filter: { axis: 'status', options: OPTIONS, selected: [], apply: () => { } }
    })
    for (const item of items) {
      for (const child of item.submenu ?? []) expect(child.submenu).toBeUndefined()
    }
  })

  it('checks the current direction and returns to queue order with "do not sort"', () => {
    const sort: TaskSort = { key: 'lastRun', direction: 'desc' }
    const setSort = vi.fn()
    const submenu = columnMenuItems({ ...base, sort, setSort })[0].submenu ?? []
    expect(submenu.map((i) => [i.label, i.checked ?? false])).toEqual([
      ['Ascending', false],
      ['Descending', true],
      ['No Sorting (Queue Order)', false]
    ])
    submenu[2].onSelect?.()
    expect(setSort).toHaveBeenCalledWith(null)
    submenu[0].onSelect?.()
    expect(setSort).toHaveBeenCalledWith({ key: 'lastRun', direction: 'asc' })
  })

  it('checks "do not sort" while nothing is sorted', () => {
    const submenu = columnMenuItems(base)[0].submenu ?? []
    expect(submenu[2].checked).toBe(true)
  })

  it('omits the sort entries on a column that cannot be sorted (the marker column)', () => {
    const items = columnMenuItems({
      ...base,
      column: taskColumn('mark'),
      filter: { axis: 'status', options: OPTIONS, selected: [], apply: () => { } }
    })
    expect(items.map((i) => i.label)).toEqual([
      'Filter by Status',
      'Reset View (Sort, Widths, Filters)'
    ])
  })

  it('omits the filter entries on a column that cannot be filtered (the task name)', () => {
    const items = columnMenuItems({ ...base, column: taskColumn('title') })
    expect(items.map((i) => i.label)).toEqual([
      'Sort by Task',
      'Reset Column Width to Default',
      'Reset View (Sort, Widths, Filters)'
    ])
  })

  it('disables an entry that is still at its default (never wear the face of a press that does nothing)', () => {
    const clean = columnMenuItems(base)
    expect(clean.find((i) => i.label === 'Reset Column Width to Default')?.disabled).toBe(true)
    expect(clean.find((i) => i.label.startsWith('Reset View'))?.disabled).toBe(true)

    const dirty = columnMenuItems({ ...base, resized: true, dirty: true })
    expect(dirty.find((i) => i.label === 'Reset Column Width to Default')?.disabled).toBe(false)
    expect(dirty.find((i) => i.label.startsWith('Reset View'))?.disabled).toBe(false)
  })

  it('calls the matching reset for width and for display', () => {
    const resetWidth = vi.fn()
    const resetView = vi.fn()
    const items = columnMenuItems({ ...base, resized: true, dirty: true, resetWidth, resetView })
    items.find((i) => i.label === 'Reset Column Width to Default')?.onSelect?.()
    items.find((i) => i.label.startsWith('Reset View'))?.onSelect?.()
    expect(resetWidth).toHaveBeenCalledOnce()
    expect(resetView).toHaveBeenCalledOnce()
  })
})
