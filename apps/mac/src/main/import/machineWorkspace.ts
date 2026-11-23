import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join, relative, resolve, sep } from 'node:path'
import { GIT } from '../platform/executables.js'

/**
 * Is this directory a workspace a machine made for itself, rather than a place a person works?
 *
 * An orchestrator hands each agent a disposable checkout, and import would turn every one of them
 * into a project: 25 `node-NN` projects from one orchestrator's `.expl/worktrees/` in a single day.
 * Who started the session cannot answer this — only Claude Code and Codex record that; Cursor,
 * Grok, Copilot, Antigravity and Pi write the same log for a headless run as for a typed one. Where
 * the session ran can, whatever the CLI:
 *
 *   1. under a scratch directory                              … `/tmp`, the per-user temp directory
 *   2. ignored by a repository that encloses it               … `.expl/`, `.claude/worktrees/`, `target/`
 *   3. a linked git worktree kept under a hidden directory    … `~/.codex/worktrees/…`
 *
 * This only answers "should a project be created here". A project that already exists at the
 * directory keeps receiving its sessions, which is how a person overrules a wrong guess.
 */
export function isMachineWorkspace(cwd: string): boolean {
  const dir = realDir(cwd) ?? cwd
  if (scratchRoots().some((root) => within(cwd, root) || within(dir, root))) return true

  const checkouts = enclosingCheckouts(dir)
  const own = checkouts[0]
  if (own !== undefined && isLinkedWorktree(own) && underHiddenDirectory(own)) return true

  // Every enclosing repository gets a say: a session started in a subdirectory of a disposable
  // checkout is not ignored by that checkout, only by the repository the checkout sits in.
  return checkouts.some((checkout) => checkout !== dir && ignores(checkout, dir))
}

/**
 * Directories whose contents are never a project (`QUUU_SCRATCH_DIRS`, default: the temp directories).
 *
 * Each is matched both as written and resolved: macOS reaches the same place as `/tmp` and
 * `/private/tmp`, and CLIs do not agree on which one they record.
 */
function scratchRoots(): string[] {
  const configured = process.env.QUUU_SCRATCH_DIRS
  const roots = configured !== undefined
    ? configured.split(delimiter).filter((root) => root.length > 0)
    : process.platform === 'win32' ? [tmpdir()] : [tmpdir(), '/tmp', '/var/tmp', '/var/folders']
  return roots.flatMap((root) => {
    const real = realDir(root)
    return real && real !== root ? [root, real] : [root]
  })
}

/**
 * The checkouts this directory lies in, nearest first; itself included when it is one.
 *
 * Stops below the home directory. A repository there tracks dotfiles and commonly ignores
 * everything else, which would make every project on the machine look like a machine's workspace.
 */
function enclosingCheckouts(dir: string): string[] {
  const home = realDir(homedir()) ?? homedir()
  const found: string[] = []
  for (let at = dir; at !== home; at = dirname(at)) {
    if (existsSync(join(at, '.git'))) found.push(at)
    if (dirname(at) === at) break
  }
  return found
}

/**
 * A linked worktree's `.git` is a file naming its administrative directory, and only a linked
 * worktree's administrative directory carries `commondir` (a submodule's `.git` file does not).
 */
function isLinkedWorktree(checkout: string): boolean {
  const dotGit = join(checkout, '.git')
  try {
    if (!statSync(dotGit).isFile()) return false
    const pointer = /^gitdir: (.+)$/m.exec(readFileSync(dotGit, 'utf8'))
    return pointer !== null && existsSync(join(resolve(checkout, pointer[1].trim()), 'commondir'))
  } catch {
    return false
  }
}

/** Judged below the home directory, so a home that itself sits under a dot-directory hides nothing. */
function underHiddenDirectory(path: string): boolean {
  const home = realDir(homedir()) ?? homedir()
  const tail = within(path, home) ? relative(home, path) : path
  return tail.split(sep).some((segment) => segment.startsWith('.') && segment !== '.' && segment !== '..')
}

/** Anything but a clean "ignored" answer (no git, not a repository, a timeout) leaves the directory importable. */
function ignores(checkout: string, dir: string): boolean {
  const result = spawnSync(GIT, ['-C', checkout, 'check-ignore', '-q', '--', dir], {
    stdio: 'ignore',
    timeout: 5000,
    windowsHide: true
  })
  return result.status === 0
}

function within(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep)
}

function realDir(path: string): string | null {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}
