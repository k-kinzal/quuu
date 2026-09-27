import { ORPCError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/message-port'
import { BrowserWindow, ipcMain } from 'electron'
import { EVENTS, RPC_CONNECT } from '../../api/channels.js'
import type { QuuuApp } from '../bootstrap.js'
import { createOperationsRouter } from '../api/router.js'
import type { ForwardedOperations } from '../api/host.js'
import type { EventPayloads } from '../../api/events.js'
import { desktopOperations } from '../desktop/operations.js'
import { ownsWindow, windowUrl } from '../windows.js'
import { sendEvent } from './events.js'
import { authorizedFrame } from './validation.js'

function ownerOf(event: Electron.IpcMainEvent): BrowserWindow {
  const owner = BrowserWindow.fromWebContents(event.sender)
  if (!owner || !authorizedFrame({ owned: ownsWindow(owner), mainFrame: event.senderFrame === event.sender.mainFrame, actualUrl: event.senderFrame?.url ?? '', expectedUrl: windowUrl(owner) })) throw new Error('Operations from this sender are not allowed')
  return owner
}

/** Wire window destruction, renderer death, and explicit release to the same cleanup. */
function releaseWithWindow(owner: BrowserWindow, cleanup: () => void): () => void {
  const contents = owner.webContents
  let released = false
  const release = (): void => {
    if (released) return
    released = true
    owner.removeListener('closed', release)
    contents.removeListener('render-process-gone', release)
    cleanup()
  }
  owner.once('closed', release)
  contents.once('render-process-gone', release)
  return release
}

/** The host this Quuu follows as a satellite. Supplied once the network starts. */
export interface HostSource {
  readonly connected: boolean
  session(deliver: (name: string, payload: unknown) => void): (ForwardedOperations & { close(): void }) | null
}
let hostSource: HostSource | null = null
const hostSessions = new Map<BrowserWindow, ForwardedOperations & { close(): void }>()

/** Whether windows are showing a host's data rather than this computer's own. */
export function showingHost(): boolean { return hostSource?.connected ?? false }

/**
 * Point windows at a host, or back at this computer. Sessions opened against the previous side
 * end here; the caller reloads the windows so each screen starts over from the side it now shows.
 */
export function followHost(source: HostSource | null): void {
  hostSource = source
  for (const session of hostSessions.values()) session.close()
  hostSessions.clear()
}

function hostSessionFor(owner: BrowserWindow): ForwardedOperations | null {
  if (!hostSource?.connected) return null
  let session = hostSessions.get(owner)
  if (!session) {
    const opened = hostSource.session((name, payload) => {
      // A newer host may announce more than this Quuu knows how to show.
      if (!Object.values(EVENTS).includes(name as typeof EVENTS[keyof typeof EVENTS]) || owner.isDestroyed()) return
      try { sendEvent(owner, name as keyof EventPayloads, payload as EventPayloads[keyof EventPayloads]) }
      catch (error) { console.warn('Ignoring a host notification this Quuu cannot read', name, error) }
    })
    if (!opened) return null
    session = opened
    hostSessions.set(owner, session)
    releaseWithWindow(owner, () => { if (hostSessions.get(owner) === opened) { hostSessions.delete(owner); opened.close() } })
  }
  return session
}

export function createAppRouter(app: QuuuApp) {
  return createOperationsRouter<BrowserWindow>(app, {
    authorize(owner) {
      if (owner.isDestroyed() || !authorizedFrame({ owned: ownsWindow(owner), mainFrame: true, actualUrl: owner.webContents.mainFrame.url, expectedUrl: windowUrl(owner) })) throw new ORPCError('FORBIDDEN')
    },
    releaseWithOwner: releaseWithWindow,
    sendEvent: (owner, event, payload) => { if (!owner.isDestroyed()) sendEvent(owner, event, payload) },
    desktopFor: desktopOperations,
    forwardFor: hostSessionFor,
  })
}

export { broadcast } from './events.js'

export { EVENTS }

/** Hand only authenticated windows' ports to oRPC. The official adapter parses requests and responds. */
export function registerIpc(app: QuuuApp): void {
  const handler = new RPCHandler(createAppRouter(app))
  ipcMain.removeAllListeners(RPC_CONNECT)
  ipcMain.on(RPC_CONNECT, event => {
    try {
      const owner = ownerOf(event)
      if (event.ports.length !== 1) throw new Error('A connection needs exactly one port')
      const [port] = event.ports
      handler.upgrade(port, { context: { owner } })
      const release = releaseWithWindow(owner, () => port.close())
      port.once('close', release)
      port.start()
    } catch (error) {
      for (const port of event.ports) port.close()
      console.error('IPC connection could not be accepted', error)
    }
  })
}
