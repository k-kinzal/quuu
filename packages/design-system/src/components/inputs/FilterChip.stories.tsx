import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Row } from '../layout/Stack.js'
import { FilterChip } from './FilterChip.js'

const meta: Meta<typeof FilterChip> = { title: 'Inputs/FilterChip', component: FilterChip }
export default meta

/**
 * Only the axes actually in effect carry a frame and a color.
 *
 * Fold it into a single "Filter" button and the count drops without you knowing what it
 * was filtered by. **The menu that opens on press does not live here.** The menu is a
 * surface the OS draws, so opening it is the app's job (`popupMenu`); all this holds is
 * the shape of the entrance.
 */
export const Default: StoryObj = {
  render: () => (
    <Row gap={1}>
      <FilterChip label="State" onClick={() => {}} />
      <FilterChip label="Category" value="design-system" onClick={() => {}} />
      <FilterChip label="Priority" value="P0 +2" onClick={() => {}} />
      <FilterChip label="Assignee" disabled onClick={() => {}} />
    </Row>
  )
}

const VALUES = ['Awaiting review', 'Failed', 'Running', 'Waiting']

/** Pick more and it becomes "first +n". The value grows but the entrance does not (elided at 220px). */
export const Selecting: StoryObj = {
  render: function Render() {
    const [selected, setSelected] = useState<string[]>([])
    const next = (prev: string[]): string[] =>
      prev.length === VALUES.length ? [] : VALUES.slice(0, prev.length + 1)

    return (
      <Row gap={1}>
        <FilterChip
          label="State"
          value={
            selected.length === 0
              ? undefined
              : selected.length === 1
                ? selected[0]
                : `${selected[0]} +${selected.length - 1}`
          }
          title="Each press adds one (the real menu is drawn by the OS)"
          onClick={() => setSelected(next)}
        />
        <FilterChip
          label="An axis whose value runs very long"
          value="When a project with a long name is picked +3"
          onClick={() => {}}
        />
      </Row>
    )
  }
}
