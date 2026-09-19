import { MutationCache, QueryClient } from '@tanstack/react-query'
import { useStore } from './store.js'

/** IPC works regardless of network connectivity. Writes are never retried automatically. */
export const queryClient = new QueryClient({
  defaultOptions: { mutations: { retry: false, networkMode: 'always', gcTime: 0 } },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      const operation = mutation.options.mutationKey?.filter((part): part is string => typeof part === 'string') ?? []
      useStore.getState().reportFailure(error, operation, mutation.options.meta?.feedback !== 'inline')
    }
  })
})
