import { useSyncExternalStore } from 'react'

let now = Date.now()
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function tick(): void {
  now = Date.now()
  for (const notify of listeners) notify()
}

function visibilityChanged(): void {
  if (timer !== null) clearInterval(timer)
  timer = null
  if (!document.hidden) {
    tick()
    timer = setInterval(tick, 1000)
  }
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify)
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', visibilityChanged)
    now = Date.now()
    visibilityChanged()
  }
  return () => {
    listeners.delete(notify)
    if (listeners.size === 0) {
      if (timer !== null) clearInterval(timer)
      timer = null
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }
}

const fixed = (): (() => void) => () => undefined

/** One clock for visible time labels; unchanged text does not render its component again. */
export function useClockText(format: (now: number) => string, live = true): string {
  return useSyncExternalStore(live ? subscribe : fixed, () => format(live ? now : Date.now()))
}
