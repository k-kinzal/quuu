import { join } from 'node:path'
import {
  claudeProjectsDir
} from '../../appPaths.js'
import { candidatesIn } from '../discovery.js'
import type { AdapterLayout } from '../layout.js'
import { resolveSessionLogPath, sessionLogDir } from './paths.js'

export const layout: AdapterLayout = {
  resolve: resolveSessionLogPath,
  acceptsSessionId: true,
  root: claudeProjectsDir,
  dirFor: (cwd) => sessionLogDir(cwd),
  logPathFor: (cwd, sessionId) => join(sessionLogDir(cwd), `${sessionId}.jsonl`)
}

export function sessionCandidates(cwd: string) {
  return candidatesIn(layout, cwd, (dir, name) => name.endsWith('.jsonl') ? { sessionId: name.slice(0, -'.jsonl'.length), logPath: join(dir, name) } : null)
}
