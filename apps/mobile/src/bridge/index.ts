import type { Bridge } from './contract.js'
export type { Bridge, FolderState } from './contract.js'

/**
 * On a real device (WKWebView) use the shell bridge; otherwise the fake iCloud.
 *
 * **The point is keeping a browser usable during development.** Make it device-only and
 * every screen fix has a build and a transfer wedged in front of it, which lands you
 * back at "fixing without looking".
 */
export async function createBridge(): Promise<Bridge> {
  if (typeof window !== 'undefined' && window.webkit?.messageHandlers?.quuu) {
    const { WebKitBridge } = await import('./webkit.js')
    return new WebKitBridge()
  }
  const { MemoryBridge } = await import('./memory.js')
  return new MemoryBridge()
}
