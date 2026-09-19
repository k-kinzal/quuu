/** Layers a surface while keeping the origin alive. Coming back does not lose the scroll, and a finger's movement is picked up mid-way. */
import { feedbackMetrics } from '../../theme/feedback.js'
import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { styled } from '@mui/material/styles'

const DURATION = feedbackMetrics.motion.navigationMs

const EASE = feedbackMetrics.motion.ease

const PARALLAX = feedbackMetrics.motion.parallax

const DIM = feedbackMetrics.motion.dim

const EDGE = feedbackMetrics.gesture.edge

const COMMIT = feedbackMetrics.gesture.commit

const FLICK = feedbackMetrics.gesture.flick

const MIN_MS = feedbackMetrics.motion.minimumMs

const SLOP = feedbackMetrics.gesture.slop

const Layer = styled('div')({
  position: 'fixed',
  inset: 0
})

const Front = styled(Layer)(({ theme }) => ({
  zIndex: 2,
  boxShadow: theme.shadows[8]
}))

const Back = styled(Layer, { shouldForwardProp: (p) => p !== 'covered' })<{ covered: boolean }>(
  ({ covered }) => ({ zIndex: 1, ...(covered ? { pointerEvents: 'none' } : {}) })
)

const Dim = styled('div')(({ theme }) => ({
  position: 'absolute',
  inset: 0,
  zIndex: 9,
  background: theme.palette.surface.overlay,
  opacity: 0,
  pointerEvents: 'none'
}))

interface Entry {
  key: string
  node: ReactNode
}

export interface NavigationTransitionProps {
  screenKey: string

  onBack?: () => void
  children: ReactNode
}

export function NavigationTransition({
  screenKey,
  onBack,
  children
}: NavigationTransitionProps): JSX.Element {
  const stacked = onBack !== undefined
  const [base, setBase] = useState<Entry>(() =>
    stacked ? { key: '', node: null } : { key: screenKey, node: children }
  )
  const [front, setFront] = useState<Entry | null>(() =>
    stacked ? { key: screenKey, node: children } : null
  )

  const backEl = useRef<HTMLDivElement>(null)
  const frontEl = useRef<HTMLDivElement>(null)
  const dimEl = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<'push' | 'pop' | null>(null)

  const at = useRef(0)

  const popping = useRef(false)

  const flick = useRef(0)
  const gesture = useRef<{
    x: number
    y: number
    id: number
    at: number
    locked: boolean | null
  } | null>(null)

  const width = (): number => window.innerWidth || 1

  const apply = (p: number): void => {
    at.current = p
    const w = width()
    if (frontEl.current) frontEl.current.style.transform = `translateX(${p * w}px)`
    if (backEl.current) backEl.current.style.transform = `translateX(${-(1 - p) * PARALLAX * w}px)`
    if (dimEl.current) dimEl.current.style.opacity = String((1 - p) * DIM)
  }

  const hint = (on: boolean): void => {
    for (const el of [frontEl.current, backEl.current]) {
      if (el) el.style.willChange = on ? 'transform' : ''
    }
  }

  const ease = (ms: number): void => {
    const move = ms > 0 ? `transform ${ms}ms ${EASE}` : ''
    if (frontEl.current) frontEl.current.style.transition = move
    if (backEl.current) backEl.current.style.transition = move
    if (dimEl.current) dimEl.current.style.transition = ms > 0 ? `opacity ${ms}ms ${EASE}` : ''
  }

  const run = (from: number, to: number, done?: () => void): void => {
    if (timer.current) clearTimeout(timer.current)
    const still = Math.abs(to - from)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let ms = reduced ? 0 : Math.max(MIN_MS, Math.round(DURATION * still))
    // Carry the swipe's momentum straight through. A fast swipe that closes slowly feels like it caught on something
    if (flick.current > 0) {
      ms = Math.max(MIN_MS, Math.min(ms, Math.round((still * width()) / flick.current)))
    }
    flick.current = 0

    hint(true)
    ease(0)
    apply(from)
    // Commit it, then animate. Writing both in the same frame jumps straight to the end value
    if (frontEl.current) void frontEl.current.offsetWidth
    ease(ms)
    apply(to)
    timer.current = setTimeout(() => {
      ease(0)
      hint(false)
      done?.()
    }, ms)
  }

  useLayoutEffect(() => {
    if (stacked) {
      if (!front || front.key !== screenKey) {
        setFront({ key: screenKey, node: children })
        pending.current = 'push'
        popping.current = false
      } else if (front.node !== children) {
        setFront({ key: screenKey, node: children })
      }
      return
    }
    if (base.key !== screenKey || base.node !== children) {
      setBase({ key: screenKey, node: children })
    }

    if (front && !popping.current) {
      popping.current = true
      pending.current = 'pop'
    }
  }, [stacked, base.key, base.node, screenKey, children, front])

  useLayoutEffect(() => {
    const kind = pending.current
    if (!kind) return
    if (!frontEl.current) {
      if (kind === 'pop') pending.current = null
      return
    }
    pending.current = null
    if (kind === 'push') {
      run(1, 0)
      return
    }
    // Resume from where the finger dragged to. Resetting to 0 and re-animating makes it bounce once
    run(at.current, 1, () => {
      popping.current = false
      setFront(null)
      apply(1)
    })
  })

  useLayoutEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (!onBack || pending.current || e.clientX > EDGE) return
    gesture.current = { x: e.clientX, y: e.clientY, id: e.pointerId, at: e.timeStamp, locked: null }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y

    if (g.locked === null) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
      g.locked = Math.abs(dx) > Math.abs(dy)
      if (!g.locked) {
        gesture.current = null
        return
      }

      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // The finger was already gone. Even if we cannot capture it, we can still follow
      }
      hint(true)
      ease(0)
    }
    apply(Math.min(1, Math.max(0, dx / width())))
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    gesture.current = null
    if (!g.locked) return

    const dx = Math.max(0, e.clientX - g.x)
    const speed = dx / Math.max(1, e.timeStamp - g.at)
    if (at.current > COMMIT || speed > FLICK) {
      // The pop animation takes it from here (starting at the `at` position)
      flick.current = speed
      onBack?.()
      return
    }
    // It did not reach. Return it to where it was
    run(at.current, 0)
  }

  return (
    <>
      <Back
        key={base.key || 'base'}
        ref={backEl}
        covered={front !== null}
        aria-hidden={front !== null}
      >
        {base.node}
        <Dim ref={dimEl} />
      </Back>
      {front && (
        <Front
          key={front.key}
          ref={frontEl}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {front.node}
        </Front>
      )}
    </>
  )
}
