import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { GIT } from '../platform/executables.js'
import { githubRepositoryFromRemote } from '../platform/githubAuth.js'

/** Refuse local transports and embedded passwords before a URL crosses to another machine. */
export function normalizeRepository(value: string): string {
  const github = githubRepositoryFromRemote(value)
  if (github) return `https://github.com/${github}.git`
  const scp = /^([\w.-]+)@([\w.-]+):([\w./-]+)$/.exec(value)
  const url = new URL(scp ? `ssh://${scp[1]}@${scp[2]}/${scp[3]}` : value)
  if (!['https:', 'ssh:'].includes(url.protocol) || url.password || url.search || url.hash ||
    (url.protocol === 'https:' && url.username) || !url.hostname || url.pathname === '/') {
    throw new Error('A credential-free HTTPS or SSH Git remote is required')
  }
  return url.href
}

export function projectRepository(path: string, configured = ''): { repository: string; subdirectory: string } {
  const read = (args: string[]): string => execFileSync(GIT, ['-C', path, ...args], {
    encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore']
  }).trim()
  const root = read(['rev-parse', '--show-toplevel'])
  let remote = configured.trim()
  if (!remote) {
    const names = read(['remote']).split('\n').filter(Boolean)
    const name = names.includes('origin') ? 'origin' : names.length === 1 ? names[0] : ''
    if (!name) throw new Error('Choose a Git remote for this project')
    remote = read(['remote', 'get-url', name])
  }
  const subdirectory = relative(realpathSync(resolve(root)), realpathSync(resolve(path))).split('\\').join('/')
  if (subdirectory.startsWith('..')) throw new Error('Project directory is outside the Git repository')
  return { repository: normalizeRepository(remote), subdirectory }
}
