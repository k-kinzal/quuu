import { useEffect } from 'react'
import { useStore } from '../state/store.js'
import { focusAny, focusPane } from './focus.js'

/**
 * Back and forward, driven from a key or a swipe.
 *
 * Both ends come through here so they land identically: the store owns the
 * trail (`state/navigation.ts`), and arriving somewhere hands that pane the
 * keyboard — the same thing ⌘1–⌘9 do. Arriving with focus left behind makes ↑↓
 * belong to whatever the hands were on before the press, which is how the list
 * silently stops moving.
 */
export async function stepHistory(step: -1 | 1): Promise<void> {
  const state = useStore.getState()
  const place = await (step === -1 ? state.goBack() : state.goForward())
  // Nowhere to go. Say nothing — a swipe at the end of the trail is not a failure
  if (!place) return
  // The destination pane is only in the DOM after the redraw (App's `focusPaneSoon` has the same reason)
  requestAnimationFrame(() => {
    if (place.section.kind === 'settings') focusPane('settings')
    else focusAny('list', 'chat', 'rail')
  })
}

/**
 * How far a swipe has to travel to mean back or forward, in CSS pixels.
 *
 * Low enough that an ordinary flick clears it in one go, high enough that a
 * hand drifting sideways over a scroll never does.
 */
const TRAVEL = 90

/**
 * A trackpad keeps sending for a while after the fingers lift (momentum), so a
 * gesture is not over when the deltas stop climbing — it is over after a gap
 * this long with nothing arriving at all.
 */
const REST_MS = 200

/**
 * A gesture that already moved a step needs this much quiet before another counts.
 *
 * Its own tail is still arriving, and the step it just took redrew the window —
 * work heavy enough that the stream can break and come back looking like a fresh
 * flick. One flick must never move two screens, so the coasting half of a swipe
 * is given a wider berth than an ordinary pause.
 */
const SETTLE_MS = 500

/** A wheel event reduced to what a swipe is read out of. */
export interface SwipeSample {
  deltaX: number
  deltaY: number
  timeStamp: number
}

/**
 * Read swipes out of a stream of wheel events.
 *
 * macOS hands a two-finger swipe to the page as plain horizontal scrolling —
 * there is no gesture event to listen for — so the gesture has to be read back
 * out of the deltas. Which way a given flick counts follows the deltas, so
 * whichever way the trackpad is set to scroll, the swipe that means "back" here
 * is the one that means "back" everywhere else on the machine.
 *
 * Kept free of the DOM so the thresholds can be exercised directly.
 */
export function createSwipeReader(go: (step: -1 | 1) => void): (sample: SwipeSample) => void {
  let x = 0
  let y = 0
  let last = 0
  let spent = false

  return (sample) => {
    const quiet = sample.timeStamp - last
    last = sample.timeStamp
    if (quiet > (spent ? SETTLE_MS : REST_MS)) {
      x = 0
      y = 0
      spent = false
    }
    // The rest of this gesture is momentum from a swipe already acted on
    if (spent) return

    x += sample.deltaX
    y += sample.deltaY
    /*
     * Judge only once it has gone far enough. The first few events of any
     * gesture are a handful of pixels in no particular direction, and calling
     * those either way would make every swipe a coin toss
     */
    if (Math.abs(x) < TRAVEL) return
    // One gesture moves one step, however long it runs on afterwards
    spent = true
    // Diagonal is a scroll that drifted, not a swipe. Going somewhere is not what it asked for
    if (Math.abs(y) > Math.abs(x) / 2) return
    go(x < 0 ? -1 : 1)
  }
}

/** Swiping sideways goes back and forward, the way it does in every other window on the machine. */
export function useSwipeBackForward(): void {
  useEffect(() => {
    const read = createSwipeReader((step) => void stepHistory(step))

    const onWheel = (event: WheelEvent): void => {
      // A mouse reports in lines or pages; only a trackpad reports pixels, and only it can swipe
      if (event.deltaMode !== 0) return
      // While the palette is open the screen behind it is not being driven (the same rule the keys follow)
      if (useStore.getState().paletteOpen) return
      // Something still able to scroll sideways gets the gesture first. Without this a wide
      // table or a long line of code would send you back instead of scrolling
      if (absorbs(event.target, event.deltaX)) return
      read(event)
    }

    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])
}

/** Whether anything under the pointer still has room to scroll the way the swipe is going. */
function absorbs(target: EventTarget | null, deltaX: number): boolean {
  let node = target instanceof Element ? target : null
  while (node) {
    // Cheap test first: computed styles are only worth asking for where there is something to scroll
    if (node.scrollWidth > node.clientWidth) {
      const overflow = getComputedStyle(node).overflowX
      if (overflow === 'auto' || overflow === 'scroll') {
        const room = deltaX < 0 ? node.scrollLeft : node.scrollWidth - node.clientWidth - node.scrollLeft
        // At its own edge it has nothing left to absorb, so the swipe carries on to the window
        if (room > 1) return true
      }
    }
    node = node.parentElement
  }
  return false
}
