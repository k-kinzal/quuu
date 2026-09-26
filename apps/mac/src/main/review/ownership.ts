import { git } from './command.js'
import { commitsSince, readCommits } from './git.js'
import type { ReviewChange, ReviewCommit } from './types.js'

/**
 * Which of what the checkout holds is this task's doing.
 *
 * A task's baseline-to-now comparison was taken as its work. In a checkout only one task ever
 * touches, that is right. In a shared one it is not: tasks of one project take turns on the same
 * `main`, pull what the others merged, and merge `origin/main` into their own branch. Measured on
 * this machine: a task that changed 47 files was described by 9,116, the rest being a fuzz corpus
 * another task had landed in between, and the report for it could not be written at all because
 * a file list that long does not fit in a command line.
 *
 * **The checkout's own reflog says what was created in it, and when.** A commit made here leaves a
 * `commit:` entry (or a cherry-pick, a revert, a rebase step, a merge the agent resolved); one
 * that arrived leaves `pull … Fast-forward`, `checkout:` or `reset:`. Read against the task's run
 * windows, that separates this task's commits from everything else without trusting the author
 * name, which every agent of this Mac shares.
 */

/** One attempt of the task: when its agent was working. `to` is null while it still is. */
export interface RunWindow {
  from: string
  to: string | null
}

export interface TaskWorkInput {
  /**
   * Every run of the task. Left undefined when nobody can say (a caller that only has the
   * repository), and then the whole range from the start is taken as the task's, as before.
   */
  windows?: RunWindow[]
  /** Commit receipts the sessions printed. These are the task's wherever they were made. */
  receipts: string[]
  /**
   * Commits the last projection named. One that merely left the range - the checkout moved to
   * another branch - stays; one that turned out to be somebody else's does not.
   */
  recorded: string[]
}

export interface TaskCommits {
  commits: ReviewCommit[]
  /** Commits between the start and the head that are not this task's. */
  foreign: number
  /** Whether the checkout could testify. When it could not, `commits` is the whole range. */
  judged: boolean
}

/**
 * Reflog actions that create a commit in this checkout. A fast-forward, a checkout or a reset
 * only moves to one that exists, and `rebase (start)` checks out the upstream it rebases onto.
 */
const CREATED_HERE =
  /^(?:commit|cherry-pick|revert|am)\b|^rebase(?: -i)? \((?:pick|squash|fixup|reword|edit|continue|apply|finish)\)|^(?:merge|pull)\b.*: Merge made by/

/** Reflog times are whole seconds; a run's are not. */
const SLACK_MS = 1000

interface ReflogEntry {
  sha: string
  at: number
  action: string
}

async function headReflog(cwd: string): Promise<ReflogEntry[]> {
  const result = await git(cwd, ['reflog', 'show', '--date=iso-strict', '--format=%H%x1f%gd%x1f%gs', 'HEAD'])
  if (result.code !== 0) return []
  const entries: ReflogEntry[] = []
  for (const line of result.stdout.split('\n')) {
    const [sha = '', selector = '', action = ''] = line.split('\x1f')
    const at = Date.parse(/@\{(.+)\}/.exec(selector)?.[1] ?? '')
    if (/^[a-f0-9]{40}$/i.test(sha) && Number.isFinite(at)) entries.push({ sha, at, action })
  }
  return entries
}

function during(at: number, windows: RunWindow[]): boolean {
  return windows.some(
    (window) =>
      at >= Date.parse(window.from) - SLACK_MS && (window.to === null || at <= Date.parse(window.to) + SLACK_MS)
  )
}

/**
 * The commits created in that checkout while one of the task's runs was going, newest first.
 *
 * null when the checkout cannot testify: it keeps no reflog, or its reflog begins after the task
 * did and holds nothing from the task's time - a worktree the agent made mid-task has such a
 * reflog until its first commit. "Nothing was made here" is only an answer from a witness that
 * was there.
 */
export async function commitsCreatedDuring(cwd: string, windows: RunWindow[]): Promise<string[] | null> {
  if (windows.length === 0) return null
  const entries = await headReflog(cwd)
  if (entries.length === 0) return null
  const created: string[] = []
  for (const entry of entries) {
    if (CREATED_HERE.test(entry.action) && during(entry.at, windows) && !created.includes(entry.sha)) created.push(entry.sha)
  }
  const earliest = Math.min(...windows.map((window) => Date.parse(window.from)))
  const reachesBack = entries.some((entry) => entry.at <= earliest + SLACK_MS)
  return created.length > 0 || reachesBack ? created : null
}

/**
 * The task's commits: the ones its runs created in this checkout, the ones its sessions printed
 * receipts for, and the ones the last projection named that have since left the range.
 *
 * `baseHead..head` still bounds `foreign`: what arrived between the start and now that is not
 * the task's. Without run windows, or with a checkout that cannot testify, the range is the
 * answer, as it always was.
 */
export async function taskCommits(
  cwd: string,
  baseHead: string | null,
  head: string | null,
  work: TaskWorkInput
): Promise<TaskCommits> {
  const range = head ? await commitsSince(cwd, baseHead, head) : []
  const known = range.map((commit) => commit.sha)
  const created = work.windows ? await commitsCreatedDuring(cwd, work.windows) : null
  const judged = created !== null
  const own = new Set(judged ? created : known)

  // A receipt may be short; the range settles it before the repository is asked again
  const inRange = (sha: string): string | null =>
    known.find((full) => full.startsWith(sha) || sha.startsWith(full)) ?? null
  const unread: string[] = []
  for (const sha of work.receipts) {
    const full = inRange(sha)
    if (full) own.add(full)
    else unread.push(sha)
  }
  for (const sha of [...own]) {
    if (known.includes(sha)) continue
    // Created here in the window, yet already part of the start: the previous task's last commit,
    // landing within the second the run began. Not this task's.
    if (baseHead && (await git(cwd, ['merge-base', '--is-ancestor', sha, baseHead])).code === 0) own.delete(sha)
    // Otherwise no longer reachable: the checkout moved to another branch since
    else unread.push(sha)
  }
  for (const sha of work.recorded) if (!inRange(sha)) unread.push(sha)

  const commits: ReviewCommit[] = range.filter((commit) => own.has(commit.sha))
  for (const commit of await readCommits(cwd, unread)) {
    if (!commits.some((existing) => existing.sha === commit.sha)) commits.push(commit)
  }
  commits.sort((a, b) => b.committedAt.localeCompare(a.committedAt))
  return { commits, foreign: judged ? known.filter((sha) => !own.has(sha)).length : 0, judged }
}

/**
 * The files this task changed, when the start-to-now comparison also carries other work.
 *
 * Layer the task's commits oldest first, then what is uncommitted. Where the start-to-now
 * comparison knows the same path, its net kind is used: a file the task added and then edited
 * is added, not modified. A path only the task's commits know - one on a branch the checkout has
 * since left, or one the task changed and changed back - stays with the kind the commit gave it.
 */
export function ownChanges(
  cumulative: ReviewChange[],
  commits: ReviewCommit[],
  uncommitted: ReviewChange[]
): ReviewChange[] {
  const net = new Map(cumulative.map((file) => [file.path, file]))
  const changes = new Map<string, ReviewChange>()
  for (const commit of [...commits].sort((a, b) => a.committedAt.localeCompare(b.committedAt))) {
    for (const file of commit.files) changes.set(file.path, net.get(file.path) ?? file)
  }
  for (const file of uncommitted) changes.set(file.path, net.get(file.path) ?? file)
  return [...changes.values()].sort((a, b) => a.path.localeCompare(b.path))
}
