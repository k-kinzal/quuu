import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EVENTS } from '../src/api/channels.js'

const host = vi.hoisted(() => ({ created: [] as Window[], focus: vi.fn(), commands: vi.fn() }))
class Window extends EventEmitter {
  minimized = false
  visible = false
  destroyed = false
  loading = true
  webContents = Object.assign(new EventEmitter(), {
    setWindowOpenHandler: vi.fn(), send: host.commands,
    isLoadingMainFrame: () => this.loading
  })
  constructor() { super(); host.created.push(this) }
  loadFile = vi.fn()
  isDestroyed = () => this.destroyed
  isVisible = () => this.visible
  isMinimized = () => this.minimized
  show = vi.fn(() => { this.visible = true })
  hide = vi.fn(() => { this.visible = false })
  focus = vi.fn()
  restore = vi.fn(() => { this.minimized = false })
}
vi.mock('electron', () => ({
  app: { isPackaged: true, focus: host.focus },
  BrowserWindow: class { constructor() { return new Window() } },
  shell: {}, Menu: {}
}))
vi.mock('../src/main/contextMenu.js', () => ({ attachContextMenu: vi.fn() }))

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); host.created.length = 0 })
afterEach(() => vi.restoreAllMocks())

it('restores and focuses the existing minimized window instead of creating another window', async () => {
  const { showWindow } = await import('../src/main/windows.js')
  showWindow()
  const window = host.created[0]
  window.minimized = true
  const { send } = await import('../src/main/menus.js')
  window.loading = false
  send('task.open', { taskId: 'notified-task' }, 'notification')
  expect(host.created).toHaveLength(1)
  expect(window.restore).toHaveBeenCalledOnce()
  expect(window.show).toHaveBeenCalledOnce()
  expect(window.focus).toHaveBeenCalledOnce()
  if (process.platform === 'darwin') expect(host.focus).toHaveBeenCalledWith({ steal: true })
  expect(host.commands).toHaveBeenCalledOnce()
  expect(host.commands).toHaveBeenCalledWith(EVENTS.command, { command: 'task.open', taskId: 'notified-task' })
})

it('holds a notification command until a new window has loaded its preload listener', async () => {
  const { send } = await import('../src/main/menus.js')
  send('task.open', { taskId: 'notified-task' }, 'notification')
  expect(host.commands).not.toHaveBeenCalled()
  const window = host.created[0]
  window.loading = false
  window.webContents.emit('did-finish-load')
  expect(host.commands).toHaveBeenCalledOnce()
  expect(host.commands).toHaveBeenCalledWith(EVENTS.command, { command: 'task.open', taskId: 'notified-task' })
  window.webContents.emit('did-finish-load')
  expect(host.commands).toHaveBeenCalledOnce()
})

it('drops a pending command if its window was destroyed during loading', async () => {
  const { send } = await import('../src/main/menus.js')
  send('task.open', { taskId: 'notified-task' }, 'notification')
  const window = host.created[0]
  window.destroyed = true
  window.webContents.emit('did-finish-load')
  expect(host.commands).not.toHaveBeenCalled()
})
