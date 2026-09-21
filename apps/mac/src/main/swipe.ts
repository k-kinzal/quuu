import type { AppCommand } from './ipc/types.js'

/*
 * The trackpad's "swipe between pages" (System Settings › Trackpad › More Gestures).
 *
 * macOS offers it in two forms, and which one a Mac uses is the person's choice:
 *
 *   two fingers   … arrives as ordinary sideways scrolling. The page reads it back
 *                   out of the wheel deltas (`renderer/.../interaction/backForward.ts`)
 *   three fingers … arrives as a gesture on the window (`BrowserWindow` `'swipe'`)
 *                   and produces no scrolling at all
 *
 * Both lead to the Back / Forward the Go menu binds to ⌘[ / ⌘]. Reading only the
 * wheel left a Mac set to three fingers with a swipe that did nothing — no wheel
 * event ever arrives for it. No single gesture produces both forms, so neither can
 * double a step.
 *
 * Kept free of Electron so it can be exercised directly (the same split as
 * `contextMenuTemplate.ts`).
 */

/** The command a three-finger swipe stands for. Up and down are not page swipes. */
export function swipeCommand(direction: string): AppCommand | null {
  if (direction === 'left') return 'view.back'
  if (direction === 'right') return 'view.forward'
  return null
}

/** The preference behind "Swipe between pages: Scroll left or right with two fingers". */
export const SCROLL_SWIPE_DEFAULT = 'AppleEnableSwipeNavigateWithScrolls'

/**
 * Whether a two-finger sideways scroll is this Mac's back / forward.
 *
 * Read as a string so that "never set" is told apart from "turned off": unset is
 * the macOS default, which is on. Off means the person chose three fingers, or no
 * page swipe at all — and then a sideways scroll must stay a scroll. Navigating on
 * it anyway is the very accident the setting was switched off to avoid.
 */
export function scrollSwipeNavigates(stored: string): boolean {
  return stored !== '0'
}
