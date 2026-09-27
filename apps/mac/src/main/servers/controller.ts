import { chmodSync, mkdirSync, renameSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { QuuuApp } from '../bootstrap.js'
import type { DesktopOperations } from '../api/host.js'
import type { AppSettings } from '../settings/types.js'
import { RemoteOperations } from './callers.js'
import { GrpcServer } from './grpc.js'
import { McpServer } from './mcp.js'
import { serverToken } from './authentication.js'

/** Network lifetimes follow settings, independently of scheduler and window lifetimes. */
export class ServerController {
  private readonly operations: RemoteOperations
  private readonly token: string
  private grpc: GrpcServer | null = null
  private mcp: McpServer | null = null
  private previous: Pick<AppSettings, 'httpEnabled' | 'httpPort' | 'mcpEnabled' | 'mcpPort'> | null = null
  private pending: Promise<void> = Promise.resolve()
  private closed = false
  private changeTimer: NodeJS.Timeout | null = null
  readonly connectionFile: string
  constructor(private app: QuuuApp, directory: string, desktop: () => DesktopOperations) {
    mkdirSync(directory, { recursive: true })
    this.token = serverToken(directory)
    this.connectionFile = join(directory, 'connections.json')
    app.settings.serverStatus.connectionFile = this.connectionFile
    this.operations = new RemoteOperations(app, desktop)
    app.settings.on('changed', this.changed)
  }
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
          const server = new GrpcServer(this.operations, this.token)
          try { status.http.url = await server.start(settings.httpPort); this.grpc = server }
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
  async stop(): Promise<void> {
    this.closed = true
    if (this.changeTimer) clearTimeout(this.changeTimer)
    this.app.settings.off('changed', this.changed)
    await this.pending
    await Promise.all([this.grpc?.stop(), this.mcp?.stop()])
    this.operations.close()
    try { unlinkSync(this.connectionFile) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}
