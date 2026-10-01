import { EmbeddedContentHost, observeLayoutMotion } from '@design-system/react'
import { useLayoutEffect, useRef } from 'react'
import type { PullRequestViewBounds } from '../../../api/schemas/workbench.js'
import { useNativeViewHidden } from '../interaction/useNativeViewHidden.js'
import { t } from '../model/i18n/index.js'

function viewBounds(element: HTMLElement): PullRequestViewBounds | null {
  const rect = element.getBoundingClientRect()
  const bounds = {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  }
  return bounds.width > 0 && bounds.height > 0 ? bounds : null
}

/**
 * GitHub's own page for one Pull Request, laid over the area this host occupies.
 *
 * The page is a native view owned by main under `id`; this only keeps it on the host's bounds,
 * and hides it when the host goes away. Closing it for good is the caller's, which knows when
 * the tab is gone rather than just out of sight.
 */
export function PullRequestBrowser({
  id,
  pullRequest,
  onError
}: {
  id: string
  pullRequest: { number: number; url: string }
  onError(reason: string): void
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const hidden = useNativeViewHidden()
  const { url } = pullRequest

  useLayoutEffect(() => {
    const element = host.current
    if (!element || hidden) return
    let frame: number | null = null
    let active = true
    let reported = false
    const update = (): void => {
      frame = null
      const bounds = viewBounds(element)
      if (!bounds) return
      void window.quuu.review
        .openPullRequest({ id, url, bounds })
        .then((result) => {
          if (!active) return
          if (result.ok) {
            reported = false
          } else if (!reported) {
            reported = true
            onError(result.reason ?? t('reviewPane.viewRejected'))
          }
        })
        .catch((caught: unknown) => {
          if (!active || reported) return
          reported = true
          onError(caught instanceof Error ? caught.message : String(caught))
        })
    }
    const schedule = (): void => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    const stopFollowingMotion = observeLayoutMotion(element, schedule)
    observer?.observe(element)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      active = false
      if (frame !== null) cancelAnimationFrame(frame)
      observer?.disconnect()
      stopFollowingMotion()
      window.removeEventListener('resize', schedule)
      void window.quuu.review.hidePullRequest(id)
    }
  }, [onError, hidden, id, url])

  return <EmbeddedContentHost ref={host} aria-label={`Pull Request #${String(pullRequest.number)}`} />
}
