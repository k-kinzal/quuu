import { keyframes, styled } from '@mui/material/styles'
import { blockProps } from '../../theme/styled.js'

// One fixed circle stays legible at status-mark size; only its light travels.
const DOT_COUNT = 8
const PERIOD_MS = 3600
const breathe = keyframes({
  '0%, 100%': { opacity: 0.4 },
  '50%': { opacity: 0.9 }
})
const dots = Array.from({ length: DOT_COUNT }, (_, index) => {
  const angle = index * Math.PI * 2 / DOT_COUNT - Math.PI / 2
  return { x: 12 + Math.cos(angle) * 9.5, y: 12 + Math.sin(angle) * 9.5 }
})

const Root = styled('span', { shouldForwardProp: blockProps('size') })<{ size?: number }>(
  ({ theme, size }) => ({
    position: 'relative', display: 'block', flexShrink: 0,
    width: size ?? theme.iconSize.sm, height: size ?? theme.iconSize.sm,
    fill: 'currentColor',
    '@media (prefers-reduced-motion: reduce), (forced-colors: active)': {
      '& > svg': { animation: 'none', opacity: 0.75 }
    }
  })
)

/*
 * Every dot is its own drawing, stacked over the same square, so that its opacity can
 * breathe on the compositor. Circles inside one drawing would breathe on the main thread,
 * and each such frame repaints the list or conversation the mark sits in.
 */
const Dot = styled('svg', { shouldForwardProp: blockProps('index') })<{ index: number }>(
  ({ index }) => ({
    position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%',
    opacity: 0.65,
    animation: `${breathe} ${PERIOD_MS}ms ease-in-out infinite`,
    // Start with a complete wave so mounting never flashes all dots together.
    animationDelay: `${-index * PERIOD_MS / DOT_COUNT}ms`
  })
)

/** Decorative geometry; the containing status or control owns its accessible name. */
export function LoadingDots({ size }: { size?: number }): JSX.Element {
  return <Root size={size} aria-hidden="true">
    {dots.map(({ x, y }, index) => (
      <Dot key={index} index={index} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx={x} cy={y} r={2.15} />
      </Dot>
    ))}
  </Root>
}

/** MUI's loading slot requires an indeterminate progressbar with an accessible name. */
export function LoadingProgress({ labelledBy }: { labelledBy: string }): JSX.Element {
  return <span role="progressbar" aria-labelledby={labelledBy}><LoadingDots /></span>
}
