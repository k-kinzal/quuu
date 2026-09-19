import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { git } from './command.js'
import { parseNameStatus } from './gitFormat.js'
import type { ReviewChange, ReviewCommit } from './types.js'

export interface ReviewBaseline {
  startedAt: string
  baseHead: string | null
  baseTree: string | null
}

interface WorktreeSnapshot {
  head: string | null
  headTree: string
  indexTree: string | null
  tree: string
}

function reviewRef(taskId: string): string {
  return `refs/quuu/review/${taskId.replace(/[^A-Za-z0-9._-]/g, '-')}`
}

/**
 * Build a Git tree covering both tracked and untracked files without touching the current index.
 * Holding a snapshot of the content rather than `git status`'s state keeps files that were already
 * dirty before the start out of the AI's changes.
 */
export async function snapshotWorktree(cwd: string, includeIndex = false): Promise<WorktreeSnapshot | null> {
  const inside = await git(cwd, ['rev-parse', '--is-inside-work-tree'])
  if (inside.code !== 0 || inside.stdout.trim() !== 'true') return null

  const [headResult, indexPath] = await Promise.all([
    git(cwd, ['rev-parse', 'HEAD', 'HEAD^{tree}']),
    includeIndex ? git(cwd, ['rev-parse', '--git-path', 'index']) : null
  ])
  const [head, committedTree] = headResult.code === 0 ? headResult.stdout.trim().split('\n') : [null, null]
  const temp = mkdtempSync(join(tmpdir(), 'quuu-review-index-'))
  const env = { ...process.env, GIT_INDEX_FILE: join(temp, 'index') }
  try {
    const read = await git(cwd, head ? ['read-tree', head] : ['read-tree', '--empty'], undefined, env)
    if (read.code !== 0) return null
    const headTree = committedTree ?? (await git(cwd, ['write-tree'], undefined, env)).stdout.trim()
    if (!/^[a-f0-9]{40}$/i.test(headTree)) return null
    let indexTree: string | null = null
    if (indexPath?.code === 0) {
      // write-tree may update the index cache. Copy it so review never changes the user's staging.
      const stagedEnv = { ...env, GIT_INDEX_FILE: join(temp, 'staged') }
      const indexFile = resolve(cwd, indexPath.stdout.trim())
      if (existsSync(indexFile)) copyFileSync(indexFile, stagedEnv.GIT_INDEX_FILE)
      const staged = await git(cwd, ['write-tree'], undefined, stagedEnv)
      if (staged.code === 0) indexTree = staged.stdout.trim()
    }
    const add = await git(cwd, ['add', '-A', '--', '.'], 60_000, env)
    if (add.code !== 0) return null
    const tree = await git(cwd, ['write-tree'], undefined, env)
    return tree.code === 0 && /^[a-f0-9]{40}$/i.test(tree.stdout.trim())
      ? { head, headTree, indexTree, tree: tree.stdout.trim() }
      : null
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

/** Called only right before the first run: keeps the content as of the start reachable from a hidden Git ref. */
export async function captureReviewBaseline(
  cwd: string,
  taskId: string,
  startedAt: string
): Promise<ReviewBaseline> {
  const snapshot = await snapshotWorktree(cwd)
  if (!snapshot) return { startedAt, baseHead: null, baseTree: null }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Quuu',
    GIT_AUTHOR_EMAIL: 'quuu@localhost',
    GIT_AUTHOR_DATE: startedAt,
    GIT_COMMITTER_NAME: 'Quuu',
    GIT_COMMITTER_EMAIL: 'quuu@localhost',
    GIT_COMMITTER_DATE: startedAt
  }
  const commit = await git(
    cwd,
    [
      'commit-tree',
      snapshot.tree,
      ...(snapshot.head ? ['-p', snapshot.head] : []),
      '-m',
      `Quuu review baseline ${taskId}`
    ],
    undefined,
    env
  )
  if (commit.code === 0 && /^[a-f0-9]{40}$/i.test(commit.stdout.trim())) {
    await git(cwd, ['update-ref', reviewRef(taskId), commit.stdout.trim()])
  }
  return { startedAt, baseHead: snapshot.head, baseTree: snapshot.tree }
}

/** For a task already started under an older version, fill the baseline with the commit before its first run. */
export async function inferReviewBaseline(
  cwd: string,
  startedAt: string
): Promise<ReviewBaseline> {
  const head = await git(cwd, ['rev-list', '-1', `--before=${startedAt}`, 'HEAD'])
  const baseHead = head.code === 0 && /^[a-f0-9]{40}$/i.test(head.stdout.trim())
    ? head.stdout.trim()
    : null
  if (!baseHead) return { startedAt, baseHead: null, baseTree: null }
  const tree = await git(cwd, ['rev-parse', `${baseHead}^{tree}`])
  return {
    startedAt,
    baseHead,
    baseTree: tree.code === 0 && /^[a-f0-9]{40}$/i.test(tree.stdout.trim())
      ? tree.stdout.trim()
      : null
  }
}

export async function changesBetween(cwd: string, before: string, after: string): Promise<ReviewChange[]> {
  const result = await git(cwd, [
    'diff-tree',
    '--no-commit-id',
    '--name-status',
    '-r',
    '-z',
    '-M',
    '-C',
    '--find-copies-harder',
    before,
    after
  ])
  return result.code === 0 ? parseNameStatus(result.stdout) : []
}

export async function commitsSince(cwd: string, baseHead: string | null, head: string): Promise<ReviewCommit[]> {
  const args = ['log', '--format=%H', ...(baseHead ? [`${baseHead}..${head}`] : [head])]
  const list = await git(cwd, args)
  if (list.code !== 0) return []
  const shas = list.stdout.split('\n').map((value) => value.trim()).filter(Boolean)
  return readCommits(cwd, shas)
}

/** Explicit session receipts stay readable after checkout, rebase, or a branch deletion. */
export async function readCommits(cwd: string, refs: string[]): Promise<ReviewCommit[]> {
  const commits: ReviewCommit[] = []
  // Limit subprocess fan-out: a long task must not spawn two processes for every commit at once.
  for (const ref of [...new Set(refs)]) {
      if (!/^[a-f0-9]{7,40}$/i.test(ref)) continue
      const resolved = await git(cwd, ['rev-parse', '--verify', `${ref}^{commit}`])
      if (resolved.code !== 0) continue
      const sha = resolved.stdout.trim()
      if (commits.some(commit => commit.sha === sha)) continue
      const [meta, files] = await Promise.all([
        git(cwd, ['show', '-s', '--format=%h%x1f%s%x1f%an%x1f%cI', sha]),
        git(cwd, [
          'diff-tree',
          '--root',
          '--no-commit-id',
          '--name-status',
          '-r',
          '-z',
          '-M',
          '-C',
          '--find-copies-harder',
          sha
        ])
      ])
      const [shortSha = sha.slice(0, 7), subject = '', author = '', committedAt = ''] = meta.stdout.trim().split('\x1f')
      if (meta.code === 0 && files.code === 0) commits.push({ sha, shortSha, subject, author, committedAt, files: parseNameStatus(files.stdout) })
  }
  return commits.sort((a, b) => b.committedAt.localeCompare(a.committedAt))
}

export function aggregateTaskChanges(
  working: ReviewChange[],
  commits: ReviewCommit[]
): ReviewChange[] {
  const changes = new Map<string, ReviewChange>()
  // log is newest first, so layering from the oldest commit settles on the final change kind.
  for (const commit of [...commits].reverse()) {
    for (const file of commit.files) changes.set(file.path, file)
  }
  for (const file of working) changes.set(file.path, file)
  return [...changes.values()].sort((a, b) => a.path.localeCompare(b.path))
}
