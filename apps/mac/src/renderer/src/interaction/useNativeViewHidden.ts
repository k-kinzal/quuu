import { useLayoutEffect, useState } from 'react'
import { useStore } from '../state/store.js'

// Native browser views cover DOM portals. Keep pickers, menus and dialogs usable.
// A task list also has role=listbox, so only an expanded combobox denotes a picker.
function hasOverlay(): boolean {
  return Boolean(document.querySelector('[role="dialog"], [role="menu"], [role="combobox"][aria-expanded="true"]'))
}

export function useNativeViewHidden(): boolean {
  const paletteOpen = useStore(state => state.paletteOpen)
  const [overlayOpen, setOverlayOpen] = useState(hasOverlay)
  useLayoutEffect(() => {
    const update = (): void => setOverlayOpen(hasOverlay())
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-expanded'] })
    update()
    return () => observer.disconnect()
  }, [])
  return paletteOpen || overlayOpen
}
