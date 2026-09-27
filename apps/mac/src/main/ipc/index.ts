import { ORPCError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/message-port'
import { BrowserWindow, ipcMain } from 'electron'
import { EVENTS, RPC_CONNECT } from '../../api/channels.js'
import type { QuuuApp } from '../bootstrap.js'
import { createOperationsRouter } from '../api/router.js'
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

export function createAppRouter(app: QuuuApp) {
  return createOperationsRouter<BrowserWindow>(app, {
    authorize(owner) {
      if (owner.isDestroyed() || !authorizedFrame({ owned: ownsWindow(owner), mainFrame: true, actualUrl: owner.webContents.mainFrame.url, expectedUrl: windowUrl(owner) })) throw new ORPCError('FORBIDDEN')
    },
    releaseWithOwner: releaseWithWindow,
    sendEvent: (owner, event, payload) => { if (!owner.isDestroyed()) sendEvent(owner, event, payload) },
    desktopFor: desktopOperations,
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
