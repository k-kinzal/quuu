import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { userDataDir } from '../appPaths.js'
import windowsLaunchSource from './windowsLaunch.mjs?raw'

/**
 * The process that wraps a detached launch (an agent run, a hook, a report generator).
 *
 * On macOS it is `/bin/sh -c <wrapper>` with the launch as `"$@"`, exactly as each caller writes
 * its wrapper. Windows has no sh, so the same duties (leave the exit code in `QUUU_EXIT_FILE`,
 * the pid in `QUUU_HOOK_PID_FILE`, exit with the child's code) are done by `windowsLaunch.mjs`
 * under Quuu's own runtime, which is always there.
 */
export interface DetachedLaunch {
  command: string
  args: string[]
  /** Layered over the caller's environment. */
  env: NodeJS.ProcessEnv
}

export function detachedLaunch(posixWrapper: string, name: string, launch: string[]): DetachedLaunch {
  if (process.platform !== 'win32') {
    return { command: '/bin/sh', args: ['-c', posixWrapper, name, ...launch], env: {} }
  }
  return { command: process.execPath, args: [windowsLauncherPath(), ...launch], env: { ELECTRON_RUN_AS_NODE: '1' } }
}

/**
 * Where the Windows wrapper is written. Named by its content, so a rebuilt Quuu never rewrites the
 * file an agent started by the previous build is still running from.
 */
function windowsLauncherPath(): string {
  const source = `${windowsLaunchSource}\nawait run()\n`
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 16)
  const dir = join(userDataDir(), 'bin')
  const path = join(dir, `launch-${hash}.mjs`)
  if (!existsSync(path)) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(path, source, 'utf8')
  }
  return path
}
