import { useQuery } from '@tanstack/react-query'
import type { ReportHistoryEntry } from '../../../api/schemas/report.js'
import { queryClient } from '../state/queryClient.js'

/** Every page the task's report has had, newest first. Looked at again as new ones are written. */
export function useReportHistory(taskId: string, enabled: boolean): ReportHistoryEntry[] {
  const query = useQuery({
    queryKey: ['report-history', taskId],
    queryFn: () => window.quuu.report.history(taskId),
    enabled,
    retry: false,
    networkMode: 'always',
    staleTime: 1000,
    refetchInterval: state => state.state.status === 'error' ? false : 10_000
  }, queryClient)
  return query.data ?? []
}
