import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { t } from '../i18n/index.js'

/** Fixed rather than automatic, so a host typed in by hand stays where it was typed. */
export const DEFAULT_HOST_PORT = 47810
const PAIRING_MS = 5 * 60_000
const PAIRING_ATTEMPTS = 5

/** A Quuu on the network as far as this one has heard: `address` is `host:port`. */
export interface NetworkPeer { id: string; name: string; address: string }
export type SatelliteState = 'off' | 'unpaired' | 'searching' | 'connected'
export interface NetworkConfig { hostEnabled?: boolean; hostPort?: number; satelliteEnabled?: boolean }
export interface NetworkStatus {
  host: {
    enabled: boolean; port: number; name: string; addresses: string[]; error: string | null
    pairing: { code: string; expiresAt: string } | null
    devices: Array<{ id: string; name: string; pairedAt: string }>
  }
  satellite: { enabled: boolean; host: NetworkPeer | null; state: SatelliteState; error: string | null; discovered: NetworkPeer[] }
}
interface Device { id: string; name: string; tokenHash: string; pairedAt: string }
/** What a satellite keeps to reach its host. The token never leaves this file and the servers. */
export interface SatelliteHost extends NetworkPeer { token: string }
interface Stored {
  version: 1
  /** This Quuu's identity as a host, so its satellites recognise it at a new address. */
  id: string
  host: { enabled: boolean; port: number; devices: Device[] }
  satellite: { enabled: boolean; host: SatelliteHost | null }
}
export interface PairingGrant { token: string; hostId: string; hostName: string }
export type Pairer = (address: string, code: string, deviceName: string) => Promise<PairingGrant>

/** Refusals a host gives a pairing computer; each side words them in its own language. */
export class PairingRefused extends Error {
  constructor(readonly reason: 'closed' | 'wrongCode') { super(reason === 'closed' ? 'Pairing is not open' : 'Wrong pairing code') }
}

const hash = (token: string): string => createHash('sha256').update(token).digest('hex')

export function computerName(): string {
  return hostname().replace(/\.local$/i, '')
}

/**
 * This computer's place among the Quuu on its network: whether it hosts other computers, and
 * which host it follows. Kept beside the database, not in the app settings, because a
 * satellite's settings screen shows its host's settings; these must stay this computer's own.
 * Listeners, discovery and forwarding live in `servers/`; this owns what they are told to do.
 */
export class NetworkOperations extends EventEmitter {
  private stored: Stored | null = null
  private pairing: { code: string; expiresAt: number; failures: number } | null = null
  private pairer: Pairer | null = null
  private hostRuntime: { addresses: string[]; error: string | null } = { addresses: [], error: null }
  private satelliteRuntime: { state: SatelliteState; error: string | null; discovered: NetworkPeer[] } = { state: 'off', error: null, discovered: [] }
  constructor(private directory: string) { super() }

  private get file(): string { return join(this.directory, 'network.json') }
  private get value(): Stored {
    if (this.stored) return this.stored
    let stored: Stored | null = null
    try { stored = JSON.parse(readFileSync(this.file, 'utf8')) as Stored }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Cannot read network settings; starting from defaults', error) }
    this.stored = stored?.version === 1 ? stored : { version: 1, id: randomUUID(), host: { enabled: false, port: DEFAULT_HOST_PORT, devices: [] }, satellite: { enabled: false, host: null } }
    return this.stored
  }
  private save(): void {
    mkdirSync(this.directory, { recursive: true })
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, JSON.stringify(this.value, null, 2) + '\n', { mode: 0o600 })
    chmodSync(temporary, 0o600)
    renameSync(temporary, this.file)
    this.emit('changed')
  }

  status(): NetworkStatus {
    const { host, satellite } = this.value
    if (this.pairing && this.pairing.expiresAt <= Date.now()) this.pairing = null
    return {
      host: {
        enabled: host.enabled, port: host.port, name: computerName(),
        addresses: host.enabled ? this.hostRuntime.addresses : [], error: host.enabled ? this.hostRuntime.error : null,
        pairing: host.enabled && this.pairing ? { code: this.pairing.code, expiresAt: new Date(this.pairing.expiresAt).toISOString() } : null,
        devices: host.devices.map(({ id, name, pairedAt }) => ({ id, name, pairedAt }))
      },
      satellite: {
        enabled: satellite.enabled,
        host: satellite.host ? { id: satellite.host.id, name: satellite.host.name, address: satellite.host.address } : null,
        state: !satellite.enabled ? 'off' : !satellite.host ? 'unpaired' : this.satelliteRuntime.state === 'connected' ? 'connected' : 'searching',
        error: satellite.enabled ? this.satelliteRuntime.error : null,
        discovered: this.satelliteRuntime.discovered
      }
    }
  }
  /** The listener's view of hosting; `null` when this computer does not host. */
  hosting(): { id: string; name: string; port: number } | null {
    const { id, host } = this.value
    return host.enabled ? { id, name: computerName(), port: host.port } : null
  }
  /** The host a satellite follows, with its credential; `null` when it follows none. */
  following(): SatelliteHost | null {
    const { satellite } = this.value
    return satellite.enabled ? satellite.host : null
  }

  configure(patch: NetworkConfig): NetworkStatus {
    const value = this.value
    if (patch.hostPort !== undefined) {
      if (!Number.isInteger(patch.hostPort) || patch.hostPort < 1 || patch.hostPort > 65535) throw new Error('Port must be between 1 and 65535')
      value.host.port = patch.hostPort
    }
    // Hosting while following another host would chain windows through two computers.
    if (patch.hostEnabled !== undefined) {
      value.host.enabled = patch.hostEnabled
      if (patch.hostEnabled) value.satellite.enabled = false
    }
    if (patch.satelliteEnabled !== undefined) {
      value.satellite.enabled = patch.satelliteEnabled
      if (patch.satelliteEnabled) value.host.enabled = false
    }
    if (!value.host.enabled) this.pairing = null
    this.save()
    return this.status()
  }

  // --- Host ---

  openPairing(): NetworkStatus {
    if (!this.value.host.enabled) throw new Error('Turn on hosting before pairing a computer')
    this.pairing = { code: String(randomInt(0, 1_000_000)).padStart(6, '0'), expiresAt: Date.now() + PAIRING_MS, failures: 0 }
    return this.status()
  }
  /** Trades the code on the host's screen for a credential only that computer holds. */
  redeem(code: string, deviceName: string): PairingGrant {
    const pairing = this.pairing
    if (!this.value.host.enabled || !pairing || pairing.expiresAt <= Date.now()) { this.pairing = null; throw new PairingRefused('closed') }
    const expected = Buffer.from(pairing.code), actual = Buffer.from(code)
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      // Guessing is bounded per code: a million codes, a handful of tries, then a new code on screen.
      if (++pairing.failures >= PAIRING_ATTEMPTS) this.pairing = null
      throw new PairingRefused('wrongCode')
    }
    this.pairing = null
    const token = randomBytes(32).toString('hex')
    this.value.host.devices.push({ id: randomUUID(), name: deviceName.trim().slice(0, 100) || 'Computer', tokenHash: hash(token), pairedAt: new Date().toISOString() })
    this.save()
    return { token, hostId: this.value.id, hostName: computerName() }
  }
  /** The paired computer a bearer credential belongs to, if any. */
  authorize(header: string | null | undefined): string | null {
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
    if (!/^[a-f0-9]{64}$/.test(token)) return null
    const actual = Buffer.from(hash(token))
    return this.value.host.devices.find(device => timingSafeEqual(Buffer.from(device.tokenHash), actual))?.id ?? null
  }
  removeDevice(id: string): NetworkStatus {
    const devices = this.value.host.devices
    if (!devices.some(device => device.id === id)) throw new Error(`Paired computer not found: ${id}`)
    this.value.host.devices = devices.filter(device => device.id !== id)
    this.save()
    this.emit('revoked', id)
    return this.status()
  }
  setHostRuntime(runtime: { addresses: string[]; error: string | null }): void { this.hostRuntime = runtime }

  // --- Satellite ---

  setPairer(pairer: Pairer | null): void { this.pairer = pairer }
  async pair(address: string, code: string): Promise<NetworkStatus> {
    const target = normalizeAddress(address)
    if (!target) throw new Error(t('network.badAddress'))
    if (!this.pairer) throw new Error('Pairing is unavailable until the network starts')
    let grant: PairingGrant
    try { grant = await this.pairer(target, code, computerName()) }
    catch (error) {
      if (error instanceof PairingRefused) throw new Error(t(error.reason === 'closed' ? 'network.pairingClosed' : 'network.wrongCode'), { cause: error })
      throw new Error(t('network.unreachable', { address: target }), { cause: error })
    }
    const value = this.value
    value.satellite = { enabled: true, host: { id: grant.hostId, name: grant.hostName, address: target, token: grant.token } }
    value.host.enabled = false
    this.pairing = null
    this.save()
    return this.status()
  }
  unpair(): NetworkStatus {
    this.value.satellite.host = null
    this.save()
    return this.status()
  }
  /** A host that answers from a new address keeps its satellites; they follow it there. */
  moveHost(address: string): void {
    const host = this.value.satellite.host
    if (!host || host.address === address) return
    host.address = address
    this.save()
  }
  setSatelliteRuntime(runtime: { state: 'searching' | 'connected'; error: string | null; discovered: NetworkPeer[] }): void { this.satelliteRuntime = runtime }
}

/** `host:port`, with the host's default port when none is given. IPv6 hosts are bracketed. */
export function normalizeAddress(input: string): string | null {
  const text = input.trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '')
  const match = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(text)
  if (!match) return null
  const port = match[2] ? Number(match[2]) : DEFAULT_HOST_PORT
  if (port < 1 || port > 65535) return null
  return `${match[1]}:${port}`
}
