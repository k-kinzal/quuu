import type { PullRequestCheck, ReviewPullRequest } from '../../../api/schemas/review.js'

/**
 * The CI of a task's Pull Requests read as one: red if any failed, yellow if any is still
 * running, green only when every open one passed. Merged and closed Pull Requests are over,
 * so they do not color the tab; with nothing open, or nothing reporting, there is no color.
 */
export function overallCheck(pullRequests: ReviewPullRequest[]): PullRequestCheck {
  const open = pullRequests.filter(pr => pr.state === 'open')
  if (open.some(pr => pr.check === 'failure')) return 'failure'
  if (open.some(pr => pr.check === 'pending')) return 'pending'
  if (open.length > 0 && open.every(pr => pr.check === 'success')) return 'success'
  return 'neutral'
}
