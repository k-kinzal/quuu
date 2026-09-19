import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RPC_CLIENT } from '../../preload/channels.js'
import { App } from './App.js'
import { currentPane, focusPane, movePaneFocus, openContextMenuAtFocus } from './interaction/focus.js'
import { createQuuuClient } from './state/client.js'
import { useStore } from './state/store.js'

// preload exposes only the connection and notifications; the typed client is derived from the contract.
const { port1, port2 } = new MessageChannel()
window.postMessage(RPC_CLIENT, '*', [port2])
window.quuu = createQuuuClient(port1, (error, path, notify) => useStore.getState().reportFailure(error, path, notify))
port1.start()

// Async work outside the render boundary also gets a last path back to the user and diagnostics.
window.addEventListener('unhandledrejection', event => {
  useStore.getState().reportFailure(event.reason)
  event.preventDefault()
})
window.addEventListener('error', event => {
  useStore.getState().reportFailure(event.error ?? event.message)
})

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

/*
 * Dev builds only: expose the store on window.
 *
 * Fixing the UI without looking at it leaves details broken (that actually happened).
 * `scripts/shoot.mjs` grabs this to move to the target screen before shooting.
 * More reliable than replaying a chain of clicks, and no more shots of empty screens.
 */
if (import.meta.env.DEV) {
  ; (window as unknown as { __quuuStore: typeof useStore }).__quuuStore = useStore
    /*
     * Expose pane movement and the context menu the same way.
     *
     * Both are bound to the native menu (⌘⌥← / ⌘⌥⏎), so pressing the keys
     * via CDP never fires them — the OS takes them first.
     * Without a way to verify, "should be keyboard-reachable" is where it ends, so keep this entry point
     */
    ; (
      window as unknown as {
        __quuuFocus: {
          pane: typeof focusPane
          move: typeof movePaneFocus
          current: typeof currentPane
          contextMenu: typeof openContextMenuAtFocus
        }
      }
    ).__quuuFocus = {
      pane: focusPane,
      move: movePaneFocus,
      current: currentPane,
      contextMenu: openContextMenuAtFocus
    }
}

/*
 * Keep the window from accepting dropped items.
 *
 * By default, dropping a file onto the window makes the browser try to
 * open it. Since there is nowhere to receive it, the right thing is to
 * show "you can't drop here" at the cursor stage.
 */
for (const type of ['dragover', 'drop']) {
  window.addEventListener(type, (event) => event.preventDefault())
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
