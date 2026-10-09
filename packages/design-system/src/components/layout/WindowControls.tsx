import { createContext, createElement, forwardRef, useContext, useLayoutEffect, useRef, type HTMLAttributes } from 'react'
import { useForkRef } from '@mui/material/utils'
import { observeLayoutMotion } from './MotionLayout.js'

/** The host reports the occupied width once; headers never need to know their screen or neighbors. */
export const WindowControlsContext = createContext<{
  width: number
  height: number
} | null>(null)

const insetProperty = '--ds-window-controls-inset'

/** All window-level heading families share this behavior, including newly composed screens. */
export function windowHeader(tag: 'header' | 'h1') {
  return forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(function WindowHeader(props, forwardedRef) {
    const ref = useRef<HTMLElement>(null)
    const combinedRef = useForkRef(ref, forwardedRef)
    const controls = useContext(WindowControlsContext)

    useLayoutEffect(() => {
      const element = ref.current
      // Descendant layout effects run before the shell's ref is attached on first mount.
      const root = element?.closest<HTMLElement>('[data-ds-app-shell]')
      if (!element || !root || !controls?.width) return

      const update = (): void => {
        const band = root.getBoundingClientRect()
        const rect = element.getBoundingClientRect()
        const overlaps = rect.width > 0 && rect.height > 0 && rect.top < band.top + controls.height && rect.bottom > band.top
        const inset = overlaps ? Math.max(0, band.left + controls.width - rect.left) : 0
        const value = `${inset}px`
        if (element.style.getPropertyValue(insetProperty) !== value) element.style.setProperty(insetProperty, value)
      }

      update()
      // Resizing a preceding sibling can move a fixed-width header without resizing it or its ancestors.
      const resize = new ResizeObserver(update)
      for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
        resize.observe(ancestor)
        if (ancestor === root) break
        for (const sibling of ancestor.parentElement?.children ?? []) resize.observe(sibling)
      }
      const stopMotion = observeLayoutMotion(element, update)
      root.addEventListener('scroll', update, true)
      window.addEventListener('resize', update)
      return () => {
        resize.disconnect()
        stopMotion()
        root.removeEventListener('scroll', update, true)
        window.removeEventListener('resize', update)
        element.style.removeProperty(insetProperty)
      }
    }, [controls])

    return createElement(tag, { ...props, ref: combinedRef })
  })
}
