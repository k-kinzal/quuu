import { styled, type Theme } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'
import { feedbackMetrics } from '../../theme/feedback.js'
import { LoadingDots } from '../feedback/LoadingDots.js'

/**
 * The shapes that indicate a state.
 *
 * Named after **the shape itself**, not a meaning ("awaiting review" and the like).
 * Which state gets which shape is the app's decision.
 * The shape changes rather than the color alone so the column can still be scanned
 * vertically with a color vision difference.
 */
export type StatusShape =
  | 'ring'
  | 'dot'
  | 'quarter'
  | 'half'
  | 'spinner'
  | 'diamond'
  | 'square'
  | 'pause'
  | 'cross'
  | 'check'

export type StatusTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger'

const TONE: Record<StatusTone, (t: Theme) => string> = {
  neutral: (t) => t.palette.text.tertiary,
  accent: (t) => t.palette.primaryText,
  info: (t) => t.palette.info.main,
  success: (t) => t.palette.success.main,
  warning: (t) => t.palette.warning.main,
  danger: (t) => t.palette.error.main
}

interface ShapeProps {
  shape: StatusShape
  tone?: StatusTone
  color?: string
}

const Shape = styled('span', {
  shouldForwardProp: blockProps('shape', 'tone', 'color')
})<ShapeProps>(({ theme, shape, tone = 'neutral', color }) => {
  const c = color ?? TONE[tone](theme)
  const full = theme.radius.full
  const base = { position: 'absolute' as const, inset: 0 }

  switch (shape) {
    case 'ring':
      return { ...base, border: `1.5px solid ${c}`, borderRadius: full }

    case 'dot':
      return { ...base, background: c, borderRadius: full }

    case 'quarter':
      return {
        ...base,
        border: `1.5px solid ${c}`,
        borderRadius: full,
        background: `linear-gradient(to top right, ${c} 50%, transparent 50%)`
      }

    case 'half':
      return {
        ...base,
        border: `1.5px solid ${c}`,
        borderRadius: full,
        background: `linear-gradient(to right, ${c} 50%, transparent 50%)`
      }

    case 'spinner':
      return { ...base, color: c }

    /*
     * A diamond and a square read larger than a circle at the same side length (the
     * corners push area outward). The diamond especially: its diagonal is 1.41x the
     * side, so laid out naively that one state shouts a step louder than the rest of
     * the column. Shrink it to match optically
     */
    case 'diamond':
      return { ...base, background: c, transform: 'rotate(45deg) scale(0.7)' }

    case 'square':
      return { ...base, background: c, borderRadius: 2, transform: 'scale(0.74)' }

    // The "paused" shape. Two bars, so it is not mistaken for the quarter circle (waiting)
    case 'pause':
      return {
        ...base,
        '&::before, &::after': {
          content: '""',
          position: 'absolute',
          top: 1,
          width: 2.5,
          height: 8,
          background: c,
          borderRadius: 1
        },
        '&::before': { left: 1 },
        '&::after': { right: 1 }
      }

    case 'cross':
      return {
        ...base,
        '&::before, &::after': {
          content: '""',
          position: 'absolute',
          top: 4.5,
          left: 0,
          // A diagonal line runs past the ends, so it is shorter than the circle's diameter to stay inside the frame
          width: 10,
          height: 1.75,
          background: c,
          borderRadius: 1
        },
        '&::before': { transform: 'rotate(45deg)' },
        '&::after': { transform: 'rotate(-45deg)' }
      }

    case 'check':
      return {
        ...base,
        borderRadius: full,
        background: c,
        '&::after': {
          content: '""',
          position: 'absolute',
          left: 2.5,
          top: 1.5,
          width: 3,
          height: 6,
          border: `solid ${theme.palette.text.inverse}`,
          borderWidth: '0 1.5px 1.5px 0',
          transform: 'rotate(42deg)'
        }
      }
  }
})

/**
 * The container for a mark. **Shapes are drawn on a 10px grid and the container scales
 * them up.**
 *
 * The shapes are optically tuned (the diamond shrinks to 0.7 because its diagonal is
 * 1.41x its side, the "paused" bars are 2.5x8 …). Rewriting those adjustments per
 * density breaks the shape on one side only. Keep one set of coordinates and scale with
 * a transform.
 */
const BASE = 10

const Root = styled('span')(({ theme }) => ({
  position: 'relative',
  width: theme.markSize,
  height: theme.markSize,
  display: 'inline-block',
  flex: `0 0 ${theme.markSize}px`
}))

const Frame = styled('span')(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  width: BASE,
  height: BASE,
  transform: `scale(${theme.markSize / BASE})`,
  transformOrigin: 'top left'
}))

export interface StatusIndicatorProps extends ShapeProps {
  /**
   * The word for the state. Used for the tooltip and for screen readers.
   * Color and shape alone do not carry the meaning, so a word is always required.
   */
  label: string
}

/** A mark that encodes a state three times over: color + shape + word. */
export function StatusIndicator({ label, ...shape }: StatusIndicatorProps): JSX.Element {
  return (
    <Root title={label} aria-label={label} role="img">
      <Frame>
        <Shape {...shape}>
          {shape.shape === 'spinner' && <LoadingDots size={BASE} />}
        </Shape>
      </Frame>
    </Root>
  )
}

/**
 * A circle that shows nothing but a color. Used for category colors (projects, labels).
 * `muted` is the "not handled in that color" state (disabled, unassigned).
 */
export const Dot = styled('span', {
  shouldForwardProp: blockProps('color', 'size', 'muted', 'emphasis')
})<{
  color?: string
  size?: number
  muted?: boolean
  emphasis?: boolean
}>(({ theme, color, size, muted, emphasis }) => ({
  width: size ?? (emphasis ? feedbackMetrics.dot.emphasized : feedbackMetrics.dot.regular),
  height: size ?? (emphasis ? feedbackMetrics.dot.emphasized : feedbackMetrics.dot.regular),
  flex: `0 0 ${size ?? (emphasis ? feedbackMetrics.dot.emphasized : feedbackMetrics.dot.regular)}px`,
  borderRadius: theme.radius.full,
  background: muted ? theme.palette.text.tertiary : (color ?? 'transparent')
}))
