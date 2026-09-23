import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import {
  cursorChatsDir
} from '../../appPaths.js'
import { candidatesIn } from '../discovery.js'
import { scanLeaf } from '../files.js'
import type { AdapterLayout } from '../layout.js'

export function cursorDirName(cwd: string): string {
  return createHash('md5').update(cwd).digest('hex')
}

export const layout: AdapterLayout = {
  scan: (id) => scanLeaf(cursorChatsDir(), id, 'store.db'),
  acceptsSessionId: true,
  root: cursorChatsDir,
  dirFor: (cwd) => join(cursorChatsDir(), cursorDirName(cwd)),
  logPathFor: (cwd, sessionId) =>
    join(cursorChatsDir(), cursorDirName(cwd), sessionId, 'store.db'),
  /*
   * store.db is SQLite in WAL mode. Writes land in `store.db-wal` first and the main file's
   * mtime only moves at a checkpoint. Watching the main file alone misses the last write by
   * weeks (measured: a chat with the main file at 7/27 and the WAL at 8/17).
   * meta.json can be older than the main file instead (measured 7 minutes off), so watch both.
   *
   * `store.db-shm` is left out. **Quuu merely reading it moves its mtime**, so including it
   * would make every chat look like it was written just now, forever.
   */
  companions: (logPath) => [`${logPath}-wal`, join(dirname(logPath), 'meta.json')],
  wholeStore: true
}

export function sessionCandidates(cwd: string) {
  return candidatesIn(layout, cwd, (dir, name) => ({ sessionId: name, logPath: join(dir, name, 'store.db') }))
}
