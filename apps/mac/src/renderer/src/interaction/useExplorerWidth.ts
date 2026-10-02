import { paneProfiles, type PaneWidth } from '@design-system/react/layout-spec'
import { useCallback } from 'react'
import { useStore, type ExplorerId } from '../state/store.js'

/** Widths belong to reading surfaces, so navigating between tasks and projects keeps the preference. */
export function useExplorerWidth(id: ExplorerId) {
  const width = useStore(state => state.layout.explorers?.[id] ?? paneProfiles.explorer.initial)
  const onWidthChange = useCallback((next: PaneWidth): void => {
    const state = useStore.getState()
    state.setLayout({ explorers: { ...state.layout.explorers, [id]: next } })
  }, [id])
  return { width, onWidthChange }
}
