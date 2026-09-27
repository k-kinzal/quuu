import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readlink } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, {
    cwd, encoding: 'utf8', timeout: 60_000, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }
  })
  return stdout
}

/** Stream binary diffs into the digest so large changes never get silently truncated. */
function diffHash(cwd: string, staged: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const child = spawn('git', [
      '-c', 'diff.submodule=short', 'diff', ...(staged ? ['--cached'] : []),
      '--binary', '--no-ext-diff', '--no-textconv', '--no-renames', '--no-color', '--'
    ], { cwd, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let error = ''
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Project report diff timed out')) }, 60_000)
    child.stdout.on('data', (chunk: Buffer) => hash.update(chunk))
    child.stderr.on('data', (chunk: Buffer) => { error = (error + chunk.toString()).slice(-2000) })
    child.on('error', (cause) => { clearTimeout(timeout); reject(cause) })
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) resolve(hash.digest('hex'))
      else reject(new Error(error || `Project report diff exited with ${code}`))
    })
  })
}

/** Content, names and modes count; timestamps and ignored build artifacts do not. */
async function untrackedHash(cwd: string): Promise<string> {
  const names = (await git(cwd, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean).sort()
  const hash = createHash('sha256')
  for (const name of names) {
    const file = join(cwd, name)
    const stat = await lstat(file)
    const content = createHash('sha256')
    if (stat.isSymbolicLink()) content.update(await readlink(file))
    else if (stat.isFile()) {
      for await (const chunk of createReadStream(file)) content.update(chunk as Buffer)
    } else throw new Error(`Cannot fingerprint untracked path: ${name}`)
    hash.update(JSON.stringify([name, stat.mode, content.digest('hex')]))
  }
  return hash.digest('hex')
}

/** No checkout, staging or object writes: projects may be actively edited on main. */
export async function projectRevision(cwd: string, instructions: string): Promise<string> {
  // An unreadable repository is an error, never proof that nothing changed.
  await git(cwd, ['rev-parse', '--show-toplevel'])
  const refs = await git(cwd, ['show-ref', '--head']).catch(async (error: unknown) => {
    // An unborn repository legitimately has no refs.
    if ((await git(cwd, ['rev-parse', '--is-inside-work-tree'])).trim() === 'true' &&
      (error as { code?: unknown }).code === 1) return ''
    throw error
  })
  const ref = (name: string): string => refs.split('\n').find((line) => line.endsWith(` ${name}`))?.split(' ')[0] ?? ''
  const [staged, unstaged, untracked] = await Promise.all([diffHash(cwd, true), diffHash(cwd, false), untrackedHash(cwd)])
  return createHash('sha256').update(JSON.stringify({
    cwd, main: ref('refs/heads/main') || ref('refs/heads/master'), head: ref('HEAD'),
    staged, unstaged, untracked, instructions
  })).digest('hex')
}
