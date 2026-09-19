import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { useStrings } from '../../theme/strings.js'

const ChipRoot = styled('button', { shouldForwardProp: blockProps('active') })<{
  active: boolean
}>(({ theme, active }) => ({
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  maxWidth: 220,
  height: theme.density.control.xs,
  padding: '0 7px',
  borderRadius: theme.radius.sm,
  // Only filters actually in effect carry a frame and a color. The rest sink into the background
  border: `1px solid ${active ? theme.palette.primaryText : theme.palette.border.subtle}`,
  background: active ? theme.palette.surface.raised : 'transparent',
  ...theme.typography.caption,
  color: active ? theme.palette.text.primary : theme.palette.text.tertiary,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  '&:hover': { background: theme.palette.surface.hover, color: theme.palette.text.primary }
}))

const Label = styled('span')({ flex: '0 0 auto' })

const Value = styled('span', { shouldForwardProp: blockProps('active') })<{ active: boolean }>(
  ({ theme, active }) => ({
    flex: '0 1 auto',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontWeight: active ? 600 : 400,
    color: active ? theme.palette.primaryText : 'inherit'
  })
)

const Caret = styled('span')({
  flex: '0 0 auto',
  width: 0,
  height: 0,
  marginLeft: 1,
  borderLeft: '3px solid transparent',
  borderRight: '3px solid transparent',
  borderTop: '4px solid currentColor',
  opacity: 0.7
})

export interface FilterChipProps extends Pick<React.AriaAttributes, 'aria-haspopup' | 'aria-expanded'> {
  /** What it filters by. The name of a column or an attribute */
  label: string
  /** The value currently picked. Omitted, it means "all" — nothing is filtered */
  value?: string
  title?: string
  disabled?: boolean
  onClick(event: React.MouseEvent<HTMLButtonElement>): void
}

/**
 * The entrance to filtering.
 *
 * The one condition is that **whether it is in effect can be read without opening it**.
 * Fold it into a single "Filter" button and the count simply drops without you knowing
 * what it was filtered by, leaving you hunting for the rows that vanished. The value is
 * shown, never folded away.
 */
export function FilterChip({
  label,
  value,
  title,
  disabled,
  onClick,
  ...aria
}: FilterChipProps): JSX.Element {
  const strings = useStrings()
  const active = value !== undefined
  return (
    <ChipRoot
      type="button"
      active={active}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      {...aria}
    >
      <Label>{label}</Label>
      <Value active={active}>{value ?? strings.filterChip.all}</Value>
      <Caret />
    </ChipRoot>
  )
}
