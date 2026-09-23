import { join } from 'node:path'
import {
  agyBrainDir
} from '../../appPaths.js'
import type { AdapterLayout } from '../layout.js'

export const layout: AdapterLayout = {

  /*
   * `--conversation` resumes an existing conversation and nothing else: handed an id that does
   * not exist it prints `conversation "…" not found` and starts a new one under its own id
   * (measured). The id it chose is picked up from the `init` line it writes to stdout
   * (`session/stdoutSessionId.ts`).
   */
  acceptsSessionId: false,
  root: agyBrainDir,
  // Nothing in the tree is keyed by cwd; a conversation is found by its id alone
  dirFor: () => null,
  logPathFor: (_cwd, sessionId) =>
    sessionId.length === 0
      ? null
      : join(agyBrainDir(), sessionId, '.system_generated', 'logs', 'transcript.jsonl')
}
