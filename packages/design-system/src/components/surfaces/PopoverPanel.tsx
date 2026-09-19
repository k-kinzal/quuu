import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { styled } from '@mui/material/styles'
import { riseIn } from '../../theme/styled.js'

/**
 * The base for surfaces that come out stuck to the thing you pressed.
 *
 * **Everything that breaks when you draw a surface inside the window is taken on
 * here.** Do not put a surface inside the window without going through this. What it
 * takes on is known, and it is only these five.
 *
 * | How it breaks | How it is handled |
 * |--------|--------|
 * | Crushed at the window edge | Draw, then measure, and place it on the side it fits. If it fits nowhere, pull it inside the screen |
 * | The scrim swallows the next click | Lay no scrim. A press outside reaches its real target |
 * | Does not follow when the surface moves | Close on scroll (never leave it pinned to a stale position) |
 * | Stays up when you switch apps | Close when the window loses focus |
 * | Flashes before its place is settled | Do not show it until it has been measured |
 *
 * The keyboard varies with the shape of the contents, so it does not live here (the
 * caller owns it).
 */

/** The gap between the surface and the thing pressed. Not so close they look fused, not so far it puzzles */
const GAP = 6

/** The minimum gap from the screen edge. Once it reaches here, pull it in */
const EDGE = 8

export interface PanelPlacement {
  /**
   * The direction to try first. If it does not fit, fall to the opposite side.
   *   below / above … below (above) the thing pressed. Surfaces opened from buttons and chips
   *   right         … to the right of the pressed row. **Submenus** (swings left if it does not fit)
   */
  prefer?: 'below' | 'above' | 'right'
  /** The horizontal datum. Things sitting at the right edge use 'end' (so the surface never leaves the window) */
  align?: 'start' | 'end'
}

export interface PanelPosition {
  top: number
  left?: number
  right?: number
  /** Until measuring is done the place is not settled. Do not show it before then */
  visibility: 'visible' | 'hidden'
}

/**
 * Where it sticks, and the conditions for closing.
 *
 * The position is decided **by drawing first and then measuring**. The height of the
 * contents varies with the number of items, so it cannot be settled by counting.
 */
export function usePopoverPanel({
  open,
  anchorEl,
  placement = {},
  onClose
}: {
  open: boolean
  anchorEl: HTMLElement | null
  placement?: PanelPlacement
  onClose(): void
}): { panelRef: React.RefObject<HTMLDivElement>; position: PanelPosition } {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<PanelPosition>({ top: 0, visibility: 'hidden' })
  const { prefer = 'below', align = 'start' } = placement

  const close = useCallback(() => onClose(), [onClose])

  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setPosition({ top: 0, visibility: 'hidden' })
      return
    }
    const panel = panelRef.current
    if (!panel) return

    let vertical = prefer === 'above' ? 'above' : 'below'
    const place = (): void => {
      const rect = anchorEl.getBoundingClientRect()
      const height = panel.offsetHeight
      const width = panel.offsetWidth

      /*
       * A submenu goes to the right of the row. **If it does not fit, swing it left.**
       * Opened from a surface pinned to the right edge of the screen there is no room
       * on the right (it actually went outside the window).
       */
      if (prefer === 'right') {
        const toRight = rect.right + 4
        const left = toRight + width <= window.innerWidth - EDGE ? toRight : rect.left - width - 4
        setPosition({
          top: Math.max(EDGE, Math.min(rect.top - 4, window.innerHeight - height - EDGE)),
          left: Math.max(EDGE, left),
          visibility: 'visible'
        })
        return
      }

      const below = rect.bottom + GAP
      const above = rect.top - GAP - height

      const fitsBelow = below + height <= window.innerHeight - EDGE
      const fitsAbove = above >= EDGE
      // Flipping between above and below every time filtering shrinks it makes the eye
      // and the hand lose the candidates. Keep the current side as long as it fits.
      if (vertical === 'below' && !fitsBelow && fitsAbove) vertical = 'above'
      else if (vertical === 'above' && !fitsAbove && fitsBelow) vertical = 'below'
      const top = vertical === 'above' ? above : Math.min(below, window.innerHeight - height - EDGE)

      setPosition({
        top: Math.max(EDGE, top),
        ...(align === 'end'
          ? { right: Math.max(EDGE, window.innerWidth - rect.right) }
          : { left: Math.max(EDGE, Math.min(rect.left, window.innerWidth - width - EDGE)) }),
        visibility: 'visible'
      })
    }
    place()
    // Even when filtering or disclosure changes the surface height, never leave it far from its entrance.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    observer?.observe(panel)
    return () => observer?.disconnect()
  }, [open, anchorEl, prefer, align])

  useEffect(() => {
    if (!open) return
    /*
     * Press outside and it closes. **The press is not swallowed** (no scrim is laid),
     * so no click is spent on closing and the press reaches its target as it is.
     */
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Node | null
      if (panelRef.current?.contains(target ?? null)) return
      if (anchorEl?.contains(target ?? null)) return
      close()
    }
    /*
     * Close when what it sits on moves, because the anchor shifts and only the surface
     * gets left behind.
     *
     * **Do not close when the scroll is inside the surface.** We listen in the capture
     * phase here, so scrolling a surface whose contents overflow reaches this handler
     * too. Without the distinction, contents that do not fit can **never be seen**
     * (it closes the instant you scroll). That is what it did.
     */
    const onScroll = (e: Event): void => {
      const target = e.target
      if (target instanceof Node && panelRef.current?.contains(target)) return
      close()
    }
    const onBlur = (): void => close()
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('blur', onBlur)
    }
  }, [open, anchorEl, close])

  return { panelRef, position }
}

/**
 * How a floating surface looks. **A 1px rule + a shadow** (house rule — for a floating
 * surface those two come as a set). It is a small surface stuck to the thing pressed,
 * so the corners and padding are one step smaller.
 */
export const PopoverSurface = styled('div')(({ theme }) => ({
  position: 'fixed',
  zIndex: theme.zIndex.tooltip,
  minWidth: 168,
  maxHeight: '60vh',
  overflowY: 'auto',
  padding: theme.spacing(1),
  border: `1px solid ${theme.palette.border.strong}`,
  borderRadius: theme.radius.md,
  background: theme.palette.surface.raised,
  boxShadow: theme.shadows[24],
  outline: 'none',
  animation: `${riseIn} ${theme.transitions.duration.shortest}ms ease-out`
}))
