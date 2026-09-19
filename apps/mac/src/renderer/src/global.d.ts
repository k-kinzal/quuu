import type { QuuuFiles } from '../../preload/api/files.js'
import type { QuuuEvents } from '../../preload/api.js'
import type { QuuuClient } from './state/client.js'

declare global {
  interface Window {
    quuu: QuuuClient
    quuuEvents: QuuuEvents
    quuuFiles: QuuuFiles
  }
}

export { }
