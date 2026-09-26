import { expect, it } from 'vitest'
import type { ReviewPullRequest } from '../src/preload/api/review.js'
import { overallCheck } from '../src/renderer/src/model/pullRequestStatus.js'

function pull(over: Partial<ReviewPullRequest>): ReviewPullRequest {
  return { number: 1, title: 'PR', url: 'https://github.com/owner/repo/pull/1', headRefName: 'feature', baseRefName: 'main',
    headSha: 'a'.repeat(40), draft: false, updatedAt: '', check: 'neutral', mergeState: 'unknown', state: 'open', files: [], ...over }
}

/**
 * The one circle on the Pull Request tab: red beats yellow beats green, so the worst news is
 * what the tab shows; merged and closed Pull Requests are over and do not color it.
 */
it('reads every open PR as one CI state, worst first, and ignores PRs that are over', () => {
  expect(overallCheck([])).toBe('neutral')
  expect(overallCheck([pull({ check: 'success' })])).toBe('success')
  expect(overallCheck([pull({ check: 'success' }), pull({ check: 'pending' })])).toBe('pending')
  expect(overallCheck([pull({ check: 'pending' }), pull({ check: 'failure' })])).toBe('failure')
  expect(overallCheck([pull({ check: 'success' }), pull({ check: 'neutral' })])).toBe('neutral')
  expect(overallCheck([pull({ check: 'failure', state: 'merged' }), pull({ check: 'success' })])).toBe('success')
  expect(overallCheck([pull({ check: 'failure', state: 'closed' })])).toBe('neutral')
})
