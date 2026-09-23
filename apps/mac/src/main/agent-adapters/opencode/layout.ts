import {
  opencodeDbPath
} from '../../appPaths.js'
import type { AdapterLayout } from '../layout.js'
import { opencodeSessionExists, readOpencodeSession } from './store.js'

export const layout: AdapterLayout = {

  // `--session` on an id that does not exist exits with "Session not found" (measured)
  acceptsSessionId: false,
  // One store, so there is no tree to sweep for a session that could not be found by id
  root: () => '',
  dirFor: () => null,
  /*
   * The store holds every session, so its mere existence says nothing. Answering with the path
   * for a session that is not in there yet would put an **empty conversation** on screen and
   * stop the run from ever falling back to its stdout.
   */
  logPathFor: (_cwd, sessionId) =>
    sessionId.length > 0 && opencodeSessionExists(sessionId) ? opencodeDbPath() : null,
  wholeStore: true,
  oneStore: true,
  lastWrittenFor: (sessionId) => readOpencodeSession(sessionId)?.updatedMs ?? null
}
