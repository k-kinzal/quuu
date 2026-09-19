/** Swipe a row to reveal its actions. It tracks the finger while staying distinct from vertical scrolling, and draws no action surface on a closed row. */
import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { styled } from '@mui/material/styles'
import { Text } from '../data-display/Text.js'
import { feedbackMetrics } from '../../theme/feedback.js'

const OPEN_AT = 0.25

const COMMIT_AT = 0.62

const ACTION_W = feedbackMetrics.gesture.actionWidth

const Root = styled('div')({
  position: 'relative',
  overflow: 'hidden'
})

const Actions = styled('div')({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  display: 'flex'
})

const Action = styled('button', { shouldForwardProp: (p) => p !== 'tone' })<{ tone: string }>(
  ({ theme, tone }) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: ACTION_W,
    border: 0,
    background: tone,
    color: theme.palette.text.inverse,
    font: 'inherit',
    cursor: 'pointer',
    '&:active': { opacity: feedbackMetrics.opacity.secondary }
  })
)

const Sliding = styled('div', { shouldForwardProp: (p) => p !== 'animating' })<{
  animating: boolean
}>(({ theme, animating }) => ({
  position: 'relative',

  background: theme.palette.surface.default,
  ...(animating
    ? { transition: `transform ${feedbackMetrics.motion.slideMs}ms ${feedbackMetrics.motion.ease}` }
    : {}),
  willChange: 'transform'
}))

export interface SwipeAction {
  label: string

  tone: string
  run(): void
}

export function SwipeActions({
  actions,
  children
}: {
  actions: SwipeAction[]
  children: ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [animating, setAnimating] = useState(false)
  // Rows nobody is touching do not build their actions (nothing flickers at the edge of the list)
  const [live, setLive] = useState(false)
  const slide = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ x: number; y: number; base: number; locked: boolean | null } | null>(
    null
  )

  const width = actions.length * ACTION_W
  if (actions.length === 0) return <>{children}</>

  const paint = (dx: number): void => {
    if (slide.current) slide.current.style.transform = `translateX(${dx}px)`
  }

  const settle = (to: number): void => {
    setAnimating(true)
    paint(to)
    setOpen(to !== 0)
    setTimeout(() => {
      setAnimating(false)
      if (to === 0) setLive(false)
    }, feedbackMetrics.motion.slideMs)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.pointerType === 'mouse') return
    gesture.current = { x: e.clientX, y: e.clientY, base: open ? -width : 0, locked: null }
    setLive(true)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.x
    const dy = e.clientY - g.y

    if (g.locked === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      g.locked = Math.abs(dx) > Math.abs(dy)
      if (!g.locked) {
        gesture.current = null
        return
      }
    }
    // It does not open to the right (there are no leading-edge actions)
    paint(Math.min(0, Math.max(-width * 1.4, g.base + dx)))
  }

  const onPointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    const g = gesture.current
    if (!g) return
    gesture.current = null
    if (!g.locked) return

    const dx = Math.min(0, g.base + (e.clientX - g.x))
    const ratio = -dx / (window.innerWidth || 1)

    if (ratio > COMMIT_AT) {
      // Swiped all the way. Perform the first action right there (the iOS full swipe)
      settle(0)
      actions[0].run()
      return
    }
    settle(-dx > width * OPEN_AT ? -width : 0)
  }

  return (
    <Root>
      <Actions aria-hidden={!live}>
        {live &&
          actions.map((a) => (
            <Action
              key={a.label}
              type="button"
              tone={a.tone}
              onClick={() => {
                settle(0)
                a.run()
              }}
            >
              <Text size="sm" weight="medium" color="inherit">
                {a.label}
              </Text>
            </Action>
          ))}
      </Actions>
      <Sliding
        ref={slide}
        animating={animating}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (!open) return
          e.preventDefault()
          e.stopPropagation()
          settle(0)
        }}
      >
        {children}
      </Sliding>
    </Root>
  )
}
