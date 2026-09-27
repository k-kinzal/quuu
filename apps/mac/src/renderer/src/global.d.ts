import type { QuuuFiles } from '../../api/schemas/files.js'
import type { QuuuEvents } from '../../api/types.js'
import type { QuuuClient } from './state/client.js'

declare global {
  interface Window {
    quuu: QuuuClient
    quuuEvents: QuuuEvents
    quuuFiles: QuuuFiles
  }
}

export { }
