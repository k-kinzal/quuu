import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { EVENTS, RPC_CLIENT, RPC_CONNECT, TELEMETRY } from '../api/channels.js'
import type { EventPayloads, QuuuEvents } from '../api/events.js'

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

// Notification clicks can arrive before React has loaded the initial task snapshot.
const pendingCommands: EventPayloads[typeof EVENTS.command][] = []
const commandListeners = new Set<(payload: EventPayloads[typeof EVENTS.command]) => void>()
ipcRenderer.on(EVENTS.command, (_event, payload: EventPayloads[typeof EVENTS.command]) => {
  if (commandListeners.size === 0) pendingCommands.push(payload)
  else for (const listener of commandListeners) listener(payload)
})

const events: QuuuEvents = {
  snapshot: cb => subscribe(EVENTS.snapshot, cb),
  settings: cb => subscribe(EVENTS.settings, cb),
  sessionAppended: cb => subscribe(EVENTS.sessionAppended, cb),
  schedulerStatus: cb => subscribe(EVENTS.schedulerStatus, cb),
  toast: cb => subscribe(EVENTS.toast, cb),
  command: cb => {
    commandListeners.add(cb)
    for (const payload of pendingCommands.splice(0)) cb(payload)
    return () => { commandListeners.delete(cb) }
  },
  terminal: cb => subscribe(EVENTS.terminal, cb)
}
contextBridge.exposeInMainWorld('quuuEvents', events)

// Which keyboard the shortcut hints are written for (⌘ on macOS, Ctrl elsewhere)
contextBridge.exposeInMainWorld('quuuPlatform', process.platform)

// webUtils needs the original DOM File, before IPC structured cloning loses its native path.
contextBridge.exposeInMainWorld('quuuFiles', { getPathForFile: (file: File): string => webUtils.getPathForFile(file) } satisfies import('../api/schemas/files.js').QuuuFiles)

// Main validates and, while telemetry is off, drops these unread.
contextBridge.exposeInMainWorld('quuuTelemetry', { record: (event) => { ipcRenderer.send(TELEMETRY, event) } } satisfies import('../api/schemas/telemetry.js').QuuuTelemetry)
