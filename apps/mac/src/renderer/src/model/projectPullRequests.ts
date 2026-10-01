import type { ProjectPullRequest, PullRequestState } from '../../../api/schemas/review.js'

export interface PullRequestGroup {
  state: PullRequestState
  pullRequests: ProjectPullRequest[]
}

/** Open first: that is where CI is still being waited on. What is over follows, merged before closed. */
const ORDER: PullRequestState[] = ['open', 'merged', 'closed']

/**
 * A project's Pull Requests as the list shows them: by state, the most recently updated first
 * within each. Empty states are left out rather than shown as empty headings.
 */
export function groupProjectPullRequests(pullRequests: ProjectPullRequest[], query = ''): PullRequestGroup[] {
  const needle = query.trim().toLocaleLowerCase()
  const matches = needle
    ? pullRequests.filter(pr => [`#${String(pr.number)}`, pr.title, pr.headRefName, ...pr.tasks.map(task => task.title)]
      .some(text => text.toLocaleLowerCase().includes(needle)))
    : pullRequests
  return ORDER.map(state => ({
    state,
    pullRequests: matches.filter(pr => pr.state === state)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.number - a.number)
  })).filter(group => group.pullRequests.length > 0)
}
