/**
 * The contract for the workbench that sits inside a task.
 *
 * The filesystem, Git, GitHub and the shell are touched only by main; the renderer handles nothing
 * but the read results and operation IDs here. Assembling paths or commands on the UI side makes
 * the same screen skip checks depending on how it was called, so the boundary is pinned by types.
 */

export type ReviewSource = 'working' | 'task' | 'commit' | 'pull-request'

export type FileChangeKind =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'conflicted'

export interface ReviewChange {
  /** The current-side path. For a deletion, the path as of the start. */
  path: string
  change: FileChangeKind
  /** The start-side path for a rename / copy. */
  previousPath?: string
}

export interface ReviewTreeNode {
  /** The same path can appear under different parents (one tree per PR / commit), so it carries a unique display ID. */
  id: string
  name: string
  path: string
  kind: 'directory' | 'file'
  change?: FileChangeKind
  previousPath?: string
  children?: ReviewTreeNode[]
}

export interface ReviewCommit {
  sha: string
  shortSha: string
  subject: string
  author: string
  committedAt: string
  files: ReviewChange[]
}

export type PullRequestCheck = 'success' | 'failure' | 'pending' | 'neutral'

export interface ReviewPullRequest {
  number: number
  title: string
  url: string
  headRefName: string
  baseRefName: string
  headSha: string
  draft: boolean
  updatedAt: string
  check: PullRequestCheck
  files: ReviewChange[]
}

export interface CoverageMetric {
  covered: number
  total: number
  percent: number
}

export interface CoverageSummary {
  source: string
  lines?: CoverageMetric
  functions?: CoverageMetric
  branches?: CoverageMetric
  statements?: CoverageMetric
  files: CoverageFile[]
}

export interface CoverageFile {
  path: string
  lines?: CoverageMetric
  functions?: CoverageMetric
  branches?: CoverageMetric
  statements?: CoverageMetric
  /** Only present for formats that can jump to a line. Never inferred from the totals. */
  uncoveredLines: number[]
}

export interface ProjectTask {
  /** At run time main looks the definition back up from this ID. No command string is accepted from the renderer. */
  id: string
  label: string
  source: 'package' | 'composer' | 'make'
  /** A value for reading. At run time it is not trusted; main reassembles it from the ID. */
  command: string
}

export interface ReviewSnapshot {
  preparing?: boolean
  error?: string
  cwd: string
  branch: string
  repository: string | null
  tree: ReviewTreeNode[]
  changes: ReviewChange[]
  /** Unstaged changes, including new files, kept separate from the index and commit roots. */
  localChanges: ReviewChange[]
  stagedChanges: ReviewChange[]
  /** The base point for reading the task's commits and uncommitted changes as one diff. */
  revision: ReviewRevision | null
  /** Both lists use saved Git trees so partial staging remains readable after further edits. */
  localRevision: ReviewRevision | null
  stagedRevision: ReviewRevision | null
  commits: ReviewCommit[]
  pullRequests: ReviewPullRequest[]
  coverage: CoverageSummary | null
  projectTasks: ProjectTask[]
  /** A note that does not stop the local review (the GitHub CLI not being set up, say). */
  pullRequestNotice?: string
}

/** An immutable pair of Git objects, so the list and the contents are read from the same version. */
export interface ReviewRevision {
  base: string
  head: string
}

export type ReviewLocation =
  | { source: 'working'; ref?: never; revision?: never }
  | { source: 'task'; ref?: never; revision: ReviewRevision }
  | { source: 'commit' | 'pull-request'; ref: string; revision?: never }

export type ReviewFileRequest = ReviewLocation & {
  path: string
  /** The start-side path for a rename / copy. */
  previousPath?: string
}

export type DiffLineKind = 'context' | 'added' | 'deleted' | 'hunk'

export interface DiffLine {
  kind: DiffLineKind
  oldLine: number | null
  newLine: number | null
  text: string
}

export interface CodeSymbol {
  name: string
  kind: 'class' | 'interface' | 'function' | 'method' | 'type' | 'variable' | 'heading'
  line: number
  /** Nesting within the file. 0 is top level. */
  depth: number
}

export interface ReviewFile {
  source: ReviewSource
  path: string
  language: string
  content: string
  diff: DiffLine[]
  symbols: CodeSymbol[]
  /** Needed for line comments on a PR. null for local / commit. */
  pullRequest?: { number: number; headSha: string; url?: string } | null
  binary: boolean
}

export interface ReviewCommentInput {
  pullRequestUrl?: string
  pullRequest: number
  path: string
  line: number
  body: string
  headSha: string
}

export interface ReviewActionResult {
  ok: boolean
  reason?: string
}
