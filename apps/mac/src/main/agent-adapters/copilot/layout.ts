import { join } from 'node:path'
import {
  copilotSessionsDir
} from '../../appPaths.js'
import type { AdapterLayout } from '../layout.js'

export const layout: AdapterLayout = {

  // -p has no equivalent of --session-id. session-state/<id>/ is picked up afterwards.
  acceptsSessionId: false,
  root: copilotSessionsDir,
  // cwd never becomes a directory name (it lives inside workspace.yaml)
  dirFor: () => null,
  logPathFor: (_cwd, sessionId) => join(copilotSessionsDir(), sessionId, 'events.jsonl')
}
