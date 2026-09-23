import { join } from 'node:path'
import {
  grokSessionsDir
} from '../../appPaths.js'
import { candidatesIn } from '../discovery.js'
import { scanLeaf } from '../files.js'
import type { AdapterLayout } from '../layout.js'

export function grokDirName(cwd: string): string {
  return encodeURIComponent(cwd)
}

export const layout: AdapterLayout = {
  scan: (id) => scanLeaf(grokSessionsDir(), id, 'chat_history.jsonl'),
  acceptsSessionId: true,
  root: grokSessionsDir,
  dirFor: (cwd) => join(grokSessionsDir(), grokDirName(cwd)),
  logPathFor: (cwd, sessionId) =>
    join(grokSessionsDir(), grokDirName(cwd), sessionId, 'chat_history.jsonl')
}

export function sessionCandidates(cwd: string) {
  return candidatesIn(layout, cwd, (dir, name) => ({ sessionId: name, logPath: join(dir, name, 'chat_history.jsonl') }))
}
