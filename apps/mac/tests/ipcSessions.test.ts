import { createRouterClient } from '@orpc/server'
import type { BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import { createAppRouter, registerIpc } from '../src/main/ipc/index.js'
import { EVENTS, RPC_CONNECT } from '../src/preload/channels.js'

const transport = vi.hoisted(() => ({ handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>() }))
vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: (contents: { owner: unknown }) => contents.owner },
  ipcMain: { removeAllListeners: (channel: string) => transport.handlers.delete(channel), on: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => transport.handlers.set(channel, handler) },
  clipboard: {}, dialog: {}, shell: {}, Menu: {}, WebContentsView: class { }
}))
vi.mock('../src/main/windows.js', () => ({ applicationWindows: () => [], ownsWindow: () => true, windowUrl: () => 'file:///quuu/index.html' }))
class Window extends EventEmitter {
  webContents = Object.assign(new EventEmitter(), {
    owner: this,
    mainFrame: { url: 'file:///quuu/index.html' },
    send: vi.fn()
  })
  isDestroyed(): boolean { return false }
}
let app: QuuuApp
let router: ReturnType<typeof createAppRouter>
function client(owner: Window) {
  return createRouterClient(router, { context: { owner: owner as unknown as BrowserWindow } })
}
beforeEach(() => {
  app = new QuuuApp(':memory:')
  app.scheduler.pause()
  router = createAppRouter(app)
})
afterEach(() => { app.shutdown(); app.db.close(); vi.restoreAllMocks(); transport.handlers.clear() })

it('session tailing is owned per window, and updates go only to the window that selected it', async () => {
  const first = new Window(), second = new Window()
  const create = vi.spyOn(app, 'createSessionView')
  await client(first).session.load('missing-first')
  await client(second).session.load('missing-second')
  const firstView = create.mock.results[0].value as ReturnType<QuuuApp['createSessionView']>
  const appended = { runId: 'first', sessionId: 's1', messages: [], replaceFromId: null }
  firstView.watcher.emit('appended', appended)
  expect(first.webContents.send).toHaveBeenCalledWith(EVENTS.sessionAppended, appended)
  expect(second.webContents.send).not.toHaveBeenCalled()
  expect(create).toHaveBeenCalledTimes(2)
  first.emit('closed')
  second.emit('closed')
})

it('explicit close and renderer death release the subscription, and open/close cycles do not stack closed listeners', async () => {
  const owner = new Window()
  const release = vi.spyOn(app, 'releaseSessionView')
  for (let i = 0; i < 3; i++) {
    await client(owner).session.load('missing')
    expect(owner.listenerCount('closed')).toBe(1)
    await client(owner).session.close()
    expect(owner.listenerCount('closed')).toBe(0)
    expect(owner.webContents.listenerCount('render-process-gone')).toBe(0)
  }
  await client(owner).session.load('missing')
  owner.webContents.emit('render-process-gone')
  owner.emit('closed')
  expect(release).toHaveBeenCalledTimes(4)
})

it('another window cannot drive a terminal, and output and teardown stay bound to the owning window', async () => {
  const first = new Window(), second = new Window()
  vi.spyOn(app.terminal, 'openWorkbenchTerminal').mockReturnValue({ id: 'pty-first', cwd: '/tmp', shell: '/bin/sh', columns: 80, rows: 24 })
  const input = vi.spyOn(app.terminal, 'sendWorkbenchTerminal').mockReturnValue({ ok: true })
  const close = vi.spyOn(app.terminal, 'closeWorkbenchTerminal').mockImplementation(() => undefined)
  await client(first).terminal.open({ taskId: 't1', columns: 80, rows: 24 })
  await expect(client(second).terminal.input({ sessionId: 'pty-first', input: 'text' })).rejects.toMatchObject({ code: 'OPERATION_FAILED', data: { reason: 'Not a terminal of this window' } })
  await client(first).terminal.input({ sessionId: 'pty-first', input: 'text' })
  expect(input).toHaveBeenCalledTimes(1)
  expect(input).toHaveBeenCalledWith('pty-first', 'text')
  const event = { sessionId: 'pty-first', type: 'output', data: 'ready' }
  app.terminals.emit('terminal', event)
  expect(first.webContents.send).toHaveBeenCalledWith(EVENTS.terminal, event)
  expect(second.webContents.send).not.toHaveBeenCalled()
  first.webContents.emit('render-process-gone')
  first.emit('closed')
  expect(close).toHaveBeenCalledTimes(1)
  expect(close).toHaveBeenCalledWith('pty-first')
})

it('a connection from an iframe gets its port closed and no operations exposed', () => {
  registerIpc(app)
  const owner = new Window()
  const port = { close: vi.fn() }
  const create = vi.spyOn(app.tasks, 'createTask')
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  transport.handlers.get(RPC_CONNECT)!({ sender: owner.webContents, senderFrame: { url: 'file:///quuu/index.html' }, ports: [port] })
  expect(port.close).toHaveBeenCalledOnce()
  expect(log).toHaveBeenCalled()
  expect(create).not.toHaveBeenCalled()
})
