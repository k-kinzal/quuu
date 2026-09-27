import { EventEmitter } from 'node:events'
import type { JsonValue } from '@bufbuild/protobuf'
import { Code, ConnectError, createClient } from '@connectrpc/connect'
import { createGrpcTransport, Http2SessionManager } from '@connectrpc/connect-node'
import { Quuu } from '../../api/generated/quuu_pb.js'
import { QuuuHttpClient } from '../../client/http.js'
import { PairingRefused, type NetworkOperations, type PairingGrant, type SatelliteHost } from '../settings/network.js'
import { t } from '../i18n/index.js'
import type { HostDiscovery } from './lan.js'

const PROBE_MS = 3_000
const PROBE_TIMEOUT_MS = 2_500
/** Missed answers before the window gives the host up; one dropped packet should not reload it. */
const LOST_AFTER = 2

/** Trades a host's on-screen code for this computer's credential, over the host's network listener. */
export async function pair(address: string, code: string, deviceName: string): Promise<PairingGrant> {
  const url = `http://${address}`
  const session = new Http2SessionManager(url)
  try {
    const client = createClient(Quuu, createGrpcTransport({ baseUrl: url, sessionManager: session }))
    const grant = await client.pair({ code, deviceName }, { timeoutMs: 10_000 })
    return { token: grant.token, hostId: grant.hostId, hostName: grant.hostName }
  } catch (error) {
    if (error instanceof ConnectError && error.code === Code.FailedPrecondition) throw new PairingRefused('closed')
    if (error instanceof ConnectError && error.code === Code.PermissionDenied) throw new PairingRefused('wrongCode')
    throw error
  } finally { session.abort() }
}

/**
 * One window's view of the host: its own caller there, so conversations and terminals it opens
 * belong to that window alone, and the host's notifications for it.
 */
export class HostSession {
  private readonly client: QuuuHttpClient
  private readonly abort = new AbortController()
  private readonly ready: Promise<void>
  constructor(url: string, token: string, deliver: (name: string, payload: JsonValue) => void, lost: () => void) {
    this.client = new QuuuHttpClient(url, token)
    this.ready = new Promise<void>((resolve, reject) => {
      void (async () => {
        // Watching before the first read, so nothing that changes in between goes unseen.
        for await (const event of this.client.watch(this.abort.signal)) {
          if (event.name === 'quuu.ready') resolve()
          else deliver(event.name, event.payload)
        }
        throw new Error('The host closed its event stream')
      })().catch((error: unknown) => {
        reject(error instanceof Error ? error : new Error(String(error)))
        if (!this.abort.signal.aborted) lost()
      })
    })
    // A window closed before the host answered has nobody left to tell.
    this.ready.catch(() => undefined)
  }
  async call(name: string, input: unknown): Promise<unknown> {
    try {
      await this.ready
      return await this.client.call(name, input)
    } catch (error) {
      // The window shows the host's reason, not the transport's framing of it.
      throw new Error(error instanceof ConnectError ? error.rawMessage : error instanceof Error ? error.message : String(error), { cause: error })
    }
  }
  close(): void {
    this.abort.abort()
    void this.client.close().catch(() => undefined)
  }
}

/**
 * A satellite following its host. `connected` flips only after the host answers, or after it has
 * missed several answers in a row; each flip emits `mode`, and the windows reload onto the other
 * side's data.
 */
export class SatelliteLink extends EventEmitter {
  connected = false
  private target: { host: SatelliteHost; url: string } | null = null
  private monitor: { url: string; token: string; client: QuuuHttpClient } | null = null
  private misses = 0
  private timer: NodeJS.Timeout | null = null
  private probing: Promise<void> | null = null
  private stopped = false
  private failure: string | null = null
  constructor(private network: NetworkOperations, private discovery: HostDiscovery) {
    super()
    discovery.on('changed', this.discovered)
  }
  start(): void {
    this.timer = setInterval(() => void this.probe(), PROBE_MS)
    this.timer.unref()
    void this.probe()
  }
  /** The host and credential sessions open against; null while the host is not answering. */
  session(deliver: (name: string, payload: JsonValue) => void): HostSession | null {
    if (!this.connected || !this.target) return null
    return new HostSession(this.target.url, this.target.host.token, deliver, () => void this.probe())
  }
  /** Looks again now, e.g. after pairing or a session losing the host. */
  probe(): Promise<void> {
    this.probing ??= this.check().finally(() => { this.probing = null })
    return this.probing
  }
  private discovered = (): void => {
    this.report()
    const host = this.network.following()
    const heard = host ? this.discovery.find(host.id) : null
    if (heard && (!this.connected || heard.address !== this.target?.host.address)) void this.probe()
  }
  private async check(): Promise<void> {
    if (this.stopped) return
    const host = this.network.following()
    if (!host) { this.target = null; this.setConnected(false, null); return }
    const heard = this.discovery.find(host.id)?.address
    let failure: string | null = null
    // The address the host announces now first, then the one it was last reached at.
    for (const address of [...new Set([heard, host.address].filter((value): value is string => !!value))]) {
      const url = `http://${address}`
      if (!this.monitor || this.monitor.url !== url || this.monitor.token !== host.token) {
        void this.monitor?.client.close().catch(() => undefined)
        this.monitor = { url, token: host.token, client: new QuuuHttpClient(url, host.token) }
      }
      try {
        // Answered by every Quuu, desktop or not, and cheap enough to ask every few seconds.
        await this.monitor.client.call('network.status', undefined, AbortSignal.timeout(PROBE_TIMEOUT_MS))
        if (this.stopped) return
        this.network.moveHost(address)
        const moved = this.connected && (this.target?.url !== url || this.target.host.token !== host.token)
        this.target = { host: { ...host, address }, url }
        this.misses = 0
        // Windows showing the host at its old address, or with an old credential, reopen with the new one.
        if (moved) this.emit('mode', true)
        this.setConnected(true, null)
        return
      } catch (error) {
        void this.monitor?.client.close().catch(() => undefined)
        this.monitor = null
        failure = error instanceof ConnectError && error.code === Code.Unauthenticated ? t('network.notPaired') : t('network.unreachable', { address })
      }
    }
    if (this.connected && ++this.misses < LOST_AFTER) return
    this.target = null
    this.setConnected(false, failure)
  }
  private setConnected(connected: boolean, error: string | null): void {
    this.failure = error
    const changed = connected !== this.connected
    this.connected = connected
    this.report()
    if (changed) this.emit('mode', connected)
  }
  private report(): void {
    this.network.setSatelliteRuntime({ state: this.connected ? 'connected' : 'searching', error: this.connected ? null : this.failure, discovered: this.discovery.hosts() })
  }
  stop(): void {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.discovery.off('changed', this.discovered)
    void this.monitor?.client.close().catch(() => undefined)
    this.monitor = null
    this.target = null
    const connected = this.connected
    this.connected = false
    this.failure = null
    this.report()
    if (connected) this.emit('mode', false)
  }
}
