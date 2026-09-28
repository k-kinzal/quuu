import { useQuery } from '@tanstack/react-query'
import type { ReviewHistoryPoint, ReviewSnapshot } from '../../../api/schemas/review.js'
import { queryClient } from '../state/queryClient.js'

/** A run ending adds a point, so the list is looked at again now and then - never urgently. */
const HISTORY_MS = 10_000

/** The runs whose review was kept as they left it, newest first. */
export function useReviewHistory(taskId: string, enabled: boolean): ReviewHistoryPoint[] {
  const query = useQuery({
    queryKey: ['review-history', taskId],
    queryFn: () => window.quuu.review.history(taskId),
    enabled,
    retry: false,
    networkMode: 'always',
    staleTime: 1000,
    refetchInterval: state => state.state.status === 'error' ? false : HISTORY_MS
  }, queryClient)
  return query.data ?? []
}

/** The review as that run left it. A record: read once, never refreshed. */
export function useReviewHistorySnapshot(taskId: string, runId: string | null): {
  snapshot: ReviewSnapshot | null
  loading: boolean
  error: string | null
} {
  const query = useQuery({
    queryKey: ['review-history', taskId, runId],
    queryFn: () => window.quuu.review.historySnapshot({ taskId, runId: runId ?? '' }),
    enabled: runId !== null,
    retry: false,
    networkMode: 'always',
    staleTime: Infinity
  }, queryClient)
  return {
    snapshot: query.data ?? null,
    loading: runId !== null && query.isPending,
    error: query.error?.message ?? null
  }
}
