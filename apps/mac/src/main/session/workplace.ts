import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import type { Db } from '../db/database.js'
import * as repo from '../db/repo.js'
import type { SessionBatch, SessionDerivation } from './derive.js'
import { shellCommandOf } from './shell.js'
import type { SessionMessage } from './types.js'

/**
 * Where the agent actually worked, read from what its session recorded.
 *
 * Quuu launches every agent in the project's directory, but the agent is free to move: Claude
 * Code enters `.claude/worktrees/<name>` through EnterWorktree, Codex runs `git worktree add`
 * and then every command inside the new tree. The run record only knows where the launch was, so
 * anything opened from it lands on `main` while the work sits on another branch. That is exactly
 * the moment a terminal is wanted - to look at the work - and it opened somewhere else.
 *
 * **The structured session log is the one witness.** Each adapter stamps the directory its CLI
 * recorded on the message (`SessionMessage.cwd`: Claude puts it on every line, Codex on every
 * command it runs), and the shell commands themselves say where they went (`cd <dir> && …`).
 * Read those in order and follow the agent to the last worktree of the project it was in. Only
 * Git worktrees of the project count: an agent wandering into a subdirectory, `/tmp`, or another
 * repository to read something has not moved its work.
 *
 * The directories are derived as the session is indexed and kept with its pages
 * (`session_workdirs`), so a look - the review, the terminal, the path shown in a menu - reads
 * a few rows instead of scanning tens of megabytes of log.
 */

/**
 * A shell command going somewhere - `cd /x`, `git -C /x` - or making the place with
 * `git worktree add … /x`. Claude Code keeps its own directory and writes `cd <worktree> &&`
 * in front of every command instead, so its `cwd` never says where the work went. Measured: a
 * task's commits and Pull Request were made in a worktree it created this way, and its review
 * and report read `main` - nine thousand files of other tasks' work. Absolute paths only, without
 * quotes or spaces; the worktree filter below throws out `/tmp` and other repositories anyway.
 */
const MOVED =
  /(?:^|[\s;&|(`"'])(?:cd|git\s+-C)\s+(?<moved>\/[^\s"'`;&|<>()\\]+)|git\s+worktree\s+add(?:\s+(?!\/)[^\s"'`;&|<>()\\]+)*\s+(?<made>\/[^\s"'`;&|<>()\\]+)/g

/** The directories a shell command names as its destination, in order. */
export function movesIn(command: string): string[] {
  const dirs: string[] = []
  for (const match of command.matchAll(MOVED)) {
    const dir = match.groups?.moved ?? match.groups?.made
    if (dir) dirs.push(dir)
  }
  return dirs
}

/**
 * The directories one message recorded, in order: where the CLI said it stood, then wherever
 * each of its shell commands went. Only commands the agent ran count - a path quoted in a
 * reply, or in a file it read, is not a move.
 */
export function workingDirsOf(message: SessionMessage): string[] {
  const dirs: string[] = []
  if (typeof message.cwd === 'string' && isAbsolute(message.cwd)) dirs.push(message.cwd)
  for (const block of message.blocks) {
    if (block.kind !== 'tool') continue
    const command = shellCommandOf(block.tool)
    if (command) dirs.push(...movesIn(command))
  }
  return dirs
}

/** Consecutive repeats collapsed: what matters is each move, not how long the agent stayed. */
export function collapse(dirs: string[]): string[] {
  const out: string[] = []
  for (const dir of dirs) if (out.at(-1) !== dir) out.push(dir)
  return out
}

/**
 * Keeps the directories of every page as it is indexed. Idempotent per message, so a page
 * rewritten by a late tool result (which changes no directory) lands on the same row.
 */
export const workplaceDerivation: SessionDerivation = {
  apply(db: Db, _run, batch: SessionBatch): void {
    batch.messages.forEach((message, i) => {
      repo.writeSessionWorkDirs(db, batch.key, batch.generation, batch.start + i, workingDirsOf(message))
    })
  }
}

/**
 * The directories a session recorded, in order of appearance, as far as it has been indexed.
 *
 * Empty until the first pass over the session finished: a page still being read has no
 * generation on record, and a guess would send the terminal somewhere the work never was.
 */
export function recordedWorkingDirs(db: Db, key: string): string[] {
  const saved = repo.getSessionIndex(db, key)
  if (!saved) return []
  return collapse(repo.readSessionWorkDirs(db, key, saved.generation))
}

function realDir(path: string): string | null {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

/** Every checkout of the repository that directory belongs to. Empty when it is not a repository. */
export function worktreesOf(dir: string): string[] {
  let out: string
  try {
    out = execFileSync('/usr/bin/git', ['-C', dir, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000
    })
  } catch {
    return []
  }
  const trees: string[] = []
  for (const line of out.split('\n')) {
    if (!line.startsWith('worktree ')) continue
    const real = realDir(line.slice('worktree '.length))
    if (real) trees.push(real)
  }
  return trees
}

/** The checkout that directory sits in. The deepest wins: `.claude/worktrees/x` lies inside the main checkout by path. */
function worktreeContaining(dir: string, worktrees: string[]): string | null {
  let found: string | null = null
  for (const tree of worktrees) {
    if (dir !== tree && !dir.startsWith(tree + sep)) continue
    if (!found || tree.length > found.length) found = tree
  }
  return found
}

export interface WorkplaceInput {
  /** The directories the run's session recorded, in order. Empty when there is no session yet. */
  dirs: string[]
  /** Where the run was launched. What is answered when the agent never moved. */
  launchDir: string
  /** The project's registered directory. Decides which repository's worktrees count. */
  projectDir: string
}

/**
 * The directory to open for a run.
 *
 * The most recent worktree of the project the agent worked in, other than the one it was
 * launched in. Codex in particular runs its incidental commands (reading `/tmp`, `docker`,
 * `kill`) from the launch directory in between, so "the very last directory" would land on
 * `main` one time in five; having entered another worktree at all is the stronger fact.
 *
 * A project registered below the repository root (`repo/packages/ui`) lands on the same place
 * in the other worktree, when it exists there.
 */
export function agentWorkplace(input: WorkplaceInput): string {
  if (input.dirs.length === 0) return input.launchDir

  const worktrees = worktreesOf(input.projectDir)
  const projectDir = realDir(input.projectDir)
  const home = projectDir ? worktreeContaining(projectDir, worktrees) : null
  if (!projectDir || !home) return input.launchDir

  for (let i = input.dirs.length - 1; i >= 0; i--) {
    const real = realDir(input.dirs[i])
    if (!real) continue
    const tree = worktreeContaining(real, worktrees)
    if (!tree || tree === home) continue
    const samePlace = join(tree, relative(home, projectDir))
    return existsSync(samePlace) ? samePlace : tree
  }
  return input.launchDir
}
