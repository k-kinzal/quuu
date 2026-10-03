import { t } from '../i18n/index.js'
import { cleanupGitHubAuth, prepareGitHubAuthEnvironment } from '../platform/githubAuth.js'
import type { Project } from '../projects/types.js'
import { resolveCommitIdentity } from '../settings/commitIdentity.js'
import type { AppSettings } from '../settings/types.js'
import type { CommandResult } from './command.js'
import { command } from './command.js'
import type { FileChangeKind, PullRequestMergeState, PullRequestState, ReviewPullRequest, VerifiedPullRequest } from './types.js'
import { runtimeEnv } from '../platform/processEnv.js'

/** Everything the review reads off one Pull Request. Both the single fetch and the listing ask for it. */
const PULL_REQUEST_FIELDS = 'number,title,url,headRefName,baseRefName,headRefOid,isDraft,updatedAt,statusCheckRollup,mergeable,mergeStateStatus,state'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function pullRequestCheck(value: unknown): ReviewPullRequest['check'] {
  if (!Array.isArray(value) || value.length === 0) return 'neutral'
  const checks = value.filter(isRecord)
  if (checks.some((check) => ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(textValue(check.conclusion) || textValue(check.state)))) {
    return 'failure'
  }
  if (checks.some((check) => ['PENDING', 'QUEUED', 'IN_PROGRESS', 'EXPECTED'].includes(textValue(check.status) || textValue(check.state)))) {
    return 'pending'
  }
  if (checks.length > 0 && checks.every((check) => ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(textValue(check.conclusion) || textValue(check.state)))) {
    return 'success'
  }
  return 'neutral'
}

/**
 * GitHub answers two questions about merging: `mergeable` (can it, at all) and `mergeStateStatus`
 * (why not). A conflict shows up as `CONFLICTING` on the first and `DIRTY` on the second; either one
 * is enough. Everything that is not a plain yes stays `unknown` - a base branch that moved, or a
 * computation GitHub has not finished yet, is not a conflict the agent can resolve.
 */
function pullRequestMergeState(mergeable: unknown, status: unknown): PullRequestMergeState {
  if (textValue(mergeable) === 'CONFLICTING' || textValue(status) === 'DIRTY') return 'conflicting'
  if (textValue(mergeable) === 'MERGEABLE') return 'clean'
  return 'unknown'
}

function pullRequestState(value: unknown): PullRequestState {
  const state = textValue(value)
  return state === 'MERGED' ? 'merged' : state === 'CLOSED' ? 'closed' : 'open'
}

function pullFileChange(file: Record<string, unknown>): FileChangeKind {
  const value = textValue(file.status)
  if (value === 'added') return 'added'
  if (value === 'removed' || value === 'deleted') return 'deleted'
  if (value === 'renamed') return 'renamed'
  return 'modified'
}

export async function gh(
  cwd: string,
  project: Project,
  settings: AppSettings,
  args: string[],
  timeout = 20_000
): Promise<CommandResult> {
  const prepared = prepareGitHubAuthEnvironment(
    resolveCommitIdentity(settings, project),
    cwd,
    process.env.PATH ?? '',
    process.env
  )
  try {
    // Review reads use the same authenticated launcher as agent Runs. The
    // prepared config initially contains a sentinel, not an issued token.
    const [executable, ...invocation] = [...(prepared.launch ?? []), 'gh', ...args]
    return await command(executable, invocation, {
      cwd,
      env: { ...process.env, ...prepared.env, ...runtimeEnv(executable), NODE_OPTIONS: undefined },
      timeout
    })
  } finally {
    cleanupGitHubAuth(prepared.dir)
  }
}

export function pullRequestUrl(value: string): { repository: string; number: number; url: string } | null {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*)\/pull\/([1-9]\d*)$/.exec(value)
  return match && Number.isSafeInteger(Number(match[2])) ? { repository: match[1], number: Number(match[2]), url: value } : null
}

async function recordedPullRequests(cwd: string, project: Project, settings: AppSettings, urls: string[]): Promise<{ items: ReviewPullRequest[]; notice?: string }> {
  const items: ReviewPullRequest[] = []
  const notices: string[] = []
  for (const url of [...new Set(urls)]) {
    const ref = pullRequestUrl(url)
    if (!ref) continue
    let item: ReviewPullRequest = {
      number: ref.number, url, title: t('review.recordedPullRequest', { number: ref.number }),
      headRefName: '', baseRefName: '', headSha: '', draft: false, updatedAt: '', check: 'neutral',
      mergeState: 'unknown', state: 'open', files: []
    }
    try {
      const detail = await gh(cwd, project, settings, ['pr', 'view', url, '--json', PULL_REQUEST_FIELDS])
      if (detail.code !== 0) throw new Error(detail.stderr.trim() || t('review.fetchFailed'))
      const value: unknown = JSON.parse(detail.stdout)
      if (!isRecord(value) || Number(value.number) !== ref.number) throw new Error(t('review.fetchFailed'))
      item = { ...item, title: textValue(value.title) || item.title,
        headRefName: textValue(value.headRefName), baseRefName: textValue(value.baseRefName),
        headSha: textValue(value.headRefOid), draft: Boolean(value.isDraft), updatedAt: textValue(value.updatedAt),
        check: pullRequestCheck(value.statusCheckRollup),
        mergeState: pullRequestMergeState(value.mergeable, value.mergeStateStatus), state: pullRequestState(value.state) }
      const files = await gh(cwd, project, settings, ['api', '--paginate', '--slurp', `repos/${ref.repository}/pulls/${ref.number}/files?per_page=100`])
      if (files.code !== 0) throw new Error(files.stderr.trim() || t('review.fetchFailed'))
      const pages: unknown = JSON.parse(files.stdout)
      const paths = Array.isArray(pages) ? pages.flat().filter(isRecord) : []
      item.files = paths.map(file => ({ path: textValue(file.filename), change: pullFileChange(file),
        ...(file.previous_filename ? { previousPath: textValue(file.previous_filename) } : {}) }))
    } catch (error) {
      notices.push(error instanceof Error ? error.message : t('review.fetchFailed'))
    }
    // A verified association remains visible even if GitHub cannot be reached yet.
    items.push(item)
  }
  return { items, ...(notices.length ? { notice: notices.join('\n') } : {}) }
}

export async function pullRequests(
  cwd: string,
  project: Project,
  settings: AppSettings,
  since: string | null,
  verified: VerifiedPullRequest[]
): Promise<{ items: ReviewPullRequest[]; notice?: string }> {
  if (!since) return { items: [] }
  return recordedPullRequests(cwd, project, settings, verified.map(proof => proof.url))
}
