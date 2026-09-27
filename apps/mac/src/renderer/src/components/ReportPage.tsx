import { observeLayoutMotion, EmbeddedContentHost as EmbeddedBrowserHost } from '@design-system/react'
import { useLayoutEffect, useRef } from 'react'
import type { PullRequestViewBounds } from '../../../preload/api/workbench.js'
import { t } from '../model/i18n/index.js'
import { useStore } from '../state/store.js'

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

export function ReportPage({
  taskId,
  projectId,
  path,
  onError
}: {
  path: string
  onError(reason: string): void
} & ({ taskId: string; projectId?: never } | { projectId: string; taskId?: never })): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const paletteOpen = useStore((s) => s.paletteOpen)

  useLayoutEffect(() => {
    const element = host.current
    if (!element || paletteOpen) return
    let frame: number | null = null
    let active = true
    const update = (): void => {
      frame = null
      const bounds = viewBounds(element)
      if (!bounds) return
      const shown = projectId !== undefined
        ? window.quuu.report.projectShow({ projectId, bounds })
        : window.quuu.report.show({ taskId, bounds })
      void shown
        .then((result) => { if (active && !result.ok) onError(result.reason ?? '') })
        .catch((caught: unknown) => {
          if (active) onError(caught instanceof Error ? caught.message : String(caught))
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
      void window.quuu.report.hide()
    }
  }, [onError, paletteOpen, path, projectId, taskId])

  return <EmbeddedBrowserHost ref={host} aria-label={projectId ? t('projectDashboard.report') : t('reviewPane.modeReport')} />
}
