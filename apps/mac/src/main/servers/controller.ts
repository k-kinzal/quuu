import { chmodSync, mkdirSync, renameSync, writeFileSync, unlinkSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import type { QuuuApp } from '../bootstrap.js'
import type { DesktopOperations } from '../api/host.js'
import type { AppSettings } from '../settings/types.js'
import { RemoteOperations } from './callers.js'
import { GrpcServer, tokenAccess } from './grpc.js'
import { HostBeacon, HostDiscovery, lanAddresses } from './lan.js'
import { SatelliteLink } from './satellite.js'
import { McpServer } from './mcp.js'
import { serverToken } from './authentication.js'

/**
 * Network lifetimes follow settings, independently of scheduler and window lifetimes. Emits
 * `satellite` (connected) whenever the windows should switch between the host's data and this
 * computer's own.
 */
export class ServerController extends EventEmitter {
  private readonly operations: RemoteOperations
  private readonly token: string
  private grpc: GrpcServer | null = null
  private mcp: McpServer | null = null
  private previous: Pick<AppSettings, 'httpEnabled' | 'httpPort' | 'mcpEnabled' | 'mcpPort'> | null = null
  private pending: Promise<void> = Promise.resolve()
  private closed = false
  private changeTimer: NodeJS.Timeout | null = null
  /** The listener other computers on the network reach while this Quuu hosts them. */
  private lan: { server: GrpcServer; beacon: HostBeacon; port: number } | null = null
  private following: { discovery: HostDiscovery; link: SatelliteLink } | null = null
  readonly connectionFile: string
  constructor(private app: QuuuApp, directory: string, desktop: () => DesktopOperations) {
    super()
    mkdirSync(directory, { recursive: true })
    this.token = serverToken(directory)
    this.connectionFile = join(directory, 'connections.json')
    app.settings.serverStatus.connectionFile = this.connectionFile
    this.operations = new RemoteOperations(app, desktop)
    app.settings.on('changed', this.changed)
    app.network.on('changed', this.networkChanged)
    app.network.on('revoked', this.revoked)
  }
  /** The host this satellite follows, while it follows one. */
  get satellite(): SatelliteLink | null { return this.following?.link ?? null }
  private networkChanged = (): void => { void this.configureNetwork() }
  private revoked = (device: string): void => { this.lan?.server.revoke(device) }
  private changed = (settings: AppSettings): void => {
    if (this.changeTimer) clearTimeout(this.changeTimer)
    // A client switching its own server off must receive the settings response first.
    this.changeTimer = setTimeout(() => { this.changeTimer = null; void this.configure(settings) }, 100)
  }
  configure(settings: AppSettings): Promise<void> {
    this.pending = this.pending.then(async () => {
      if (this.closed) return
      const status = this.app.settings.serverStatus
      if (!this.previous || settings.httpEnabled !== this.previous.httpEnabled || settings.httpPort !== this.previous.httpPort) {
        await this.grpc?.stop()
        this.grpc = null
        status.http = { enabled: settings.httpEnabled, url: null, error: null }
        if (settings.httpEnabled) {
          const server = new GrpcServer(this.operations, tokenAccess(this.token))
          try { status.http.url = `http://127.0.0.1:${await server.start(settings.httpPort)}`; this.grpc = server }
          catch (error) { await server.stop(); status.http.error = error instanceof Error ? error.message : String(error) }
        }
      }
      if (!this.previous || settings.mcpEnabled !== this.previous.mcpEnabled || settings.mcpPort !== this.previous.mcpPort) {
        await this.mcp?.stop()
        this.mcp = null
        status.mcp = { enabled: settings.mcpEnabled, url: null, error: null }
        if (settings.mcpEnabled) {
          const server = new McpServer(this.operations, this.token)
          try { status.mcp.url = await server.start(settings.mcpPort); this.mcp = server }
          catch (error) { await server.stop(); status.mcp.error = error instanceof Error ? error.message : String(error) }
        }
      }
      this.previous = settings
      const temporary = `${this.connectionFile}.tmp`
      writeFileSync(temporary, JSON.stringify({ version: 1, pid: process.pid, http: status.http.url, mcp: status.mcp.url, token: this.token }) + '\n', { mode: 0o600 })
      chmodSync(temporary, 0o600)
      renameSync(temporary, this.connectionFile)
    }).catch(error => { console.error('Cannot configure Quuu servers:', error) })
    return this.pending
  }
  /** Hosting and following, from `network.json`. Queued with the local listeners so restarts never overlap. */
  configureNetwork(): Promise<void> {
    this.pending = this.pending.then(async () => {
      if (this.closed) return
      const network = this.app.network
      const hosting = network.hosting()
      if (hosting?.port !== this.lan?.port || (hosting && !this.lan)) {
        await this.stopHosting()
        if (hosting) {
          const server = new GrpcServer(this.operations, { identify: header => network.authorize(header), pair: (code, name) => network.redeem(code, name) })
          const addresses = (): string[] => lanAddresses().map(entry => `${entry.address}:${hosting.port}`)
          const beacon = new HostBeacon(() => {
            // Wi-Fi changes addresses under a running host; each announcement reports the current ones.
            network.setHostRuntime({ addresses: addresses(), error: null })
            return { quuu: 1, id: hosting.id, name: network.hosting()?.name ?? hosting.name, port: hosting.port }
          })
          try {
            // Every interface: the computers it hosts are elsewhere on the network by definition.
            await server.start(hosting.port, '0.0.0.0')
            await beacon.start()
            this.lan = { server, beacon, port: hosting.port }
          } catch (error) {
            beacon.stop()
            await server.stop()
            network.setHostRuntime({ addresses: [], error: error instanceof Error ? error.message : String(error) })
          }
        }
      }
      const follows = network.status().satellite.enabled
      if (follows && !this.following) {
        const discovery = new HostDiscovery()
        await discovery.start()
        const link = new SatelliteLink(network, discovery)
        link.on('mode', (connected: boolean) => this.emit('satellite', connected))
        this.following = { discovery, link }
        link.start()
      } else if (!follows && this.following) {
        this.stopFollowing()
      } else void this.following?.link.probe()
    }).catch(error => { console.error('Cannot configure the Quuu network:', error) })
    return this.pending
  }
  private async stopHosting(): Promise<void> {
    const lan = this.lan
    this.lan = null
    this.app.network.setHostRuntime({ addresses: [], error: null })
    if (!lan) return
    lan.beacon.stop()
    await lan.server.stop()
  }
  private stopFollowing(): void {
    const following = this.following
    this.following = null
    following?.link.stop()
    following?.discovery.stop()
  }
  async stop(): Promise<void> {
    this.closed = true
    if (this.changeTimer) clearTimeout(this.changeTimer)
    this.app.settings.off('changed', this.changed)
    this.app.network.off('changed', this.networkChanged)
    this.app.network.off('revoked', this.revoked)
    await this.pending
    this.stopFollowing()
    await this.stopHosting()
    await Promise.all([this.grpc?.stop(), this.mcp?.stop()])
    this.operations.close()
    try { unlinkSync(this.connectionFile) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}
