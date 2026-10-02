import { once } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRouterClient } from '@orpc/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EVENTS } from '../src/api/channels.js'
import { QuuuHttpClient } from '../src/client/http.js'
import { QuuuApp } from '../src/main/bootstrap.js'
import { satelliteRoute, type ForwardedOperations } from '../src/main/api/host.js'
import { createOperationsRouter } from '../src/main/api/router.js'
import { t } from '../src/main/i18n/index.js'
import { ServerController } from '../src/main/servers/controller.js'
import { parseAnnouncement } from '../src/main/servers/lan.js'
import { pair } from '../src/main/servers/satellite.js'
import { NetworkOperations, normalizeAddress } from '../src/main/settings/network.js'
import { isolateSessionDirs } from './helpers.js'

async function freePort(): Promise<number> {
  const server = createServer().listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address() as { port: number }
  await new Promise<void>(resolve => server.close(() => resolve()))
  return address.port
}

async function until(check: () => boolean, ms = 20_000): Promise<void> {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out')
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

describe('network settings', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'quuu-network-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('trades a short-lived code for a credential that only it knows, and keeps the file private', () => {
    const network = new NetworkOperations(dir)
    network.configure({ hostEnabled: true })
    const code = network.openPairing().host.pairing!.code
    expect(code).toMatch(/^\d{6}$/)
    const grant = network.redeem(code, 'Laptop')
    expect(network.authorize(`Bearer ${grant.token}`)).toBe(network.status().host.devices[0].id)
    expect(network.authorize(`Bearer ${'0'.repeat(64)}`)).toBeNull()
    expect(network.status().host.pairing).toBeNull()
    expect(() => network.redeem(code, 'Another')).toThrow('Pairing is not open')
    expect(statSync(join(dir, 'network.json')).mode & 0o777).toBe(0o600)
    // The credential is stored only as a digest.
    expect(JSON.stringify(new NetworkOperations(dir).status())).not.toContain(grant.token)
    expect(new NetworkOperations(dir).authorize(`Bearer ${grant.token}`)).not.toBeNull()
  })

  it('closes pairing after a few wrong codes, so a code cannot be guessed by trying them all', () => {
    const network = new NetworkOperations(dir)
    network.configure({ hostEnabled: true })
    const code = network.openPairing().host.pairing!.code
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < 5; i++) expect(() => network.redeem(wrong, 'Guess')).toThrow('Wrong pairing code')
    expect(() => network.redeem(code, 'Late')).toThrow('Pairing is not open')
    expect(network.status().host.devices).toEqual([])
  })

  it('is a host or a satellite, never both', () => {
    const network = new NetworkOperations(dir)
    expect(network.configure({ hostEnabled: true }).satellite.enabled).toBe(false)
    const status = network.configure({ satelliteEnabled: true })
    expect(status.host.enabled).toBe(false)
    expect(status.satellite.state).toBe('unpaired')
  })

  it('reads a host address with or without a port, and ignores stray announcements', () => {
    expect(normalizeAddress('192.168.1.20')).toBe('192.168.1.20:47810')
    expect(normalizeAddress(' http://studio.local:5000/ ')).toBe('studio.local:5000')
    expect(normalizeAddress('not an address')).toBeNull()
    expect(parseAnnouncement(Buffer.from(JSON.stringify({ quuu: 1, id: 'h', name: 'Studio', port: 47810 })), '10.0.0.2')).toEqual({ id: 'h', name: 'Studio', address: '10.0.0.2:47810' })
    expect(parseAnnouncement(Buffer.from('hello'), '10.0.0.2')).toBeNull()
  })
})

it('answers a satellite window\'s desktop and network operations here, and refuses what would open on the host\'s screen', () => {
  expect(satelliteRoute('tasks.create')).toBe('host')
  expect(satelliteRoute('settings.set')).toBe('host')
  expect(satelliteRoute('terminal.open')).toBe('host')
  expect(satelliteRoute('system.savePromptFiles')).toBe('host')
  expect(satelliteRoute('system.confirm')).toBe('here')
  expect(satelliteRoute('network.pair')).toBe('here')
  expect(satelliteRoute('app.info')).toBe('here')
  expect(satelliteRoute('open.editor')).toBe('unavailable')
  expect(satelliteRoute('report.show')).toBe('unavailable')
})

describe('a host and its satellite', () => {
  let dir: string, host: QuuuApp, satellite: QuuuApp, hostServers: ServerController, satelliteServers: ServerController, port: number
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'quuu-lan-'))
    isolateSessionDirs(dir)
    for (const side of ['host', 'satellite']) mkdirSync(join(dir, side))
    host = new QuuuApp(join(dir, 'host', 'taskd.db'))
    satellite = new QuuuApp(join(dir, 'satellite', 'taskd.db'))
    host.scheduler.pause()
    satellite.scheduler.pause()
    const desktop = (): never => { throw new Error('No desktop in this test') }
    hostServers = new ServerController(host, join(dir, 'host'), desktop)
    satelliteServers = new ServerController(satellite, join(dir, 'satellite'), desktop)
    satellite.network.setPairer(pair)
    port = await freePort()
    host.network.configure({ hostEnabled: true, hostPort: port })
    await hostServers.configureNetwork()
  })
  afterEach(async () => {
    await satelliteServers?.stop()
    await hostServers?.stop()
    for (const app of [host, satellite]) { app.shutdown(); app.db.close() }
    rmSync(dir, { recursive: true, force: true })
  })

  it('pairs with the host\'s code, then shows and changes the host\'s data through the same operations', async () => {
    expect(host.network.status().host.addresses.every(address => address.endsWith(`:${port}`))).toBe(true)
    await expect(satellite.network.pair(`127.0.0.1:${port}`, '000000')).rejects.toThrow(t('network.pairingClosed'))
    const code = host.network.openPairing().host.pairing!.code
    await satellite.network.pair(`127.0.0.1:${port}`, code)
    expect(host.network.status().host.devices).toHaveLength(1)
    expect(satellite.network.status().satellite).toMatchObject({ enabled: true, host: { name: host.network.status().host.name, address: `127.0.0.1:${port}` } })

    const modes: boolean[] = []
    satelliteServers.on('satellite', (connected: boolean) => modes.push(connected))
    await satelliteServers.configureNetwork()
    await until(() => modes.includes(true))
    expect(satellite.network.status().satellite.state).toBe('connected')

    // A window of the satellite: its operations go to the host, its own settings stay here.
    const events: Array<{ name: string; payload: unknown }> = []
    const opened: { session: (ForwardedOperations & { close(): void }) | null } = { session: null }
    const owner = {}
    const router = createOperationsRouter<object>(satellite, {
      authorize: () => undefined,
      callerOf: () => ({ kind: 'window' }),
      releaseWithOwner: () => () => undefined,
      sendEvent: () => undefined,
      desktopFor: () => { throw new Error('No desktop in this test') },
      forwardFor: () => opened.session ??= satelliteServers.satellite!.session((name, payload) => events.push({ name, payload })),
    })
    const window = createRouterClient(router, { context: { owner } })
    try {
      const project = await window.projects.create({ name: 'Shared', path: dir })
      expect(host.projects.listProjects().map(p => p.id)).toContain(project.id)
      expect(satellite.projects.listProjects().map(p => p.id)).not.toContain(project.id)
      expect((await window.snapshot()).projects.map(p => p.id)).toContain(project.id)
      expect((await window.network.status()).satellite.state).toBe('connected')
      await expect(window.open.editor({ target: { kind: 'project', id: project.id } })).rejects.toMatchObject({ data: { reason: t('network.onHost') } })

      // What changes on the host reaches the satellite's window without another read.
      host.tasks.createTask({ projectId: project.id, title: 'from the host' })
      await until(() => events.some(event => event.name === EVENTS.snapshot && JSON.stringify(event.payload).includes('from the host')))
    } finally { opened.session?.close() }

    // Removing the computer ends its access; the satellite falls back to its own data.
    host.network.removeDevice(host.network.status().host.devices[0].id)
    await until(() => modes.at(-1) === false)
    expect(satellite.network.status().satellite).toMatchObject({ state: 'searching', error: t('network.notPaired') })
  }, 30_000)

  it('rejects credentials it never issued and a wrong code', async () => {
    const stranger = new QuuuHttpClient(`http://127.0.0.1:${port}`, 'f'.repeat(64))
    await expect(stranger.api.projects.list()).rejects.toMatchObject({ code: 16 })
    await stranger.close().catch(() => undefined)
    const code = host.network.openPairing().host.pairing!.code
    await expect(satellite.network.pair(`127.0.0.1:${port}`, code === '123456' ? '654321' : '123456')).rejects.toThrow(t('network.wrongCode'))
    expect(host.network.status().host.devices).toEqual([])
  })
})
