import { useStore } from '../state/store.js'

/** Hands the occupied regions the window reported to the View's layout. */
export function useWindowLayout() {
  const layout = useStore(state => state.windowLayout)
  return { WINDOW_BUTTONS_INSET: layout.leftInset, COLLAPSED_RAIL_WIDTH: layout.collapsedRailWidth, WINDOW_BUTTONS_OVERHANG: layout.overhang }
}
