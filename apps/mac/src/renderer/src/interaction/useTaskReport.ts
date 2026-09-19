import { useMutation, useQuery } from '@tanstack/react-query'
import type { TaskReport } from '../../../preload/api/report.js'
import { queryClient } from '../state/queryClient.js'

/** While one is being written, look often enough that "it finished" is not something you wait for. */
const GENERATING_MS = 2000
/** Reports also appear on their own (a task reaching review), so the surface keeps checking. */
const IDLE_MS = 5000

export function useTaskReport(taskId: string, enabled: boolean): {
  report: TaskReport | null
  loading: boolean
  error: string | null
  generating: boolean
  /**
   * Ask for one. The refusal comes back rather than being kept.
   *
   * **A refusal is an event, not a state.** Held as state it outlives the press — the row goes on
   * saying "could not be written" over a report that has since been written, because nothing
   * newer ever cleared it. That actually happened.
   */
  generate(): Promise<{ ok: boolean; reason?: string }>
} {
  const query = useQuery({
    queryKey: ['report', taskId],
    queryFn: () => window.quuu.report.get(taskId),
    enabled,
    retry: false,
    networkMode: 'always',
    staleTime: 1000,
    refetchInterval: (state) =>
      state.state.status === 'error' ? false : state.state.data?.status === 'generating' ? GENERATING_MS : IDLE_MS
  }, queryClient)

  const generate = useMutation({
    mutationKey: ['report', 'generate'],
    mutationFn: (id: string) => window.quuu.report.generate(id),
    onSettled: (_result, _error, id) => { void queryClient.invalidateQueries({ queryKey: ['report', id] }) }
  }, queryClient)

  return {
    report: query.data ?? null,
    loading: enabled && query.isPending,
    error: query.error?.message ?? null,
    generating: generate.isPending || query.data?.status === 'generating',
    generate: async () => {
      try {
        return await generate.mutateAsync(taskId)
      } catch (caught) {
        return { ok: false, reason: caught instanceof Error ? caught.message : String(caught) }
      }
    }
  }
}
