import { autoUpdater } from 'electron'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppUpdates, RELEASES_URL } from '../src/main/desktop/appUpdates.js'

const mocks = vi.hoisted(() => ({
  feed: vi.fn(), check: vi.fn(), install: vi.fn(),
  signed: vi.fn<() => Promise<boolean>>(),
  dialog: vi.fn<() => Promise<{ response: number }>>(),
  open: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    app: { getPath: () => '/Applications/Quuu.app/Contents/MacOS/Quuu' },
    autoUpdater: Object.assign(new EventEmitter(), {
      setFeedURL: mocks.feed, checkForUpdates: mocks.check, quitAndInstall: mocks.install
    }),
    dialog: { showMessageBox: mocks.dialog },
    shell: { openExternal: mocks.open }
  }
})
vi.mock('../src/main/updates/signing.js', () => ({ isSignedForUpdates: mocks.signed }))

const menu = vi.fn()
const quit = vi.fn()
let updates: AppUpdates
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.signed.mockResolvedValue(true)
  mocks.dialog.mockResolvedValue({ response: 1 })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  updates = new AppUpdates(menu, quit)
})
afterEach(() => {
  updates.stop()
  autoUpdater.removeAllListeners()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('uses the running architecture and checks at startup and every six hours', async () => {
  await updates.start()
  expect(mocks.feed).toHaveBeenCalledWith({
    url: `${RELEASES_URL}/latest/download/RELEASES-${process.arch}.json`, serverType: 'json'
  })
  expect(mocks.check).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(30_000)
  expect(mocks.check).toHaveBeenCalledTimes(1)
  autoUpdater.emit('update-not-available')
  expect(mocks.dialog).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000 - 30_000)
  expect(mocks.check).toHaveBeenCalledTimes(2)
})

it('never starts a second check or download while the native updater is busy', async () => {
  await updates.start()
  updates.check(true)
  updates.check(true)
  autoUpdater.emit('update-available')
  updates.check(true)
  await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000)
  expect(mocks.check).toHaveBeenCalledTimes(1)
  expect(menu).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }))
})

it('reports a manual no-update result and allows another check', async () => {
  await updates.start()
  updates.check(true)
  autoUpdater.emit('update-not-available')
  await Promise.resolve()
  expect(mocks.dialog).toHaveBeenCalledWith(expect.objectContaining({ message: 'No newer automatic update is available.' }))
  updates.check(true)
  expect(mocks.check).toHaveBeenCalledTimes(2)
})

it('keeps background failures quiet and recovers for a manual retry', async () => {
  await updates.start()
  updates.check()
  autoUpdater.emit('error', new Error('offline'))
  expect(mocks.dialog).not.toHaveBeenCalled()
  updates.check(true)
  autoUpdater.emit('error', new Error('feed missing'))
  await Promise.resolve()
  expect(mocks.dialog).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }))
  updates.check(true)
  expect(mocks.check).toHaveBeenCalledTimes(3)
})

it('lets the user defer installation and restart later from the menu', async () => {
  await updates.start()
  autoUpdater.emit('update-downloaded')
  await Promise.resolve()
  expect(quit).not.toHaveBeenCalled()
  expect(updates.installAfterShutdown()).toBe(false)
  expect(menu).toHaveBeenLastCalledWith(expect.objectContaining({ label: 'Restart to Update', enabled: true }))
  mocks.dialog.mockResolvedValueOnce({ response: 0 })
  updates.check(true)
  await Promise.resolve()
  expect(quit).toHaveBeenCalledOnce()
  expect(mocks.install).not.toHaveBeenCalled()
  updates.stop()
  expect(updates.installAfterShutdown()).toBe(true)
  expect(mocks.install).toHaveBeenCalledOnce()
})

it('does not quit or show late update events after shutdown starts', async () => {
  let answer!: (result: { response: number }) => void
  mocks.dialog.mockReturnValueOnce(new Promise(resolve => { answer = resolve }))
  await updates.start()
  autoUpdater.emit('update-downloaded')
  updates.stop()
  answer({ response: 0 })
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000)
  autoUpdater.emit('error', new Error('late error'))
  autoUpdater.emit('update-downloaded')
  expect(mocks.check).not.toHaveBeenCalled()
  expect(mocks.dialog).toHaveBeenCalledOnce()
  expect(quit).not.toHaveBeenCalled()
})

it('offers manual downloads without initializing updates on an ad-hoc Release', async () => {
  mocks.signed.mockResolvedValueOnce(false)
  await updates.start()
  await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000)
  expect(mocks.feed).not.toHaveBeenCalled()
  expect(mocks.check).not.toHaveBeenCalled()
  mocks.dialog.mockResolvedValueOnce({ response: 0 })
  updates.check(true)
  await Promise.resolve()
  expect(mocks.open).toHaveBeenCalledWith(RELEASES_URL)
})

it('does not initialize updates when quitting during the signature check', async () => {
  let answer!: (signed: boolean) => void
  mocks.signed.mockReturnValueOnce(new Promise(resolve => { answer = resolve }))
  const starting = updates.start()
  updates.stop()
  answer(true)
  await starting
  expect(mocks.feed).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('reports where it is to callers other than the menu', async () => {
  expect(updates.status()).toBe('starting')
  await updates.start()
  expect(updates.status()).toBe('idle')
  updates.check(true)
  expect(updates.status()).toBe('checking')
})
