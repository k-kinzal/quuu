import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import { ItemRow } from './ItemList.js'
import { Text } from './Text.js'

/** Resource names must remain distinguishable even when their final segment is long. */
const ResourceRow = styled(ItemRow)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: `${theme.iconSize.sm}px minmax(0, 1fr)`,
  alignItems: 'start',
  height: 'auto',
  minHeight: theme.density.row.xl,
  paddingBlock: theme.spacing(2),
  ...theme.typography.body2,
  color: theme.palette.text.primary
}))

const ResourceIcon = styled('span')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '1lh',
  color: theme.palette.text.secondary,
  '& > svg': { flex: '0 0 auto', width: theme.iconSize.sm, height: theme.iconSize.sm }
}))

const ResourceBody = styled('span')(({ theme }) => ({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(0.5),
  // Unbroken filenames wrap too; their last characters often identify the resource.
  overflowWrap: 'anywhere'
}))

export interface ResourceItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode
  label: string
  description?: string
  selected?: boolean
}

/** A readable resource name, a fixed icon column, and one quiet line of context. */
export function ResourceItem({ icon, label, description, selected, ...props }: ResourceItemProps): JSX.Element {
  return <ResourceRow type="button" selected={selected} {...props}>
    <ResourceIcon aria-hidden="true">{icon}</ResourceIcon>
    <ResourceBody>
      <Text block>{label}</Text>
      {description && <Text block size="xs" tone="secondary" truncate title={description}>{description}</Text>}
    </ResourceBody>
  </ResourceRow>
}
