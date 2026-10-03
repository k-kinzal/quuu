import { z } from 'zod'
import { t } from '../i18n/index.js'
import type { Project } from '../projects/types.js'
import type { AppSettings } from '../settings/types.js'
import { gh, pullRequests, pullRequestUrl } from './github.js'
import type { ObservedCommit, ReviewEvidence, ReviewPullRequest, VerifiedPullRequest } from './types.js'

const sha = z.string().regex(/^[a-f0-9]{40}$/i)
const repository = z.string().regex(/^[\w.-]+\/[\w.-]+$/)
const pull = z.object({
  number: z.number().int().positive(),
  html_url: z.string(),
  head: z.object({ sha, repo: z.object({ full_name: repository }).nullable() }),
  base: z.object({ repo: z.object({ full_name: repository }) })
})

/**
 * Logs propose URLs; GitHub and local commit provenance confirm them. No source
 * code inspection, tool label, branch name, author or timestamp on a PR can
 * promote a candidate. Exact head matching also excludes descendants in a stack
 * which merely contain this task's work.
 */
export async function reconcilePullRequests(
  cwd: string,
  project: Project,
  settings: AppSettings,
  since: string | null,
  evidence: ReviewEvidence,
  observed: ObservedCommit[],
  verified?: (proof: VerifiedPullRequest) => void
): Promise<{ items: ReviewPullRequest[]; notice?: string }> {
  if (!since) return { items: [] }
  const owns = new Set(observed.map(commit => `${commit.repository.toLowerCase()}@${commit.sha.toLowerCase()}`))
  const confirmed = new Map((evidence.verifiedPullRequests ?? []).map(proof => [proof.url, proof]))
  const notices = new Set<string>()
  const seen = new Set<string>()
  const accept = (value: unknown): void => {
    const item = pull.parse(value)
    const ref = pullRequestUrl(item.html_url)
    if (!ref || ref.number !== item.number || ref.repository.toLowerCase() !== item.base.repo.full_name.toLowerCase()) {
      throw new Error(t('review.fetchFailed'))
    }
    seen.add(ref.url)
    const source = item.head.repo?.full_name
    if (!source || !owns.has(`${source.toLowerCase()}@${item.head.sha.toLowerCase()}`)) return
    const proof = { url: ref.url, repository: source, headSha: item.head.sha }
    if (!confirmed.has(ref.url)) verified?.(proof)
    confirmed.set(ref.url, proof)
  }
  const query = async (path: string, paged: boolean): Promise<void> => {
    const result = await gh(cwd, project, settings, ['api', ...(paged ? ['--paginate', '--slurp'] : []), path])
    if (result.code !== 0) throw new Error(result.stderr.trim() || t('review.fetchFailed'))
    const value: unknown = JSON.parse(result.stdout)
    if (paged) {
      for (const page of z.array(z.array(z.unknown())).parse(value)) for (const item of page) accept(item)
    } else accept(value)
  }
  // Bounded concurrency and a wall-time budget prevent large histories from
  // occupying the review queue indefinitely. A partial read is explicitly unknown.
  const deadline = Date.now() + 20_000
  const execute = async (jobs: Array<() => Promise<void>>): Promise<void> => {
    for (let i = 0; i < jobs.length; i += 4) {
      if (Date.now() >= deadline) { notices.add(t('review.prVerificationIncomplete')); return }
      const results = await Promise.allSettled(jobs.slice(i, i + 4).map(job => job()))
      for (const result of results) {
        if (result.status === 'rejected') {
          console.warn('PR ownership verification failed', result.reason)
          notices.add(t('review.prVerificationIncomplete'))
        }
      }
    }
  }
  if (owns.size) {
    // This path works even when the provider printed no receipt, or no log exists.
    const commits = new Map(observed.map(commit => [`${commit.repository.toLowerCase()}@${commit.sha}`, commit]))
    await execute([...commits.values()].filter(commit => ![...confirmed.values()].some(proof =>
      proof.repository.toLowerCase() === commit.repository.toLowerCase() && proof.headSha === commit.sha
    )).map(commit => () => query(`repos/${commit.repository}/commits/${commit.sha}/pulls?per_page=100`, true)))
    // Closed unmerged PRs and upstream fork PRs may not appear in commit discovery.
    await execute([...new Set(evidence.pullRequestCandidates)].filter(url => !seen.has(url) && !confirmed.has(url)).flatMap(url => {
      const ref = pullRequestUrl(url)
      return ref ? [() => query(`repos/${ref.repository}/pulls/${ref.number}`, false)] : []
    }))
  } else if (evidence.pullRequestCandidates.some(url => !confirmed.has(url))) {
    notices.add(t('review.prOwnershipUnknown'))
  }
  const result = await pullRequests(cwd, project, settings, since, [...confirmed.values()])
  if (result.notice) notices.add(result.notice)
  return { items: result.items, ...(notices.size ? { notice: [...notices].join('\n') } : {}) }
}
