import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { t } from '../i18n/index.js'
import { git } from './command.js'

const MAX_TEXT_BYTES = 2 * 1024 * 1024
const MAX_TREE_FILES = 6000
/**
 * The project's own listing answers "what is in the directory", so it reaches much further than a
 * task's review. A monorepo of twenty packages already holds tens of thousands of files, and the
 * review's cap showed six of them. The cap only guards IPC against a checkout of vendored trees.
 */
export const MAX_PROJECT_FILES = 100_000

export function pathInside(root: string, input: string): string {
  if (input.includes('\0') || isAbsolute(input)) throw new Error(t('review.filePathUnreadable'))
  const base = resolve(root)
  const target = resolve(base, input)
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    throw new Error(t('review.outsideProject'))
  }
  return target
}

export function readText(path: string): { content: string; binary: boolean } {
  const entry = lstatSync(path)
  // Do not follow a link inside the repository out to a file beyond it; read only the link target, as an IDE does.
  if (entry.isSymbolicLink()) return { content: readlinkSync(path), binary: false }
  const size = entry.size
  if (size > MAX_TEXT_BYTES) return { content: '', binary: true }
  const data = readFileSync(path)
  if (data.includes(0)) return { content: '', binary: true }
  return { content: data.toString('utf8'), binary: false }
}

function walkFallback(root: string, limit: number): string[] {
  const ignored = new Set(['.git', 'node_modules', 'release', 'out', 'dist', 'coverage'])
  const result: string[] = []
  const visit = (dir: string): void => {
    if (result.length >= limit) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.github') continue
      if (ignored.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) visit(full)
      else if (entry.isFile()) result.push(relative(root, full))
      if (result.length >= limit) break
    }
  }
  visit(root)
  return result
}

export async function projectFiles(cwd: string): Promise<string[]> {
  return (await listFiles(cwd, MAX_TREE_FILES)).paths
}

/** Every file Git would show, tracked or not ignored, and whether the limit cut the listing short. */
export async function listFiles(cwd: string, limit: number): Promise<{ paths: string[]; truncated: boolean }> {
  const tracked = await git(cwd, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
  // One more than the limit says whether anything was left out, without counting the rest.
  const paths = tracked.code === 0 ? tracked.stdout.split('\0').filter(Boolean).slice(0, limit + 1) : walkFallback(cwd, limit + 1)
  return { paths: paths.slice(0, limit), truncated: paths.length > limit }
}


/** Do not carry a huge blob over IPC; read it under the same cap as a working file. */
export async function readRevisionText(
  cwd: string,
  revision: string,
  path: string
): Promise<{ content: string; binary: boolean } | null> {
  const object = `${revision}:${path}`
  const size = await git(cwd, ['cat-file', '-s', object])
  if (size.code !== 0) return null
  if (Number(size.stdout.trim()) > MAX_TEXT_BYTES) return { content: '', binary: true }
  const file = await git(cwd, ['show', object])
  if (file.code !== 0) return null
  const binary = file.stdout.includes('\0')
  return { content: binary ? '' : file.stdout, binary }
}
