import { EmbeddedContentHost, observeLayoutMotion } from '@design-system/react'
import { useLayoutEffect, useRef } from 'react'
import { t } from '../model/i18n/index.js'
import { failureReason } from '../model/operationFailure.js'
import { useNativeViewHidden } from '../interaction/useNativeViewHidden.js'

export function DocumentWebsite({ projectId, url, onError, reload }: {
  projectId: string; url: string; onError(reason: string): void; reload: boolean
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const reloading = useRef(reload)
  const hidden = useNativeViewHidden()
  useLayoutEffect(() => {
    const element = host.current
    if (!element || hidden) return
    let active = true
    let frame: number | null = null
    const update = async (): Promise<void> => {
      frame = null
      if (!active) return
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      if (reloading.current) { reloading.current = false; await window.quuu.documents.navigate('reload') }
      if (!active) return
      const result = await window.quuu.documents.show({ projectId, url, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }, { context: { feedback: 'inline' } })
      if (active && !result.ok) onError(result.reason ?? '')
    }
    const schedule = (): void => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { void update().catch((error: unknown) => { if (active) onError(failureReason(error)) }) })
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(element)
    const stop = observeLayoutMotion(element, schedule)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      active = false
      if (frame !== null) cancelAnimationFrame(frame)
      observer?.disconnect()
      stop()
      window.removeEventListener('resize', schedule)
      void window.quuu.documents.hide()
    }
  }, [onError, hidden, projectId, url])
  return <EmbeddedContentHost ref={host} aria-label={t('projectDocuments.websites')} />
}
