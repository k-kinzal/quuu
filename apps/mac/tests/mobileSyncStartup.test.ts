import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate as yieldToApp } from 'node:timers/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuuuApp } from '../src/main/bootstrap.js'
import { SyncFolder } from '../src/main/mobile-sync/folder.js'
import { SyncImporter } from '../src/main/mobile-sync/importIntent.js'
import { SyncExporter } from '../src/main/mobile-sync/exportSnapshot.js'
import { AppPublisher } from '../src/main/mobile-sync/appPublisher.js'
import { LAYOUT, detailPath } from '../src/main/mobile-sync/layout.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { isolateSessionDirs, releaseSessionDirs } from './helpers.js'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: vi.fn(actual.readFile) }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}

let dir: string
let app: QuuuApp
let folder: SyncFolder
let taskId: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'quuu-cloud-startup-'))
  vi.stubEnv('QUUU_USER_DATA', dir)
  vi.stubEnv('QUUU_MOBILE_SYNC_DIR', join(dir, 'cloud'))
  isolateSessionDirs(dir)
  app = new QuuuApp(':memory:')
  app.scheduler.pause()
  folder = new SyncFolder(join(dir, 'cloud'))
  const project = app.projects.createProject({ name: 'Fixture', path: dir })
  taskId = app.tasks.createTask({ projectId: project.id, title: 'Before', status: 'held' }).id
})
afterEach(() => {
  app.shutdown()
  if (app.db.isOpen) app.db.close()
  releaseSessionDirs()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.mocked(readFile).mockReset()
  rmSync(dir, { recursive: true, force: true })
})

it('keeps startup responsive during an iCloud download and stops before touching a closed database', async () => {
  const cloud = deferred<string>()
  vi.mocked(readFile).mockReturnValueOnce(cloud.promise)
  app.mobile.configure({ ...DEFAULT_SETTINGS, mobileSyncEnabled: true }, false)
  const work = app.mobile.exportNow()
  await yieldToApp()
  expect(readFile).toHaveBeenCalledTimes(1)
  expect(existsSync(folder.path(LAYOUT.snapshot))).toBe(false)
  expect(app.snapshot().tasks.find(task => task.id === taskId)?.title).toBe('Before')
  app.shutdown()
  app.db.close()
  cloud.resolve('')
  await work
  expect(existsSync(folder.path(LAYOUT.snapshot))).toBe(false)
})

it('coalesces exports during a download and follows up with changes made while it waited', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(readFile).mockImplementation(actual.readFile)
  const cloud = deferred<string>()
  vi.mocked(readFile).mockReturnValueOnce(cloud.promise)
  app.mobile.configure({ ...DEFAULT_SETTINGS, mobileSyncEnabled: true }, false)
  const first = app.mobile.exportNow()
  await yieldToApp()
  app.tasks.updateTask(taskId, { title: 'After' })
  expect(app.mobile.exportNow()).toBe(first)
  expect(readFile).toHaveBeenCalledTimes(1)
  cloud.resolve('')
  await first
  await vi.waitFor(() => {
    const snapshot = JSON.parse(readFileSync(folder.path(LAYOUT.snapshot), 'utf8')) as { tasks: { id: string; title: string }[] }
    expect(snapshot.tasks.find(task => task.id === taskId)?.title).toBe('After')
  })
})

it('does not apply a phone request that finishes downloading after shutdown', async () => {
  const cloud = deferred<string>()
  vi.mocked(readFile).mockReturnValueOnce(cloud.promise)
  folder.ensure()
  folder.write(`${LAYOUT.intents}/request.json`, '{}')
  const update = vi.spyOn(app.tasks, 'updateTask')
  const work = new SyncImporter(app.db).sync(folder, app.tasks)
  app.shutdown()
  app.db.close()
  cloud.resolve(JSON.stringify({ version: 1, id: 'request', device: 'phone', seq: 1,
    createdAt: new Date().toISOString(), baseRev: 1, expect: null,
    op: { kind: 'task.edit', taskId, title: 'Must not apply' } }))
  expect((await work).applied).toBe(0)
  expect(update).not.toHaveBeenCalled()
})

it('does not publish an app after sync was disabled during a manifest download', async () => {
  const cloud = deferred<string>()
  vi.mocked(readFile).mockReturnValueOnce(cloud.promise)
  const source = join(dir, 'web')
  mkdirSync(source)
  writeFileSync(join(source, 'index.html'), '<html>Fixture</html>')
  let active = true
  const work = new AppPublisher().publish(folder, source, () => active)
  await yieldToApp()
  active = false
  cloud.resolve('')
  await expect(work).rejects.toThrow('Mobile publication stopped')
  expect(existsSync(folder.path(LAYOUT.appManifest))).toBe(false)
})

it('retries a failed detail write instead of caching an export that never reached iCloud', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(readFile).mockImplementation(actual.readFile)
  const exporter = new SyncExporter(app.db)
  await exporter.export(folder, false)
  app.tasks.updateTask(taskId, { title: 'After' })
  const write = vi.spyOn(folder, 'write').mockImplementationOnce(() => { throw new Error('iCloud unavailable') })
  await expect(exporter.export(folder, false)).rejects.toThrow('iCloud unavailable')
  write.mockRestore()
  await exporter.export(folder, false)
  expect(JSON.parse(readFileSync(folder.path(detailPath(taskId)), 'utf8')) as unknown).toMatchObject({ title: 'After' })
})
