import { useEffect, type RefObject } from 'react'

/**
 * Advance a subtree's CSS animations on a coarse clock instead of every frame.
 *
 * A stylesheet animation that cannot run on the compositor (a background sweep) costs a
 * whole main-thread frame each tick, and in a window drawing a long list or conversation
 * one such frame is measured in milliseconds. The stylesheet still describes the motion
 * in full; this only decides when it is sampled. Each animation is taken over where it
 * stands and its clock advanced by real elapsed time on every step, so it follows exactly
 * the curve, delays and directions the keyframes declare. A hidden window keeps the held
 * time, the same as the stylesheet's own pause.
 *
 * Only for motion that is already on the main thread and small on screen. Motion the
 * compositor could carry is not made cheaper by this, and a wide, faint field drawn in
 * few colour levels turns each step into a shimmer along every band (see AmbientGradient).
 */
export function useSampledAnimations(target: RefObject<HTMLElement | null>, stepMs: number): void {
  useEffect(() => {
    const element = target.current
    if (!element || typeof element.getAnimations !== 'function') return
    let origins = new WeakMap<Animation, number>()
    let animations: Animation[] = []
    let read = -Infinity
    let resumed = 0
    let timer: number | null = null
    const step = (): void => {
      const now = performance.now()
      const elapsed = now - resumed
      // Asking for the animations flushes style, so ask about once a second rather than every
      // step; that is often enough to notice a media query dropping and recreating them.
      if (now - read >= 1000) {
        animations = element.getAnimations({ subtree: true })
        read = now
      }
      for (const animation of animations) {
        let origin = origins.get(animation)
        if (origin === undefined) {
          animation.pause()
          origin = (typeof animation.currentTime === 'number' ? animation.currentTime : 0) - elapsed
          origins.set(animation, origin)
        }
        animation.currentTime = origin + elapsed
      }
    }
    const run = (): void => {
      if (timer !== null) return
      origins = new WeakMap()
      read = -Infinity
      resumed = performance.now()
      step()
      timer = window.setInterval(step, stepMs)
    }
    const halt = (): void => {
      if (timer === null) return
      window.clearInterval(timer)
      timer = null
    }
    const sync = (): void => { if (document.hidden) halt(); else run() }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => {
      halt()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [target, stepMs])
}
