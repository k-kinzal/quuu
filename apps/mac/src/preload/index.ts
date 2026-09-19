import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { EVENTS, RPC_CLIENT, RPC_CONNECT } from './channels.js'
import type { EventPayloads, QuuuEvents } from './events.js'

// Only forward ports from the main frame itself to main. main verifies the sender too.
window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window || event.data !== RPC_CLIENT || event.ports.length !== 1) return
  ipcRenderer.postMessage(RPC_CONNECT, null, [event.ports[0]])
})

function subscribe<K extends keyof EventPayloads>(channel: K, cb: (payload: EventPayloads[K]) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: EventPayloads[K]): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
const events: QuuuEvents = {
  snapshot: cb => subscribe(EVENTS.snapshot, cb),
  sessionAppended: cb => subscribe(EVENTS.sessionAppended, cb),
  schedulerStatus: cb => subscribe(EVENTS.schedulerStatus, cb),
  toast: cb => subscribe(EVENTS.toast, cb),
  command: cb => subscribe(EVENTS.command, cb),
  terminal: cb => subscribe(EVENTS.terminal, cb)
}
contextBridge.exposeInMainWorld('quuuEvents', events)

// webUtils needs the original DOM File, before IPC structured cloning loses its native path.
contextBridge.exposeInMainWorld('quuuFiles', { getPathForFile: (file: File): string => webUtils.getPathForFile(file) } satisfies import('./api/files.js').QuuuFiles)
