import type { QuuuFiles } from '../../api/schemas/files.js'
import type { QuuuEvents } from '../../api/types.js'
import type { QuuuClient } from './state/client.js'

declare global {
  interface Window {
    quuu: QuuuClient
    quuuEvents: QuuuEvents
    quuuFiles: QuuuFiles
    /** `process.platform` of the app; absent where the renderer runs outside Electron. */
    quuuPlatform?: string
  }
}

export { }
