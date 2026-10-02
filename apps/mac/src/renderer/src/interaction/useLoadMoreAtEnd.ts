import { useEffect, type RefObject } from 'react'
import { nearEnd } from '../model/paging.js'

/**
 * Infinite scroll: ask for the next page as the scroll container nears its end.
 *
 * Checked on scroll and on resize, and again each time a page lands (`loaded`). A page that
 * does not fill the pane leaves nothing to scroll, so waiting for a scroll there would leave
 * the rest of the list unreachable.
 *
 * `loadMore` should ask for a count rather than "one more page": scroll events that arrive
 * before the next render would otherwise each add a page.
 */
export function useLoadMoreAtEnd(
  ref: RefObject<HTMLElement>,
  hasMore: boolean,
  loaded: number,
  loadMore: () => void
): void {
  useEffect(() => {
    const el = ref.current
    if (!el || !hasMore) return
    const check = (): void => {
      if (nearEnd(el)) loadMore()
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', check)
      observer.disconnect()
    }
  }, [hasMore, loadMore, loaded, ref])
}
