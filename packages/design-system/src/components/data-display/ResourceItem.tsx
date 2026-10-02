import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { ItemRow } from './ItemList.js'
import { Text } from './Text.js'

/** Resource names must remain distinguishable even when their final segment is long. */
const ResourceRow = styled(ItemRow, { shouldForwardProp: blockProps('trailing') })<{ trailing: boolean }>(({ theme, trailing }) => ({
  display: 'grid',
  gridTemplateColumns: `${theme.iconSize.sm}px minmax(0, 1fr)${trailing ? ' auto' : ''}`,
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

/** Sits on the name's line, so a state mark reads with the name it belongs to however far the row wraps. */
const ResourceMeta = styled('span')({
  display: 'flex',
  alignItems: 'center',
  height: '1lh'
})

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
  /** A small state mark at the row's end, beside the name. The caller owns its meaning. */
  meta?: ReactNode
}

/** A readable resource name, a fixed icon column, and one quiet line of context. */
export function ResourceItem({ icon, label, description, selected, meta, ...props }: ResourceItemProps): JSX.Element {
  return <ResourceRow type="button" selected={selected} trailing={meta !== undefined} {...props}>
    <ResourceIcon aria-hidden="true">{icon}</ResourceIcon>
    <ResourceBody>
      <Text block>{label}</Text>
      {description && <Text block size="xs" tone="secondary" truncate title={description}>{description}</Text>}
    </ResourceBody>
    {meta !== undefined && <ResourceMeta>{meta}</ResourceMeta>}
  </ResourceRow>
}
