import { useQuery } from '@tanstack/react-query'
import { queryClient } from '../state/queryClient.js'

export function useHookHistory({ taskId, projectId, active = true }: { taskId?: string; projectId?: string; active?: boolean }) {
  const runs = useQuery({ queryKey: ['hooks.list', taskId, projectId], queryFn: () => window.quuu.hooks.list({ taskId, projectId, limit: 100 }),
    enabled: active, refetchInterval: active ? 2000 : false, retry: false, networkMode: 'always' }, queryClient)
  const report = useQuery({ queryKey: ['hooks.report', taskId], queryFn: () => window.quuu.report.get(taskId!),
    enabled: active && Boolean(taskId), refetchInterval: active && taskId ? 2000 : false, retry: false, networkMode: 'always' }, queryClient)
  return { runs: runs.data, report: report.data, error: runs.error ?? report.error }
}
