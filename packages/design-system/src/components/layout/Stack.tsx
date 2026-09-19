import { styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { compositionSpace } from '../../theme/feedback.js'

export interface StackProps {
  /** Compose with the named steps. The numbers exist only for compatibility with older parts inside the DS. */
  gap?: number | keyof typeof compositionSpace
  align?: 'center' | 'start' | 'end' | 'stretch' | 'baseline'
  justify?: 'start' | 'end' | 'center' | 'between'
  wrap?: boolean
  /** Takes the remainder and grows */
  grow?: boolean
  /** Growing contents do not push the parent wider. Required for the ellipsis (…) to work */
  min?: boolean
  /** Stretch the contents to the full surface */
  fill?: boolean
  fixed?: boolean
  tone?: 'secondary' | 'tertiary' | 'accent'
}

const ALIGN = {
  center: 'center',
  start: 'flex-start',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline'
} as const

const JUSTIFY = {
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
  between: 'space-between'
} as const

const flex = (direction: 'row' | 'column') =>
  styled('div', {
    shouldForwardProp: blockProps(
      'gap',
      'align',
      'justify',
      'wrap',
      'grow',
      'min',
      'fill',
      'fixed',
      'tone'
    )
  })<StackProps>(({ theme, gap = 2, align, justify, wrap, grow, min, fill, fixed, tone }) => ({
    display: 'flex',
    flexDirection: direction,
    alignItems: ALIGN[align ?? (direction === 'row' ? 'center' : 'stretch')],
    justifyContent: justify ? JUSTIFY[justify] : undefined,
    flexWrap: wrap ? 'wrap' : undefined,
    gap: theme.spacing(typeof gap === 'number' ? gap : compositionSpace[gap]),
    flex: grow ? '1 1 auto' : fixed ? '0 0 auto' : undefined,
    color:
      tone === 'accent' ? theme.palette.primaryText : tone ? theme.palette.text[tone] : undefined,
    minWidth: min ? 0 : undefined,
    minHeight: min ? 0 : undefined,
    width: fill ? '100%' : undefined,
    height: fill && direction === 'column' ? '100%' : undefined
  }))

/** Lay out horizontally. The default container for toolbars, rows and metadata. */
export const Row = flex('row')

/** Stack vertically. */
export const Column = flex('column')

/** Eats the remainder and pushes its neighbour to the edge. */
export const Spacer = styled('span')({ flex: '1 1 auto', minWidth: 0 })
