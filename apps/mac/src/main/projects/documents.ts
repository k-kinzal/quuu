import { fromMarkdown } from 'mdast-util-from-markdown'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'
import { git } from '../review/command.js'

export interface DocumentationLink { title: string; url: string }
export interface DocumentContent { content: string; format: 'markdown' | 'text'; baseUrl: string }
export interface ProjectDocuments {
  branch: string
  revision: string
  files: { path: string; format: 'markdown' | 'text' }[]
  websites: DocumentationLink[]
}

const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024
export const DOCUMENT_BASE = 'https://quuu.invalid/'
const excluded = /(^|\/)(node_modules|vendor|dist|build|\.git)(\/|$)/
const readme = /(^|\/)readme(?:[._-][^/]*)?$/i

export function documentationUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch { return null }
}

/** CommonMark handles nested badge images, reference links and escaped destinations. */
export function documentationLinks(markdown: string): DocumentationLink[] {
  const tree = fromMarkdown(markdown)
  type Node = { type: string; children?: Node[]; value?: string; alt?: string | null; url?: string; identifier?: string }
  const definitions = new Map<string, string>()
  const walk = (node: Node, visit: (node: Node) => void): void => {
    visit(node)
    node.children?.forEach(child => walk(child, visit))
  }
  walk(tree, node => { if (node.type === 'definition' && node.identifier && node.url) definitions.set(node.identifier, node.url) })
  const text = (node: Node): string => node.alt ?? node.value ?? node.children?.map(text).join('') ?? ''
  const links = new Map<string, DocumentationLink>()
  walk(tree, node => {
    if (node.type !== 'link' && node.type !== 'linkReference') return
    const url = documentationUrl(node.url ?? definitions.get(node.identifier ?? '') ?? '')
    const title = text(node).trim()
    if (!url || !(/\b(docs?|documentation|guide|manual|reference|api)\b|ドキュメント|ガイド|リファレンス/i.test(title) ||
      /(?:\.github\.io\/|\.readthedocs\.|\/docs?\/)/i.test(url))) return
    if (!links.has(url)) links.set(url, { title: title || new URL(url).hostname, url })
  })
  return [...links.values()]
}

function projectPath(db: Db, projectId: string): string {
  const project = repo.getProject(db, projectId)
  if (!project) throw new Error(t('tasks.projectNotFound'))
  return project.path
}

async function checked(cwd: string, args: string[]): Promise<string> {
  const result = await git(cwd, args)
  if (result.code !== 0) throw new Error(t('documents.gitFailed'))
  return result.stdout
}

/** Resolve refs without checking out, fetching, or creating a local branch. */
export async function documentBranch(cwd: string): Promise<{ branch: string; revision: string }> {
  const remote = await git(cwd, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'])
  const remoteRef = remote.code === 0 ? remote.stdout.trim() : ''
  const names = remoteRef.startsWith('refs/remotes/origin/') ? [remoteRef.slice('refs/remotes/origin/'.length)] : ['main', 'master']
  for (const branch of names) {
    for (const ref of [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`]) {
      const result = await git(cwd, ['rev-parse', '--verify', `${ref}^{commit}`])
      if (result.code === 0) return { branch, revision: result.stdout.trim() }
    }
  }
  const remotes = await checked(cwd, ['remote'])
  const branches = (await checked(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'])).trim().split('\n').filter(Boolean)
  if (!remotes.trim() && branches.length === 1) {
    return { branch: branches[0], revision: (await checked(cwd, ['rev-parse', '--verify', `refs/heads/${branches[0]}^{commit}`])).trim() }
  }
  throw new Error(t('worktree.defaultUnknown'))
}

function format(path: string): 'markdown' | 'text' | null {
  if (/\.(md|markdown|mdown)$/i.test(path)) return 'markdown'
  return /\.(txt|rst|adoc)$/i.test(path) || /(^|\/)readme$/i.test(path) ? 'text' : null
}

async function filesAt(cwd: string, revision: string): Promise<ProjectDocuments['files']> {
  const output = await checked(cwd, ['ls-tree', '-r', '-z', '--full-tree', revision])
  return output.split('\0').flatMap(record => {
    const match = /^(100644|100755) blob [a-f0-9]+\t([\s\S]+)$/.exec(record)
    const path = match?.[2]
    const kind = path && !excluded.test(path) ? format(path) : null
    return path && kind ? [{ path, format: kind }] : []
  }).sort((a, b) => {
    const rank = (path: string): number => !path.includes('/') && readme.test(path) ? 0 : 1
    return rank(a.path) - rank(b.path) || a.path.localeCompare(b.path, 'en', { numeric: true })
  })
}

async function contentAt(cwd: string, revision: string, path: string): Promise<string> {
  const object = `${revision}:${path}`
  const size = Number((await checked(cwd, ['cat-file', '-s', object])).trim())
  if (!Number.isFinite(size) || size > MAX_DOCUMENT_BYTES) throw new Error(t('documents.tooLarge'))
  return checked(cwd, ['cat-file', 'blob', object])
}

export async function listProjectDocuments(db: Db, projectId: string): Promise<ProjectDocuments> {
  const cwd = projectPath(db, projectId)
  const branch = await documentBranch(cwd)
  const files = await filesAt(cwd, branch.revision)
  const websites = new Map<string, DocumentationLink>()
  // Root README variants carry the project's published documentation entry points.
  for (const file of files.filter(file => !file.path.includes('/') && readme.test(file.path)).slice(0, 20)) {
    const size = Number((await checked(cwd, ['cat-file', '-s', `${branch.revision}:${file.path}`])).trim())
    if (size > MAX_DOCUMENT_BYTES) continue
    for (const link of documentationLinks(await contentAt(cwd, branch.revision, file.path))) websites.set(link.url, link)
  }
  return { ...branch, files, websites: [...websites.values()] }
}

export async function readProjectDocument(db: Db, input: { projectId: string; path: string; revision: string }): Promise<DocumentContent> {
  const cwd = projectPath(db, input.projectId)
  if (!/^[a-f0-9]{40,64}$/.test(input.revision)) throw new Error(t('documents.notFound'))
  const file = (await filesAt(cwd, input.revision)).find(file => file.path === input.path)
  if (!file) throw new Error(t('documents.notFound'))
  const content = await contentAt(cwd, input.revision, file.path)
  return { content, format: file.format, baseUrl: DOCUMENT_BASE + file.path.split('/').map(encodeURIComponent).join('/') }
}
