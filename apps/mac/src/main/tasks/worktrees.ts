import { runWorkingDirectory } from '../projects/workspace.js'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { userDataDir } from '../appPaths.js'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import { t } from '../i18n/index.js'
import { githubRepositoryFromRemote } from '../platform/githubAuth.js'
import type { Project } from '../projects/types.js'
import { git } from '../review/command.js'
import { gh } from '../review/github.js'
import { commitIdentityEnv } from '../settings/commitIdentity.js'
import { newId } from '../util.js'
import type { Task } from './types.js'

const busy = new WeakMap<Db, Set<string>>()

export class WorktreeBusyError extends Error {}

export function assertWorktreeIdle(db: Db, taskId: string): void {
  if (busy.get(db)?.has(taskId)) throw new WorktreeBusyError(t('worktree.busy'))
}

/** Protect every task entry point while Git is working outside a SQLite transaction. */
export async function withWorktreeOperation<T>(db: Db, taskId: string, action: () => Promise<T>): Promise<T> {
  assertWorktreeIdle(db, taskId)
  let ids = busy.get(db)
  if (!ids) { ids = new Set(); busy.set(db, ids) }
  ids.add(taskId)
  try { return await action() } finally { ids.delete(taskId) }
}

function alive(db: Db): void {
  if (!db.isOpen) throw new Error('Quuu shut down during a worktree operation')
}

async function checked(db: Db, cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  alive(db)
  const result = await git(cwd, args, 60_000, env)
  alive(db)
  if (result.code !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || t('worktree.gitFailed'))
  return result.stdout.trim()
}

export function usesWorktree(db: Db, project: Project): boolean {
  return project.worktreeMode === 'on' || (project.worktreeMode === 'inherit' && repo.getAppSettings(db).worktreeEnabled)
}

async function defaultBranch(db: Db, root: string): Promise<string> {
  const remote = await git(root, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'])
  const candidates = remote.code === 0 ? [remote.stdout.trim().replace(/^refs\/remotes\/origin\//, '')] : ['main', 'master']
  for (const name of candidates) {
    if ((await git(root, ['show-ref', '--verify', '--quiet', `refs/heads/${name}`])).code === 0) return name
    if (remote.code === 0) {
      await checked(db, root, ['branch', name, `refs/remotes/origin/${name}`])
      return name
    }
  }
  // A local-only repository may deliberately use a different initial branch.
  const remotes = await checked(db, root, ['remote'])
  const branches = (await checked(db, root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'])).split('\n').filter(Boolean)
  if (!remotes && branches.length === 1) return branches[0]
  throw new Error(t('worktree.defaultUnknown'))
}

interface Checkout { path: string; branch: string }
async function checkouts(db: Db, root: string): Promise<Checkout[]> {
  const output = await checked(db, root, ['worktree', 'list', '--porcelain', '-z'])
  return output.split('\0\0').filter(Boolean).map(record => {
    const fields = record.split('\0')
    return { path: fields.find(line => line.startsWith('worktree '))?.slice(9) ?? '',
      branch: fields.find(line => line.startsWith('branch '))?.slice(7) ?? '' }
  })
}

async function validateTree(db: Db, tree: repo.TaskWorktree): Promise<void> {
  if (!existsSync(tree.path)) throw new Error(t('worktree.missing', { path: tree.path }))
  const registered = (await checkouts(db, tree.repository)).some(item => existsSync(item.path) && realpathSync(item.path) === realpathSync(tree.path))
  if (!registered || realpathSync(tree.path) === realpathSync(tree.repository)) throw new Error(t('worktree.wrongRepository'))
  const root = await checked(db, tree.path, ['rev-parse', '--show-toplevel'])
  if (realpathSync(root) !== realpathSync(tree.path)) throw new Error(t('worktree.wrongRepository'))
}

/** Called after the execution slot is recorded, before baselines, arguments, or processes use the directory. */
export async function ensureTaskWorktree(db: Db, task: Task, project: Project, runId: string): Promise<string> {
  let tree = repo.getTaskWorktree(db, task.id)
  if (!tree) {
    const previous = repo.listRunsByTask(db, task.id).find(run => run.id !== runId)
    // Enabling isolation never moves an existing conversation into a different checkout.
    if (previous) return previous.cwd || project.path
    if (!usesWorktree(db, project)) return project.path
  } else if (tree.state === 'removed' && !usesWorktree(db, project)) return project.path

  return withWorktreeOperation(db, task.id, async () => {
    if (!tree || tree.state === 'removed') {
      const repository = realpathSync(await checked(db, project.path, ['rev-parse', '--show-toplevel']))
      const base = await defaultBranch(db, repository)
      const suffix = createHash('sha256').update(task.id).digest('hex').slice(0, 16) + '-' + newId('wt')
      const path = join(userDataDir(), 'worktrees', suffix)
      const cwd = join(path, relative(repository, realpathSync(project.path)))
      tree = { taskId: task.id, repository, path, cwd, branch: `quuu/${suffix}`, defaultBranch: base, state: 'creating', integratedHead: null }
      alive(db)
      repo.saveTaskWorktree(db, tree)
    }
    if (tree.state === 'creating') {
      if (!existsSync(tree.path)) {
        mkdirSync(dirname(tree.path), { recursive: true })
        const branchExists = (await git(tree.repository, ['show-ref', '--verify', '--quiet', `refs/heads/${tree.branch}`])).code === 0
        await checked(db, tree.repository, ['worktree', 'add', ...(branchExists ? [] : ['-b', tree.branch]), tree.path,
          branchExists ? tree.branch : `refs/heads/${tree.defaultBranch}`])
      }
      await validateTree(db, tree)
      alive(db)
      tree = { ...tree, state: 'active' }
      repo.saveTaskWorktree(db, tree)
    } else await validateTree(db, tree)
    if (!existsSync(tree.cwd)) throw new Error(t('worktree.missing', { path: tree.cwd }))
    return tree.cwd
  })
}

async function clean(db: Db, path: string): Promise<void> {
  const status = await checked(db, path, ['status', '--porcelain', '--untracked-files=all'])
  if (status) throw new Error(t('worktree.dirty', { path }))
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply']) {
    const location = await checked(db, path, ['rev-parse', '--git-path', marker])
    if (existsSync(resolve(path, location))) throw new Error(t('worktree.inProgress', { path }))
  }
}

/** A merged PR is sufficient only when it contains the exact head now being approved. */
export async function headMergedInPullRequest(db: Db, tree: repo.TaskWorktree, project: Project, head: string): Promise<boolean> {
  const remote = await git(tree.path, ['config', '--get', 'remote.origin.url'])
  if (remote.code !== 0 || !githubRepositoryFromRemote(remote.stdout.trim())) return false
  const branch = await checked(db, tree.path, ['branch', '--show-current'])
  if (!branch) return false
  const result = await gh(tree.path, project, repo.getAppSettings(db), [
    'pr', 'list', '--state', 'merged', '--head', branch, '--limit', '100', '--json', 'headRefOid,headRefName,state'
  ])
  alive(db)
  if (result.code !== 0) throw new Error(t('worktree.prUnavailable', { reason: result.stderr.trim() }))
  const items: unknown = JSON.parse(result.stdout)
  if (!Array.isArray(items)) throw new Error(t('worktree.prUnavailable', { reason: result.stdout }))
  return items.some((item: unknown) => typeof item === 'object' && item !== null &&
    'headRefOid' in item && item.headRefOid === head && 'headRefName' in item && item.headRefName === branch &&
    'state' in item && item.state === 'MERGED')
}

async function integrate(db: Db, tree: repo.TaskWorktree, project: Project, head: string): Promise<void> {
  const target = `refs/heads/${tree.defaultBranch}`
  const base = await checked(db, tree.repository, ['rev-parse', '--verify', target])
  if ((await git(tree.repository, ['merge-base', '--is-ancestor', head, base])).code === 0) return
  let merged = head
  if ((await git(tree.repository, ['merge-base', '--is-ancestor', base, head])).code !== 0) {
    // merge-tree touches neither index nor checkout; a conflict leaves both workspaces intact.
    const result = await git(tree.repository, ['merge-tree', '--write-tree', base, head], 60_000)
    alive(db)
    if (result.code !== 0) throw new Error(t('worktree.mergeFailed', { branch: tree.defaultBranch, reason: result.stdout.trim() || result.stderr.trim() }))
    merged = await checked(db, tree.repository, ['commit-tree', result.stdout.trim().split('\n')[0], '-p', base, '-p', head,
      '-m', `Merge task ${tree.taskId}`], { ...process.env, ...commitIdentityEnv(repo.getAppSettings(db), project) })
  }
  const checkout = (await checkouts(db, tree.repository)).find(item => item.branch === target)
  if (checkout) {
    await clean(db, checkout.path)
    // A concurrent external edit must never be replaced by a reset or forced checkout.
    if (await checked(db, checkout.path, ['symbolic-ref', 'HEAD']) !== target ||
      await checked(db, checkout.path, ['rev-parse', 'HEAD']) !== base) throw new Error(t('worktree.baseChanged'))
    await checked(db, checkout.path, ['merge', '--ff-only', '--no-edit', merged])
  } else {
    await checked(db, tree.repository, ['update-ref', target, merged, base])
  }
}

/** Retryable after a crash: the integrated head is saved before removing the directory. */
export async function completeTaskWorktree(db: Db, task: Task): Promise<void> {
  let tree = repo.getTaskWorktree(db, task.id)
  if (!tree || tree.state === 'removed') return
  const project = repo.getProject(db, task.projectId)
  if (!project) throw new Error(t('tasks.projectNotFound'))
  if (tree.state === 'integrated' && !existsSync(tree.path)) {
    await removeOwnedBranch(db, tree)
    repo.saveTaskWorktree(db, { ...tree, state: 'removed' })
    return
  }
  await validateTree(db, tree)
  const latest = repo.listRunsByTask(db, task.id)[0]
  if (latest && realpathSync(runWorkingDirectory(db, latest, project)) !== realpathSync(tree.cwd)) {
    throw new Error(t('worktree.moved'))
  }
  await clean(db, tree.path)
  const head = await checked(db, tree.path, ['rev-parse', 'HEAD'])
  if (tree.integratedHead !== head) {
    const locallyMerged = (await git(tree.repository, ['merge-base', '--is-ancestor', head, `refs/heads/${tree.defaultBranch}`])).code === 0
    if (!locallyMerged && !await headMergedInPullRequest(db, tree, project, head)) await integrate(db, tree, project, head)
    tree = { ...tree, state: 'integrated', integratedHead: head }
    repo.saveTaskWorktree(db, tree)
  }
  if (await checked(db, tree.path, ['rev-parse', 'HEAD']) !== head) throw new Error(t('worktree.headChanged'))
  await checked(db, tree.repository, ['worktree', 'remove', tree.path])
  await removeOwnedBranch(db, tree)
  repo.saveTaskWorktree(db, { ...tree, state: 'removed' })
}

async function removeOwnedBranch(db: Db, tree: repo.TaskWorktree, discard = false): Promise<void> {
  const ref = `refs/heads/${tree.branch}`
  const branch = await git(tree.repository, ['rev-parse', '--verify', ref])
  alive(db)
  if (branch.code !== 0) return
  if (!discard && (!tree.integratedHead || (await git(tree.repository,
    ['merge-base', '--is-ancestor', branch.stdout.trim(), tree.integratedHead])).code !== 0)) return
  // Someone may have adopted the branch in a different checkout. Never remove their branch.
  if ((await checkouts(db, tree.repository)).some(item => item.branch === ref)) return
  await checked(db, tree.repository, ['update-ref', '-d', ref, branch.stdout.trim()])
}

/** Explicit deletion discards work. Archive never calls this. */
export async function discardTaskWorktree(db: Db, taskId: string): Promise<void> {
  const tree = repo.getTaskWorktree(db, taskId)
  if (!tree || tree.state === 'removed') return
  if (existsSync(tree.path)) {
    await validateTree(db, tree)
    await checked(db, tree.repository, ['worktree', 'remove', '--force', tree.path])
  } else {
    // Removing a missing owned checkout clears its registration without pruning other trees.
    const registered = (await checkouts(db, tree.repository)).some(item => resolve(item.path) === resolve(tree.path))
    if (registered) await checked(db, tree.repository, ['worktree', 'remove', '--force', tree.path])
  }
  await removeOwnedBranch(db, tree, true)
  repo.saveTaskWorktree(db, { ...tree, state: 'removed' })
}
