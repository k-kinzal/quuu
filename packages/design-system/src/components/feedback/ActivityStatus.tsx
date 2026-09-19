import { useRef } from 'react'
import { keyframes, styled } from '@mui/material/styles'
import { useSampledAnimations } from '../../theme/sampledMotion.js'

const shimmer = keyframes({
  from: { backgroundPosition: '100% 0' },
  to: { backgroundPosition: '0% 0' }
})

/**
 * The sweep is painted on the main thread (a background position cannot move on the
 * compositor), and it sits at the foot of a conversation whose every frame is costly.
 * Thirty samples a second move the soft band under four pixels per step, which reads
 * as the same motion, at half the frames.
 */
const STEP_MS = 1000 / 30

const Root = styled('div')(({ theme }) => ({
  display: 'flex', alignItems: 'center', gap: theme.spacing(2),
  width: 'fit-content', maxWidth: '100%', minHeight: theme.density.row.md,
  boxSizing: 'border-box', padding: `${theme.spacing(1)} 0`,
  ...theme.typography.body2,
  fontWeight: theme.typography.fontWeightMedium,
  '&::before': {
    content: '""', flexShrink: 0,
    width: theme.markSize / 2, height: theme.markSize / 2,
    borderRadius: theme.radius.full, backgroundColor: theme.palette.primaryText
  }
}))

const Label = styled('span')(({ theme }) => ({
  minWidth: 0, overflowWrap: 'anywhere', color: theme.palette.text.secondary,
  // Both ends stay readable; motion must never make the label disappear.
  '@supports (background-clip: text)': {
    backgroundImage: `linear-gradient(90deg, ${theme.palette.text.secondary} 25%, ${theme.palette.text.primary} 50%, ${theme.palette.text.secondary} 75%)`,
    backgroundSize: '250% 100%', backgroundClip: 'text', color: 'transparent',
    animation: `${shimmer} 2400ms ease-in-out infinite`,
    // A layer of its own. The sweep repaints every frame, and the label sits at the foot
    // of a conversation that may be enormous; it must never drag that repaint along.
    willChange: 'transform'
  },
  '@media (prefers-reduced-motion: reduce), (forced-colors: active)': {
    animation: 'none', backgroundImage: 'none', color: theme.palette.text.secondary
  }
}))

/** A quiet, single-line sign of ongoing work; the caller owns the state and wording. */
export function ActivityStatus({ label }: { label: string }): JSX.Element {
  const sweep = useRef<HTMLSpanElement>(null)
  useSampledAnimations(sweep, STEP_MS)
  return <Root role="status" aria-live="polite" aria-atomic="true"><Label ref={sweep}>{label}</Label></Root>
}
