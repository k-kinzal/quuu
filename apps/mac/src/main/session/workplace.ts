import { execFileSync } from 'node:child_process'
import { closeSync, existsSync, fstatSync, openSync, readSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Where the agent actually worked, read from what its session recorded.
 *
 * Quuu launches every agent in the project's directory, but the agent is free to move: Claude
 * Code enters `.claude/worktrees/<name>` through EnterWorktree, Codex runs `git worktree add`
 * and then every command inside the new tree. The run record only knows where the launch was, so
 * anything opened from it lands on `main` while the work sits on another branch. That is exactly
 * the moment a terminal is wanted - to look at the work - and it opened somewhere else.
 *
 * **The session log is the one witness.** Every CLI stamps the directory it worked in on its
 * entries (measured: Claude puts `cwd` on each message, Codex puts `cwd` on each command it ran,
 * as a `file://` URL), and the commands themselves say where they went (`cd <dir> && …`). Read
 * those in order and follow the agent to the last worktree of the project it was in. Only Git
 * worktrees of the project count: an agent wandering into a subdirectory, `/tmp`, or another
 * repository to read something has not moved its work.
 */

interface ScanState {
  /** How far the log has been read. Only the bytes after this are looked at next time. */
  offset: number
  /** The directories seen so far, in order, consecutive repeats collapsed. */
  dirs: string[]
}

/**
 * Logs grow to tens of megabytes. Remember how far each was read, so a repeat look (the review,
 * the terminal, the path shown in a menu) costs only what was appended since.
 */
const scans = new Map<string, ScanState>()

/**
 * What names a directory in the log, in order of appearance.
 *
 * `cwd`: only a structural `"cwd":"…"` matches. A path quoted inside a message body is escaped
 * (`\"cwd\":\"`), so what an agent read out of someone else's log never counts as its own move.
 *
 * `moved` / `made`: a shell command going somewhere - `cd /x`, `git -C /x` - or making the place
 * with `git worktree add … /x`. Claude Code keeps its own directory and writes `cd <worktree> &&`
 * in front of every command instead, so its `cwd` never says where the work went. Measured: a
 * task's commits and Pull Request were made in a worktree it created this way, and its review
 * and report read `main` - nine thousand files of other tasks' work. Absolute paths only, without
 * quotes or spaces; the worktree filter below throws out `/tmp` and other repositories anyway.
 */
const RECORDED =
  /"cwd":"(?<cwd>(?:[^"\\]|\\.)*)"|(?:^|[\s;&|(`"]|\\n)(?:cd|git\s+-C)\s+(?<moved>\/[^\s"'`;&|<>()\\]+)|git\s+worktree\s+add(?:\s+(?!\/)[^\s"'`;&|<>()\\]+)*\s+(?<made>\/[^\s"'`;&|<>()\\]+)/g

function decodeDir(raw: string): string | null {
  let value: string
  try {
    value = JSON.parse(`"${raw}"`) as string
  } catch {
    return null
  }
  if (value.startsWith('file:')) {
    try {
      value = fileURLToPath(value)
    } catch {
      return null
    }
  }
  return isAbsolute(value) ? value : null
}

/**
 * The directories a session recorded, in order of appearance.
 *
 * Reads only whole lines: a line still being written may hold half a path, and that half would be
 * lost for good once the offset moved past it.
 */
export function recordedWorkingDirs(logPath: string): string[] {
  let fd: number
  try {
    fd = openSync(logPath, 'r')
  } catch {
    return scans.get(logPath)?.dirs ?? []
  }
  try {
    const size = fstatSync(fd).size
    let state = scans.get(logPath)
    // Rewritten shorter than what was read: start over rather than read garbage from the middle
    if (!state || size < state.offset) state = { offset: 0, dirs: [] }
    if (size === state.offset) return state.dirs

    const chunk = Buffer.allocUnsafe(size - state.offset)
    const read = readSync(fd, chunk, 0, chunk.length, state.offset)
    const complete = chunk.subarray(0, read).lastIndexOf(0x0a) + 1
    if (complete === 0) return state.dirs

    const text = chunk.subarray(0, complete).toString('utf8')
    const dirs = [...state.dirs]
    for (const match of text.matchAll(RECORDED)) {
      const { cwd, moved, made } = match.groups ?? {}
      const dir = cwd !== undefined ? decodeDir(cwd) : (moved ?? made ?? null)
      if (dir && dirs.at(-1) !== dir) dirs.push(dir)
    }
    scans.set(logPath, { offset: state.offset + complete, dirs })
    return dirs
  } finally {
    closeSync(fd)
  }
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
  /** The session log of the run. null when there is none yet. */
  logPath: string | null
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
  if (!input.logPath || !existsSync(input.logPath)) return input.launchDir
  const dirs = recordedWorkingDirs(input.logPath)
  if (dirs.length === 0) return input.launchDir

  const worktrees = worktreesOf(input.projectDir)
  const projectDir = realDir(input.projectDir)
  const home = projectDir ? worktreeContaining(projectDir, worktrees) : null
  if (!projectDir || !home) return input.launchDir

  for (let i = dirs.length - 1; i >= 0; i--) {
    const real = realDir(dirs[i])
    if (!real) continue
    const tree = worktreeContaining(real, worktrees)
    if (!tree || tree === home) continue
    const samePlace = join(tree, relative(home, projectDir))
    return existsSync(samePlace) ? samePlace : tree
  }
  return input.launchDir
}
