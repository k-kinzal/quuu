import { closeSync, openSync, readSync, rmSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { userDataDir } from '../appPaths.js'
import { OUTPUT_PREFIX } from './boundedOutput.mjs'

/** Provider-owned transcripts and mirrored structured conversations are never runtime receipts. */
export function isRuntimeOutput(path: string, dataRoot = userDataDir()): boolean {
  return path.endsWith('.log') && [join(dataRoot, 'logs'), join(dataRoot, 'reports')].some(root => {
    const child = relative(resolve(root), resolve(path))
    return child !== '' && !child.startsWith('..') && !isAbsolute(child)
  })
}

export function isOutputSnapshot(path: string): boolean {
  let fd: number | undefined
  try {
    fd = openSync(path, 'r')
    const head = Buffer.alloc(Buffer.byteLength(OUTPUT_PREFIX))
    return readSync(fd, head, 0, head.length, 0) === head.length && head.toString() === OUTPUT_PREFIX
  } catch { return false }
  finally { if (fd !== undefined) closeSync(fd) }
}

export function removeRuntimeOutput(path: string, dataRoot = userDataDir()): void {
  if (!isRuntimeOutput(path, dataRoot)) throw new Error('Refusing to remove a provider transcript')
  for (const file of [path, path + '.tmp', path.replace(/\.log$/, '.exit'), path.replace(/\.log$/, '.exit.pid')]) {
    rmSync(file, { force: true })
  }
}
