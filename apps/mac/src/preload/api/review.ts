import { z } from 'zod'


/**
 * Contract for the workbench that lives inside a task.
 *
 * Only main touches the filesystem, Git, GitHub, and the shell; the renderer
 * handles nothing but the read results and operation IDs found here. If the
 * screen assembled paths or commands itself, whether validation happens would
 * depend on the call site even within the same screen — so the boundary is
 * pinned down with types.
 */
export const ReviewSourceSchema = z.union([z.literal('working'), z.literal('task'), z.literal('commit'), z.literal('pull-request')])
export type ReviewSource = z.infer<typeof ReviewSourceSchema>

export const FileChangeKindSchema = z.union([z.literal('added'), z.literal('modified'), z.literal('deleted'), z.literal('renamed'), z.literal('copied'), z.literal('untracked'), z.literal('conflicted')])
export type FileChangeKind = z.infer<typeof FileChangeKindSchema>

export const ReviewChangeSchema = z.object({
  /** Path on the current side. For deletions, the path as of the starting point. */
  path: z.string(),
  change: FileChangeKindSchema,
  /** Starting-point side path of a rename / copy. */
  previousPath: z.string().optional()
})
export type ReviewChange = z.infer<typeof ReviewChangeSchema>

export const ReviewTreeNodeSchema = z.object({
  /** The same path can appear under different parents (one tree per PR / commit), so carry a unique display ID. */
  id: z.string(),
  name: z.string(),
  path: z.string(),
  kind: z.union([z.literal('directory'), z.literal('file')]),
  change: FileChangeKindSchema.optional(),
  previousPath: z.string().optional(),
  get children() { return ReviewTreeNodeSchema.array().optional() }
})
export type ReviewTreeNode = z.infer<typeof ReviewTreeNodeSchema>

export const ReviewCommitSchema = z.object({
  sha: z.string(),
  shortSha: z.string(),
  subject: z.string(),
  author: z.string(),
  committedAt: z.string(),
  files: ReviewChangeSchema.array()
})
export type ReviewCommit = z.infer<typeof ReviewCommitSchema>

export const PullRequestCheckSchema = z.union([z.literal('success'), z.literal('failure'), z.literal('pending'), z.literal('neutral')])
export type PullRequestCheck = z.infer<typeof PullRequestCheckSchema>

export const ReviewPullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  headRefName: z.string(),
  baseRefName: z.string(),
  headSha: z.string(),
  draft: z.boolean(),
  updatedAt: z.string(),
  check: PullRequestCheckSchema,
  files: ReviewChangeSchema.array()
})
export type ReviewPullRequest = z.infer<typeof ReviewPullRequestSchema>

export const CoverageMetricSchema = z.object({
  covered: z.number(),
  total: z.number(),
  percent: z.number()
})
export type CoverageMetric = z.infer<typeof CoverageMetricSchema>

export const CoverageFileSchema = z.object({
  path: z.string(),
  lines: CoverageMetricSchema.optional(),
  functions: CoverageMetricSchema.optional(),
  branches: CoverageMetricSchema.optional(),
  statements: CoverageMetricSchema.optional(),
  /** Present only for formats that support jumping to a line. Never inferred from aggregate values. */
  uncoveredLines: z.number().array()
})
export type CoverageFile = z.infer<typeof CoverageFileSchema>

export const CoverageSummarySchema = z.object({
  source: z.string(),
  lines: CoverageMetricSchema.optional(),
  functions: CoverageMetricSchema.optional(),
  branches: CoverageMetricSchema.optional(),
  statements: CoverageMetricSchema.optional(),
  files: CoverageFileSchema.array()
})
export type CoverageSummary = z.infer<typeof CoverageSummarySchema>

export const ProjectTaskSchema = z.object({
  /** At run time, main re-resolves the definition from this ID. No command string is accepted from the renderer. */
  id: z.string(),
  label: z.string(),
  source: z.union([z.literal('package'), z.literal('composer'), z.literal('make')]),
  /** For reading only. Not trusted at run time; main rebuilds it from the ID. */
  command: z.string()
})
export type ProjectTask = z.infer<typeof ProjectTaskSchema>

/** An immutable pair of Git objects, so the listing and file contents are read from the same version. */
export const ReviewRevisionSchema = z.object({
  base: z.string(),
  head: z.string()
})
export type ReviewRevision = z.infer<typeof ReviewRevisionSchema>

export const ReviewSnapshotSchema = z.object({
  preparing: z.boolean().optional(),
  error: z.string().optional(),
  cwd: z.string(),
  branch: z.string(),
  repository: z.union([z.string(), z.null()]),
  tree: ReviewTreeNodeSchema.array(),
  changes: ReviewChangeSchema.array(),
  /** Unstaged changes, including new files, kept separate from the index and commit roots. */
  localChanges: ReviewChangeSchema.array(),
  stagedChanges: ReviewChangeSchema.array(),
  /** Base for reading the task's commits and uncommitted diff as one diff. */
  revision: z.union([ReviewRevisionSchema, z.null()]),
  /** Both lists use saved Git trees so partial staging remains readable after further edits. */
  localRevision: z.union([ReviewRevisionSchema, z.null()]),
  stagedRevision: z.union([ReviewRevisionSchema, z.null()]),
  commits: ReviewCommitSchema.array(),
  pullRequests: ReviewPullRequestSchema.array(),
  coverage: z.union([CoverageSummarySchema, z.null()]),
  projectTasks: ProjectTaskSchema.array(),
  /** Supplementary notice (GitHub CLI not set up, etc.) that must not block local review. */
  pullRequestNotice: z.string().optional()
})
export type ReviewSnapshot = z.infer<typeof ReviewSnapshotSchema>

export const ReviewLocationSchema = z.union([z.object({
  source: z.literal('working'),
  ref: z.never().optional(),
  revision: z.never().optional()
}), z.object({
  source: z.literal('task'),
  ref: z.never().optional(),
  revision: ReviewRevisionSchema
}), z.object({
  source: z.union([z.literal('commit'), z.literal('pull-request')]),
  ref: z.string(),
  revision: z.never().optional()
})])
export type ReviewLocation = z.infer<typeof ReviewLocationSchema>

export const ReviewFileRequestSchema = z.intersection(ReviewLocationSchema, z.object({ path: z.string(), previousPath: z.string().optional() }))
export type ReviewFileRequest = z.infer<typeof ReviewFileRequestSchema>

export const DiffLineKindSchema = z.union([z.literal('context'), z.literal('added'), z.literal('deleted'), z.literal('hunk')])
export type DiffLineKind = z.infer<typeof DiffLineKindSchema>

export const DiffLineSchema = z.object({
  kind: DiffLineKindSchema,
  oldLine: z.union([z.number(), z.null()]),
  newLine: z.union([z.number(), z.null()]),
  text: z.string()
})
export type DiffLine = z.infer<typeof DiffLineSchema>

export const CodeSymbolSchema = z.object({
  name: z.string(),
  kind: z.union([z.literal('class'), z.literal('interface'), z.literal('function'), z.literal('method'), z.literal('type'), z.literal('variable'), z.literal('heading')]),
  line: z.number(),
  /** Nesting within the file. 0 is top level. */
  depth: z.number()
})
export type CodeSymbol = z.infer<typeof CodeSymbolSchema>

export const ReviewFileSchema = z.object({
  source: ReviewSourceSchema,
  path: z.string(),
  language: z.string(),
  content: z.string(),
  diff: DiffLineSchema.array(),
  symbols: CodeSymbolSchema.array(),
  /** Needed for PR line comments. Null for local / commit. */
  pullRequest: z.union([z.object({
    url: z.string().optional(),
    number: z.number(),
    headSha: z.string()
  }), z.null()]).optional(),
  binary: z.boolean()
})
export type ReviewFile = z.infer<typeof ReviewFileSchema>

export const ReviewCommentInputSchema = z.object({
  pullRequestUrl: z.string().optional(),
  pullRequest: z.number().int().positive(),
  path: z.string(),
  line: z.number().int().positive(),
  body: z.string(),
  headSha: z.string()
})
export type ReviewCommentInput = z.infer<typeof ReviewCommentInputSchema>

export const ReviewActionResultSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional()
})
export type ReviewActionResult = z.infer<typeof ReviewActionResultSchema>
