import { EventEmitter, once } from 'node:events'
import { createServer, type Server, type Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../src/main/db/database.js'
import * as repo from '../src/main/db/repo.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { SettingsOperations } from '../src/main/settings/operations.js'
import { deliverNotification } from '../src/main/notifications/delivery.js'
import { renderSstpScript, selectSstpScript, sendSstp } from '../src/main/notifications/sstp.js'
import { NOTIFICATION_KINDS } from '../src/main/notifications/types.js'
import type { ToastPayload } from '../src/main/snapshot.js'
import { contract } from '../src/api/contract.js'
import { createRouterClient, implement } from '@orpc/server'

const native = vi.hoisted(() => ({ supported: true, created: [] as EventEmitter[], options: [] as unknown[] }))
vi.mock('electron', () => ({ Notification: class extends EventEmitter {
  static isSupported() { return native.supported }
  constructor(options: unknown) { super(); native.created.push(this); native.options.push(options) }
  show = vi.fn()
} }))
import { showNativeNotification } from '../src/main/desktop/notifications.js'

const event: ToastPayload = { id: 'event', notificationKind: 'review', level: 'success', message: 'Ready', taskId: 'task', taskTitle: 'Build', projectId: 'project', projectName: 'Project' }
const settings = () => ({ ...structuredClone(DEFAULT_SETTINGS), sstpEnabled: true, sstpScripts: Object.fromEntries(NOTIFICATION_KINDS.map(kind => [kind, ['\\0{{message}}\\e']])) as typeof DEFAULT_SETTINGS.sstpScripts })
afterEach(() => { vi.restoreAllMocks(); native.created.length = 0; native.options.length = 0; native.supported = true })

it('sends every background kind to native and SSTP without an in-app toast', async () => {
  const ports = { native: vi.fn(), toast: vi.fn(), sstp: vi.fn().mockResolvedValue(undefined) }
  for (const notificationKind of NOTIFICATION_KINDS) await deliverNotification({ ...event, notificationKind }, settings(), ports)
  expect(ports.native).toHaveBeenCalledTimes(NOTIFICATION_KINDS.length)
  expect(ports.sstp).toHaveBeenCalledTimes(NOTIFICATION_KINDS.length)
  expect(ports.toast).not.toHaveBeenCalled()
})

it('keeps immediate errors in the app regardless of background notification preferences', async () => {
  const ports = { native: vi.fn(), toast: vi.fn(), sstp: vi.fn() }
  const error = { id: 'save', level: 'error' as const, message: 'Invalid value' }
  await deliverNotification(error, { ...settings(), notifyOnFailure: false }, ports)
  expect(ports.toast).toHaveBeenCalledWith(error)
  expect(ports.native).not.toHaveBeenCalled()
  expect(ports.sstp).not.toHaveBeenCalled()
})

it('respects event preferences and permits either delivery channel on its own', async () => {
  const ports = { native: vi.fn(), toast: vi.fn(), sstp: vi.fn().mockResolvedValue(undefined) }
  await deliverNotification(event, { ...settings(), notifyOnReview: false }, ports)
  for (const notificationKind of ['failure', 'reportFailure'] as const) await deliverNotification({ ...event, notificationKind }, { ...settings(), notifyOnFailure: false }, ports)
  expect(ports.native).not.toHaveBeenCalled()
  expect(ports.sstp).not.toHaveBeenCalled()
  await deliverNotification(event, { ...settings(), nativeNotifications: false }, ports)
  expect(ports.native).not.toHaveBeenCalled()
  expect(ports.sstp).toHaveBeenCalledOnce()
  await deliverNotification(event, { ...settings(), sstpEnabled: false }, ports)
  expect(ports.native).toHaveBeenCalledOnce()
  expect(ports.sstp).toHaveBeenCalledOnce()
})

it('contains delivery failures without producing another notification or interrupting the operation', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const ports = { native: vi.fn(() => { throw new Error('denied') }), toast: vi.fn(), sstp: vi.fn().mockRejectedValue(new Error('offline')) }
  await expect(deliverNotification(event, settings(), ports)).resolves.toBeUndefined()
  expect(ports.sstp).toHaveBeenCalledOnce()
  expect(ports.toast).not.toHaveBeenCalled()
  expect(warn).toHaveBeenCalledTimes(2)
})

it('shows the native notification without checking window focus and opens its task on click', () => {
  const open = vi.fn()
  showNativeNotification(event, 'Review', open)
  expect(native.options).toEqual([{ title: 'Review', body: 'Ready', silent: false }])
  expect(Reflect.get(native.created[0], 'show')).toHaveBeenCalledOnce()
  native.created[0].emit('click')
  expect(open).toHaveBeenCalledWith('task')
  native.supported = false
  showNativeNotification(event, 'Review', open)
  expect(native.created).toHaveLength(1)
})

it('chooses exactly one non-empty script of the matching kind and fills in speech variables once', () => {
  const scripts = { ...DEFAULT_SETTINGS.sstpScripts, review: ['', '  ', 'first {{taskTitle}}', 'second {{message}}'], failure: ['wrong kind'] }
  expect(selectSstpScript(scripts, event, 'Review', () => 0)).toBe('first Build')
  expect(selectSstpScript(scripts, event, 'Review', () => 0.99)).toBe('second Ready')
  expect(selectSstpScript(scripts, { ...event, notificationKind: 'followUp' }, 'Follow-up')).toBeNull()
  expect(renderSstpScript('{{type}}|{{title}}|{{message}}|{{detail}}|{{taskId}}|{{taskTitle}}|{{projectId}}|{{projectName}}|{{unknown}}', event, 'Review'))
    .toBe('review|Review|Ready||task|Build|project|Project|{{unknown}}')
  expect(renderSstpScript('\\0{{taskTitle}}\n{{detail}}\\e', { ...event, taskTitle: '\\![quit] %username {{message}}\r\nSender: other', detail: 'test\0' }, 'Review'))
    .toBe('\\0\\_u[0x5c]![quit] \\_u[0x25]username {{message}}\\nSender: other\\ntest\\e')
})

it('loads old settings with notification defaults and retains scripts through unrelated partial updates', async () => {
  const db = openDatabase(':memory:')
  try {
    repo.setSetting(db, 'app', JSON.stringify({ notifyOnReview: false }))
    const operations = new SettingsOperations(db)
    operations.load()
    expect(operations.getSettings()).toMatchObject({ nativeNotifications: true, sstpEnabled: false, sstpHost: '127.0.0.1', sstpPort: 9801 })
    const client = createRouterClient({ settings: { set: implement(contract.settings.set).handler(({ input }) => operations.setSettings(input)) } })
    await client.settings.set({ nativeNotifications: false, sstpEnabled: true, sstpScripts: settings().sstpScripts })
    await client.settings.set({ notifyOnReview: true })
    expect(repo.getAppSettings(db)).toMatchObject({ nativeNotifications: false, sstpEnabled: true, sstpScripts: settings().sstpScripts })
    for (const patch of [{ sstpHost: 'localhost\r\nSender: bad' }, { sstpPort: 0 }, { sstpPort: 65536 }, { sstpPort: 1.5 }]) {
      expect(() => operations.setSettings(patch)).toThrow()
      await expect(client.settings.set(patch)).rejects.toThrow()
    }
    expect(repo.getAppSettings(db).sstpPort).toBe(9801)
  } finally { db.close() }
})

describe('SSTP TCP transport', () => {
  let server: Server | undefined
  const sockets = new Set<Socket>()
  afterEach(async () => {
    for (const socket of sockets) socket.destroy()
    sockets.clear()
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
    server = undefined
  })
  async function listen(respond: (socket: Socket, request: string) => void): Promise<number> {
    server = createServer(socket => {
      sockets.add(socket)
      let request = ''
      socket.setEncoding('utf8')
      socket.on('data', (chunk: string) => { request += chunk; if (request.includes('\r\n\r\n')) respond(socket, request) })
    }).listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No TCP port')
    return address.port
  }
  it('writes UTF-8 SEND framing and accepts a fragmented response with a different version', async () => {
    let received = ''
    const port = await listen((socket, request) => {
      received = request
      socket.write('SSTP/1.1 200')
      setImmediate(() => socket.end(' OK\r\nCharset: UTF-8\r\n\r\n'))
    })
    await sendSstp('127.0.0.1', port, '\\0完了\n次の行\\e')
    expect(received).toBe('SEND SSTP/1.4\r\nCharset: UTF-8\r\nSender: Quuu\r\nScript: \\0完了\\n次の行\\e\r\nOption: notranslate\r\n\r\n')
  })
  it.each(['SSTP/1.4 500 Internal Server Error\r\n\r\n', 'HTTP/1.1 200 OK\r\n\r\n', 'SSTP/1.4 200 OK\r\n'])('rejects an error, wrong protocol or truncated response: %s', async response => {
    const port = await listen(socket => socket.end(response))
    await expect(sendSstp('127.0.0.1', port, 'test')).rejects.toThrow()
  })
  it('bounds a receiver that never answers', async () => {
    const port = await listen(() => undefined)
    await expect(sendSstp('127.0.0.1', port, 'test', 30)).rejects.toThrow('timed out')
  })
})
