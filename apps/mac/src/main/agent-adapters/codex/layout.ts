import {
  codexSessionsDir
} from '../../appPaths.js'
import type { AdapterLayout } from '../layout.js'
import { resolveCodexLog } from './paths.js'

export const layout: AdapterLayout = {
  scan: resolveCodexLog,
  // codex exec takes no session ID. The one it picks for itself is recovered afterwards.
  acceptsSessionId: false,
  root: codexSessionsDir,
  // The tree is cut by date, so cwd cannot reach it (matched through session_meta's cwd)
  dirFor: () => null,
  logPathFor: () => null
}
