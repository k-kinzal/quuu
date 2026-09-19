import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'

/**
 * The state of a slot. There are three of **fill / background / outline** so that "in
 * use", "free" and "free but unusable" can be told apart by shape and not by color
 * alone.
 */
export type GaugeCellKind = 'filled' | 'empty' | 'outlined' | 'muted'

export interface GaugeCell {
  kind: GaugeCellKind
  /** The color for `filled` / `outlined`. Omitted, it is the primary color */
  color?: string
  /** A note on each individual cell, so which slot it is can be read */
  title?: string
}

const Cell = styled('span', { shouldForwardProp: blockProps('kind', 'color') })<{
  kind: GaugeCellKind
  color?: string
}>(({ theme, kind, color }) => {
  const c = color ?? theme.palette.primary.main
  return {
    width: 10,
    height: 8,
    borderRadius: 2,
    background:
      kind === 'filled'
        ? c
        : kind === 'muted'
          ? theme.palette.border.subtle
          : kind === 'outlined'
            ? 'transparent'
            : theme.palette.border.strong,
    ...(kind === 'outlined' ? { boxShadow: `inset 0 0 0 1.5px ${c}` } : {})
  }
})

const Root = styled('span')({ display: 'flex', gap: 2 })

export interface GaugeProps {
  cells: GaugeCell[]
  /** The cap on how many to show. It must not keep stretching sideways when there are too many */
  max?: number
  label?: string
}

/**
 * Shows how much of a fixed number of slots is in use, one cell at a time.
 *
 * A number (3/8) is exact but you cannot notice it change. The cells change shape, so
 * "it filled up" enters your field of view even when you are not looking at it.
 */
export function Gauge({ cells, max = 20, label }: GaugeProps): JSX.Element {
  return (
    <Root role="img" aria-label={label}>
      {cells.slice(0, max).map((cell, i) => (
        <Cell key={i} kind={cell.kind} color={cell.color} title={cell.title} />
      ))}
    </Root>
  )
}
