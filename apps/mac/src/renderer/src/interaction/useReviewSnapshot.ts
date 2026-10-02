import { useMutation, useQuery } from '@tanstack/react-query'
import type { ReviewSnapshot } from '../../../api/schemas/review.js'
import { queryClient } from '../state/queryClient.js'

interface ReviewData { version: string | null; snapshot: ReviewSnapshot }

/** Polling reads the saved projection only. Refresh explicitly requests new Git / GitHub observations. */
export function useReviewSnapshot(taskId: string, enabled: boolean): {
  snapshot: ReviewSnapshot | null
  loading: boolean
  error: string | null
  refresh(): Promise<void>
} {
  const query = useQuery({
    queryKey: ['review', taskId],
    queryFn: async (): Promise<ReviewData> => {
      const previous = queryClient.getQueryData<ReviewData>(['review', taskId])
      const update = await window.quuu.review.poll({ taskId, knownVersion: previous?.version ?? undefined })
      if (update.snapshot) return { version: update.version, snapshot: update.snapshot }
      if (previous) return previous
      throw new Error('Review poll returned no initial snapshot')
    },
    enabled,
    retry: false,
    networkMode: 'always',
    staleTime: 1000,
    refetchInterval: state => state.state.status === 'error' ? false : 1000
  }, queryClient)
  const refresh = useMutation({
    mutationKey: ['review', 'refresh'],
    mutationFn: async (id: string) => {
      // A poll started before refresh must not restore its old projection after refresh completes.
      await queryClient.cancelQueries({ queryKey: ['review', id] })
      return window.quuu.review.refresh(id)
    },
    onSuccess: async (snapshot, id) => {
      // A slow refresh may span another polling interval; cancel that read as well.
      await queryClient.cancelQueries({ queryKey: ['review', id] })
      queryClient.setQueryData<ReviewData>(['review', id], { version: null, snapshot })
    }
  }, queryClient)
  const refreshError = refresh.variables === taskId ? refresh.error : null
  return {
    snapshot: query.data?.snapshot ?? null,
    loading: enabled && (query.isPending || query.data?.snapshot.preparing === true),
    error: query.error?.message ?? refreshError?.message ?? query.data?.snapshot.error ?? null,
    refresh: async () => { await refresh.mutateAsync(taskId).catch(() => undefined) }
  }
}
