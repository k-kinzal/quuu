import type { Meta, StoryObj } from '@storybook/react-vite'
import { Minus, Plus } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import {
  DataCell,
  DataRow,
  DataTable,
  DataTableBody,
  DataTableHead,
  DataTableHeadRow,
  HeadCell
} from '../data-display/DataTable.js'
import { ListFrame, ListFrameButton } from './ListFrame.js'

const meta: Meta = { title: 'Layout/ListFrame' }
export default meta

const bar = (
  <>
    <ListFrameButton
      title="Add"
      icon={<Plus size={iconSize.sm} {...iconDefaults} />}
      onClick={() => {}}
    />
    <ListFrameButton
      title="Remove the selected row"
      icon={<Minus size={iconSize.sm} {...iconDefaults} />}
      disabled
      onClick={() => {}}
    />
  </>
)

/** Put a table in the container. The add action goes on the band along its bottom, never outside the list. */
export const WithTable: StoryObj = {
  render: () => (
    <div style={{ maxWidth: 520 }}>
      <ListFrame bar={bar}>
        <DataTable>
          <DataTableHead>
            <DataTableHeadRow>
              <HeadCell>Name</HeadCell>
              <HeadCell width={120}>Command</HeadCell>
            </DataTableHeadRow>
          </DataTableHead>
          <DataTableBody>
            {['Claude', 'Codex'].map((name) => (
              <DataRow key={name}>
                <DataCell>{name}</DataCell>
                <DataCell width={120}>{name.toLowerCase()}</DataCell>
              </DataRow>
            ))}
          </DataTableBody>
        </DataTable>
      </ListFrame>
    </div>
  )
}

/** The container with zero items. It holds its height and shows "nothing yet" without placing any prose. */
export const Empty: StoryObj = {
  render: () => (
    <div style={{ maxWidth: 520 }}>
      <ListFrame bar={bar}>{null}</ListFrame>
    </div>
  )
}
