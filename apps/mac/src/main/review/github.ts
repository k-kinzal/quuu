import { t } from '../i18n/index.js'
import { cleanupGitHubAuth, githubRepositoryFromRemote, prepareGitHubAuthEnvironment } from '../platform/githubAuth.js'
import type { Project } from '../projects/types.js'
import { resolveCommitIdentity } from '../settings/commitIdentity.js'
import type { AppSettings } from '../settings/types.js'
import type { CommandResult } from './command.js'
import { command, git } from './command.js'
import type { FileChangeKind, ReviewPullRequest } from './types.js'

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

function pullFileChange(file: Record<string, unknown>): FileChangeKind {
  const value = textValue(file.status)
  if (value === 'added') return 'added'
  if (value === 'removed' || value === 'deleted') return 'deleted'
  if (value === 'renamed') return 'renamed'
  return 'modified'
}

async function withGitHub<T>(
  cwd: string,
  project: Project,
  settings: AppSettings,
  run: (env: NodeJS.ProcessEnv) => Promise<T>
): Promise<T> {
  const prepared = prepareGitHubAuthEnvironment(
    resolveCommitIdentity(settings, project),
    cwd,
    process.env.PATH ?? '',
    process.env
  )
  try {
    return await run({ ...process.env, ...prepared.env })
  } finally {
    cleanupGitHubAuth(prepared.dir)
  }
}

export async function gh(
  cwd: string,
  project: Project,
  settings: AppSettings,
  args: string[],
  timeout = 20_000
): Promise<CommandResult> {
  return withGitHub(cwd, project, settings, (env) => command('gh', args, { cwd, env, timeout }))
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
      headRefName: '', baseRefName: '', headSha: '', draft: false, updatedAt: '', check: 'neutral', files: []
    }
    try {
      const detail = await gh(cwd, project, settings, ['pr', 'view', url, '--json',
        'number,title,url,headRefName,baseRefName,headRefOid,isDraft,updatedAt,statusCheckRollup'])
      if (detail.code !== 0) throw new Error(detail.stderr.trim() || t('review.fetchFailed'))
      const value: unknown = JSON.parse(detail.stdout)
      if (!isRecord(value) || Number(value.number) !== ref.number) throw new Error(t('review.fetchFailed'))
      item = { ...item, title: textValue(value.title) || item.title,
        headRefName: textValue(value.headRefName), baseRefName: textValue(value.baseRefName),
        headSha: textValue(value.headRefOid), draft: Boolean(value.isDraft), updatedAt: textValue(value.updatedAt),
        check: pullRequestCheck(value.statusCheckRollup) }
      const files = await gh(cwd, project, settings, ['api', '--paginate', '--slurp', `repos/${ref.repository}/pulls/${ref.number}/files?per_page=100`])
      if (files.code !== 0) throw new Error(files.stderr.trim() || t('review.fetchFailed'))
      const pages: unknown = JSON.parse(files.stdout)
      const paths = Array.isArray(pages) ? pages.flat().filter(isRecord) : []
      item.files = paths.map(file => ({ path: textValue(file.filename), change: pullFileChange(file),
        ...(file.previous_filename ? { previousPath: textValue(file.previous_filename) } : {}) }))
    } catch (error) {
      notices.push(error instanceof Error ? error.message : t('review.fetchFailed'))
    }
    // A successful creation receipt remains visible even if GitHub cannot be reached yet.
    items.push(item)
  }
  return { items, ...(notices.length ? { notice: notices.join('\n') } : {}) }
}

export async function pullRequests(
  cwd: string,
  project: Project,
  settings: AppSettings,
  since: string | null,
  recordedUrls?: string[]
): Promise<{ items: ReviewPullRequest[]; notice?: string }> {
  // A task that has not started yet shows none of the PRs the repository already had.
  if (!since) return { items: [] }
  if (recordedUrls) return recordedPullRequests(cwd, project, settings, recordedUrls)
  const remote = await git(cwd, ['config', '--get', 'remote.origin.url'])
  if (remote.code !== 0 || !githubRepositoryFromRemote(remote.stdout.trim())) return { items: [] }
  try {
    const result = await gh(cwd, project, settings, [
      'pr',
      'list',
      '--state',
      'all',
      '--search',
      `updated:>=${since.slice(0, 10)}`,
      '--limit',
      '1000',
      '--json',
      'number,title,url,headRefName,baseRefName,headRefOid,isDraft,updatedAt,statusCheckRollup,files'
    ])
    if (result.code !== 0) {
      return { items: [], notice: result.stderr.trim() || t('review.fetchFailed') }
    }
    const value: unknown = JSON.parse(result.stdout)
    const parsed = Array.isArray(value)
      ? value.filter(isRecord).filter((item) => {
        const updated = Date.parse(textValue(item.updatedAt))
        return Number.isFinite(updated) && updated >= Date.parse(since)
      })
      : []
    return {
      items: parsed.map((item) => ({
        number: Number(item.number),
        title: textValue(item.title),
        url: textValue(item.url),
        headRefName: textValue(item.headRefName),
        baseRefName: textValue(item.baseRefName),
        headSha: textValue(item.headRefOid),
        draft: Boolean(item.isDraft),
        updatedAt: textValue(item.updatedAt),
        check: pullRequestCheck(item.statusCheckRollup),
        files: Array.isArray(item.files)
          ? item.files.filter(isRecord).map((file) => ({
            path: textValue(file.path),
            change: pullFileChange(file)
          }))
          : []
      }))
    }
  } catch (error) {
    return {
      items: [],
      notice: error instanceof Error ? error.message : t('review.fetchFailed')
    }
  }
}
