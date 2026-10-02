import type { ProjectPullRequest, PullRequestState } from '../../../api/schemas/review.js'

export interface PullRequestGroup {
  state: PullRequestState
  pullRequests: ProjectPullRequest[]
}

/** Which states the list shows. Open alone is where it starts: that is where CI is still being waited on. */
export type PullRequestStateFilter = PullRequestState | 'all'

export const DEFAULT_STATE_FILTER: PullRequestStateFilter = 'open'

/** Open first; what is over follows, merged before closed. */
export const STATE_ORDER: PullRequestState[] = ['open', 'merged', 'closed']

/** How many there are in each state, so the filter says what it would show before it is picked. */
export function countByState(pullRequests: ProjectPullRequest[]): Record<PullRequestStateFilter, number> {
  const counts = { open: 0, merged: 0, closed: 0, all: pullRequests.length }
  for (const pr of pullRequests) counts[pr.state] += 1
  return counts
}

/**
 * A project's Pull Requests as the list shows them: the picked states, by state, the most
 * recently updated first within each. Empty states are left out rather than shown as empty headings.
 */
export function groupProjectPullRequests(pullRequests: ProjectPullRequest[], query = '', filter: PullRequestStateFilter = 'all'): PullRequestGroup[] {
  const needle = query.trim().toLocaleLowerCase()
  const matches = needle
    ? pullRequests.filter(pr => [`#${String(pr.number)}`, pr.title, pr.headRefName, ...pr.tasks.map(task => task.title)]
      .some(text => text.toLocaleLowerCase().includes(needle)))
    : pullRequests
  return STATE_ORDER.filter(state => filter === 'all' || filter === state).map(state => ({
    state,
    pullRequests: matches.filter(pr => pr.state === state)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.number - a.number)
  })).filter(group => group.pullRequests.length > 0)
}
