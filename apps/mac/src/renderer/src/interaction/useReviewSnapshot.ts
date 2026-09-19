import { useMutation, useQuery } from '@tanstack/react-query'
import type { ReviewSnapshot } from '../../../preload/api/review.js'
import { queryClient } from '../state/queryClient.js'

/** Polling reads the saved projection only. Refresh explicitly requests new Git / GitHub observations. */
export function useReviewSnapshot(taskId: string, enabled: boolean): {
  snapshot: ReviewSnapshot | null
  loading: boolean
  error: string | null
  refresh(): Promise<void>
} {
  const query = useQuery({
    queryKey: ['review', taskId],
    queryFn: () => window.quuu.review.snapshot(taskId),
    enabled,
    retry: false,
    networkMode: 'always',
    staleTime: 1000,
    refetchInterval: state => state.state.status === 'error' ? false : 1000
  }, queryClient)
  const refresh = useMutation({
    mutationKey: ['review', 'refresh'],
    mutationFn: (id: string) => window.quuu.review.refresh(id),
    onSuccess: (snapshot, id) => { queryClient.setQueryData(['review', id], snapshot) }
  }, queryClient)
  const refreshError = refresh.variables === taskId ? refresh.error : null
  return {
    snapshot: query.data ?? null,
    loading: enabled && (query.isPending || query.data?.preparing === true),
    error: query.error?.message ?? refreshError?.message ?? query.data?.error ?? null,
    refresh: async () => { await refresh.mutateAsync(taskId).catch(() => undefined) }
  }
}
