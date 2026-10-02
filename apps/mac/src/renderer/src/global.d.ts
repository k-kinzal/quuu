import type { QuuuFiles } from '../../api/schemas/files.js'
import type { QuuuTelemetry } from '../../api/schemas/telemetry.js'
import type { QuuuEvents } from '../../api/types.js'
import type { QuuuClient } from './state/client.js'

declare global {
  interface Window {
    quuu: QuuuClient
    quuuEvents: QuuuEvents
    quuuFiles: QuuuFiles
    /** Absent where the renderer runs outside Electron (tests, Storybook). */
    quuuTelemetry?: QuuuTelemetry
    /** `process.platform` of the app; absent where the renderer runs outside Electron. */
    quuuPlatform?: string
  }
}

export { }
