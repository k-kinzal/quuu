import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../inputs/Button.js'
import { Panel, PanelBody } from '../layout/Panel.js'
import { Row } from '../layout/Stack.js'
import { Badge } from './Badge.js'
import {
  CellButton,
  ColumnResizer,
  DataCell,
  DataRow,
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableHeadRow,
  HeadCell,
  FillerCell,
  RowActions,
  SortLabel,
  TableGroupRow,
  type SortDirection
} from './DataTable.js'
import { Dot, StatusIndicator } from './StatusIndicator.js'
import { Text } from './Text.js'

const meta: Meta = { title: 'Data Display/DataTable', parameters: { layout: 'fullscreen' } }
export default meta

const ROWS = [
  { id: 1, shape: 'diamond', tone: 'warning', name: 'Move the tokens onto the theme', group: 'design-system', color: '#4ea8de', state: '26 min ago', run: 'Succeeded · 10:02' },
  { id: 2, shape: 'cross', tone: 'danger', name: 'The case where pid cannot be traced at startup', group: 'runtime', color: '#e2a03f', state: 'ENOENT: not found', run: 'Failed · 09:41' },
  { id: 3, shape: 'spinner', tone: 'info', name: 'Split the components by category', group: 'design-system', color: '#4ea8de', state: 'Running 7 min', run: 'Running' },
  { id: 4, shape: 'ring', tone: 'neutral', name: 'Redo the writing conventions', group: 'docs', color: '#4caf7d', state: '—', run: '—' }
] as const

/**
 * The head cells decide the column widths. The body only ever shrinks, and the single
 * flexible column (the identifier) takes the remainder.
 */
export const Default: StoryObj = {
  render: () => (
    <Panel surface="canvas" grow sx={{ height: 360 }}>
      <PanelBody>
        <DataTable>
          <DataTableHead>
            <DataTableHeadRow>
              {/* Left padding (16px) + mark (10px) + right padding (8px). Any narrower and the mark is clipped */}
              <HeadCell width={34} edge="start" />
              {/* Give widths and hand the remainder to FillerCell. Keeps the attributes next to the identifier */}
              <HeadCell width={420}>Name</HeadCell>
              <HeadCell width={148}>Category</HeadCell>
              <HeadCell width={160}>State</HeadCell>
              <HeadCell width={130}>Last</HeadCell>
              <HeadCell />
              <HeadCell width={110} edge="end" />
            </DataTableHeadRow>
          </DataTableHead>
          <DataTableBody>
            <TableGroupRow label="Awaiting review" count={1} colSpan={7} />
            {ROWS.slice(0, 1).map((r) => (
              <Line key={r.id} row={r} selected />
            ))}
            <TableGroupRow label="Everything else" count={3} colSpan={7} />
            {ROWS.slice(1).map((r) => (
              <Line key={r.id} row={r} />
            ))}
          </DataTableBody>
        </DataTable>
      </PanelBody>
    </Panel>
  )
}

function Line({
  row,
  selected
}: {
  row: (typeof ROWS)[number]
  selected?: boolean
}): JSX.Element {
  return (
    <DataRow selected={selected}>
      <DataCell width={34} edge="start" clip>
        <StatusIndicator shape={row.shape} tone={row.tone} label={row.state} />
      </DataCell>
      <DataCell clip>
        <CellButton type="button">{row.name}</CellButton>
        {row.id === 4 && (
          <Text size="xs" tone="tertiary" sx={{ ml: 2 }}>
            Not filled in
          </Text>
        )}
      </DataCell>
      <DataCell width={148} tone="muted">
        <Row gap={1.25} min>
          <Dot color={row.color} />
          <Text truncate>{row.group}</Text>
        </Row>
      </DataCell>
      <DataCell width={160} tone={row.tone === 'neutral' ? 'muted' : row.tone}>
        {row.state}
      </DataCell>
      <DataCell width={130} tone="muted">
        {row.run}
      </DataCell>
      <FillerCell />
      <DataCell width={110} edge="end">
        <RowActions>
          <Button size="xs">Run</Button>
          <Button size="xs" color="success">
            Done
          </Button>
        </RowActions>
      </DataCell>
    </DataRow>
  )
}

/** The signal right after something is added. Flash for an instant to show where it landed. */
export const States: StoryObj = {
  render: () => (
    <Panel surface="canvas" grow sx={{ height: 220 }}>
      <PanelBody>
        <DataTable>
          <DataTableBody>
            <DataRow>
              <DataCell edge="start">Ordinary</DataCell>
              <DataCell width={120} edge="end">
                <Badge>—</Badge>
              </DataCell>
            </DataRow>
            <DataRow selected>
              <DataCell edge="start">Selected</DataCell>
              <DataCell width={120} edge="end" />
            </DataRow>
            <DataRow flashing>
              <DataCell edge="start">Just added</DataCell>
              <DataCell width={120} edge="end" />
            </DataRow>
            <DataRow dimmed>
              <DataCell edge="start">
                <CellButton type="button">Already finished</CellButton>
              </DataCell>
              <DataCell width={120} edge="end" />
            </DataRow>
          </DataTableBody>
        </DataTable>
      </PanelBody>
    </Panel>
  )
}

/**
 * Sort by the head cell, resize at the boundary.
 *
 * Unsorted columns also show a faint mark on hover, so it is visible that "pressing
 * sorts". The resize handle only draws its line while touched (no row of vertical
 * lines across the header band).
 */
export const SortableAndResizable: StoryObj = {
  render: function Render() {
    const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null)
    const [width, setWidth] = useState(420)

    const toggle = (key: string): void =>
      setSort((prev) =>
        !prev || prev.key !== key
          ? { key, direction: 'asc' }
          : prev.direction === 'asc'
            ? { key, direction: 'desc' }
            : null
      )

    const sorted = [...ROWS].sort((a, b) => {
      if (!sort) return 0
      const sign = sort.direction === 'asc' ? 1 : -1
      return sign * (sort.key === 'name' ? a.name.localeCompare(b.name, 'ja') : a.id - b.id)
    })

    return (
      <Panel surface="canvas" grow sx={{ height: 360 }}>
        <PanelBody>
          <DataTable>
            <DataTableHead>
              <DataTableHeadRow>
                <HeadCell width={34} edge="start" />
                <HeadCell width={width}>
                  <SortLabel
                    direction={sort?.key === 'name' ? sort.direction : null}
                    onToggle={() => toggle('name')}
                  >
                    Name
                  </SortLabel>
                  <ColumnResizer
                    value={width}
                    min={160}
                    onChange={setWidth}
                    onReset={() => setWidth(420)}
                  />
                </HeadCell>
                <HeadCell width={148}>Category</HeadCell>
                <HeadCell width={160}>
                  <SortLabel
                    direction={sort?.key === 'state' ? sort.direction : null}
                    onToggle={() => toggle('state')}
                  >
                    State
                  </SortLabel>
                </HeadCell>
                <HeadCell width={130}>Last</HeadCell>
                <HeadCell />
                <HeadCell width={110} edge="end" />
              </DataTableHeadRow>
            </DataTableHead>
            <DataTableBody>
              {sorted.map((r) => (
                <Line key={r.id} row={r} />
              ))}
            </DataTableBody>
          </DataTable>
        </PanelBody>
      </Panel>
    )
  }
}
