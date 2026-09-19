import { useMutation } from '@tanstack/react-query'
import { queryClient } from '../state/queryClient.js'
import { useStore } from '../state/store.js'

export function useSessionPaging() {
  const mutation = useMutation({
    mutationKey: ['session', 'loadMore'],
    mutationFn: (direction: 'older' | 'newer' | 'latest') => useStore.getState().loadMoreSession(direction)
  }, queryClient)
  return { pending: mutation.isPending, load: mutation.mutateAsync }
}
