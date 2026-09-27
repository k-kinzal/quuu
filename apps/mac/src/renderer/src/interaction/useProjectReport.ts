import { useMutation, useQuery } from '@tanstack/react-query'
import type { ProjectReport } from '../../../api/schemas/report.js'
import { queryClient } from '../state/queryClient.js'

/** While one is being written, look often enough that "it finished" is not something you wait for. */
const GENERATING_MS = 2000
/** Daily reports also appear on their own, so the surface keeps checking. */
const IDLE_MS = 5000

export function useProjectReport(projectId: string, enabled: boolean): {
  report: ProjectReport | null
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
    queryKey: ['projectReport', projectId],
    queryFn: () => window.quuu.report.projectGet(projectId),
    enabled,
    retry: false,
    networkMode: 'always',
    staleTime: 1000,
    refetchInterval: (state) =>
      state.state.status === 'error' ? false : state.state.data?.status === 'generating' ? GENERATING_MS : IDLE_MS
  }, queryClient)

  const generate = useMutation({
    mutationKey: ['projectReport', 'generate'],
    mutationFn: (id: string) => window.quuu.report.projectGenerate(id),
    onSettled: (_result, _error, id) => { void queryClient.invalidateQueries({ queryKey: ['projectReport', id] }) }
  }, queryClient)

  return {
    report: query.data ?? null,
    loading: enabled && query.isPending,
    error: query.error?.message ?? null,
    generating: generate.isPending || query.data?.status === 'generating',
    generate: async () => {
      try {
        return await generate.mutateAsync(projectId)
      } catch (caught) {
        return { ok: false, reason: caught instanceof Error ? caught.message : String(caught) }
      }
    }
  }
}
