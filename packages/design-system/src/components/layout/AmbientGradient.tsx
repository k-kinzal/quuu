import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { alpha, keyframes, styled } from '@mui/material/styles'
import { ambientGradient } from '../../theme/tokens.js'
import { blockProps } from '../../theme/styled.js'

const drift = keyframes({
  '0%, 100%': { transform: 'translate(-18%, -12%) rotate(-12deg)' },
  '33%': { transform: 'translate(22%, 8%) rotate(14deg)' },
  '66%': { transform: 'translate(-4%, 24%) rotate(-4deg)' }
})

const Field = styled('div')(({ theme }) => ({
  position: 'fixed',
  inset: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
  userSelect: 'none',
  // A single transparent composite covers opaque panes and glass equally.
  // Keeping it outside layout transitions avoids snapshots of the decoration.
  zIndex: theme.zIndex.tooltip + 1,
  isolation: 'isolate',
  opacity: ambientGradient.opacity,
  '&[data-paused] > div': { animationPlayState: 'paused' },
  '@media (prefers-reduced-motion: reduce), (forced-colors: active)': {
    display: 'none',
    '& > div': { animation: 'none' }
  }
}))

const Light = styled('div', { shouldForwardProp: blockProps('color', 'index') })<{
  color: string
  index: number
}>(({ color, index }) => ({
  position: 'absolute',
  width: '100%',
  height: '120%',
  left: ['-40%', '15%', '-25%', '20%', '-5%'][index],
  top: ['-45%', '-35%', '5%', '10%', '-10%'][index],
  // Soft radial stops need no full-window blur or per-frame paint work.
  background: `radial-gradient(ellipse closest-side, ${color} 0%, ${alpha(color, 0.7)} 25%, ${alpha(color, 0.2)} 65%, ${alpha(color, 0)} 100%)`,
  /*
   * The drift stays on the compositor, advanced every frame. Sampling it on a coarse clock
   * (to spare an idle window the redraw) was tried and shimmered: at this opacity a light
   * resolves to only a handful of colour levels, so it is drawn as wide one-level bands,
   * and a step of a few pixels flips every pixel along every band edge in the same frame.
   * Measured on the Mac window that was tens of thousands of pixels jumping in lockstep
   * five times a second. Moved a fraction of a pixel per frame, the same edges drift unseen.
   */
  animation: `${drift} ${ambientGradient.periods[index]}s ease-in-out infinite`,
  animationDelay: `${-index * 29}s`,
  animationDirection: index % 2 ? 'reverse' : 'normal'
}))

/** Barely perceptible, viewport-wide color drift; no input or document semantics. */
export function AmbientGradient(): JSX.Element {
  const [paused, setPaused] = useState(() => document.hidden)
  useEffect(() => {
    const sync = (): void => setPaused(document.hidden)
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  return createPortal(
    <Field aria-hidden="true" data-ambient-gradient="" data-paused={paused ? '' : undefined}>
      {ambientGradient.colors.map((color, index) => <Light key={color} color={color} index={index} />)}
    </Field>,
    document.body
  )
}
