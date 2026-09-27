import { createSocket, type Socket } from 'node:dgram'
import { EventEmitter, once } from 'node:events'
import { networkInterfaces } from 'node:os'
import type { NetworkPeer } from '../settings/network.js'

/** Where hosts announce themselves. One above the default host port, so a firewall rule can name both. */
export const BEACON_PORT = 47811
const ANNOUNCE_MS = 2_000
/** A host missing this many announcements has left the network. */
const FORGET_MS = 7_000

interface Announcement { quuu: 1; id: string; name: string; port: number }

export function parseAnnouncement(message: Buffer, from: string): NetworkPeer | null {
  try {
    const value = JSON.parse(message.toString('utf8')) as Partial<Announcement>
    if (value.quuu !== 1 || typeof value.id !== 'string' || typeof value.name !== 'string' || !Number.isInteger(value.port)) return null
    return { id: value.id.slice(0, 64), name: value.name.slice(0, 100), address: `${from}:${value.port}` }
  } catch { return null }
}

/** This computer's IPv4 addresses the rest of the network can reach, with each subnet's broadcast address. */
export function lanAddresses(): Array<{ address: string; broadcast: string }> {
  const result: Array<{ address: string; broadcast: string }> = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      const toNumber = (text: string): number => text.split('.').reduce((sum, part) => (sum << 8) + Number(part), 0) >>> 0
      const value = (toNumber(entry.address) | ~toNumber(entry.netmask)) >>> 0
      result.push({ address: entry.address, broadcast: [24, 16, 8, 0].map(shift => (value >>> shift) & 255).join('.') })
    }
  }
  return result
}

/**
 * A host says where it is, to every subnet this computer is on. Plain UDP broadcast rather than
 * DNS-SD: it needs no dependency, crosses macOS and Windows alike, and carries only the name and
 * port — pairing and every operation after it go through the authenticated listener.
 */
export class HostBeacon {
  private socket: Socket | null = null
  private timer: NodeJS.Timeout | null = null
  constructor(private announcement: () => Announcement) {}
  async start(): Promise<void> {
    const socket = createSocket('udp4')
    socket.on('error', error => console.warn('Quuu host beacon:', error))
    socket.bind()
    await once(socket, 'listening')
    socket.setBroadcast(true)
    this.socket = socket
    const announce = (): void => {
      const message = Buffer.from(JSON.stringify(this.announcement()))
      const targets = new Set(['255.255.255.255', ...lanAddresses().map(entry => entry.broadcast)])
      for (const target of targets) socket.send(message, BEACON_PORT, target, () => { /* A subnet that went away is skipped until the next announcement. */ })
    }
    announce()
    this.timer = setInterval(announce, ANNOUNCE_MS)
    this.timer.unref()
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.socket?.close()
    this.socket = null
  }
}

/** The hosts a satellite hears. Emits `changed` when one arrives, moves or leaves. */
export class HostDiscovery extends EventEmitter {
  private socket: Socket | null = null
  private heard = new Map<string, { peer: NetworkPeer; at: number }>()
  private timer: NodeJS.Timeout | null = null
  error: string | null = null
  constructor(private port = BEACON_PORT) { super() }
  async start(): Promise<void> {
    // Shared, so a second Quuu on this computer (a verification instance) can listen too.
    const socket = createSocket({ type: 'udp4', reuseAddr: true })
    socket.on('message', (message, remote) => this.heardFrom(message, remote.address))
    socket.on('error', error => { this.error = error.message; console.warn('Quuu host discovery:', error) })
    try {
      socket.bind(this.port)
      await once(socket, 'listening')
    } catch (error) {
      socket.close()
      this.error = error instanceof Error ? error.message : String(error)
      return
    }
    this.error = null
    this.socket = socket
    this.timer = setInterval(() => this.forget(), 1_000)
    this.timer.unref()
  }
  hosts(): NetworkPeer[] {
    return [...this.heard.values()].map(entry => entry.peer).sort((a, b) => a.name.localeCompare(b.name))
  }
  find(id: string): NetworkPeer | null { return this.heard.get(id)?.peer ?? null }
  private heardFrom(message: Buffer, from: string): void {
    const peer = parseAnnouncement(message, from)
    if (!peer) return
    const previous = this.heard.get(peer.id)
    this.heard.set(peer.id, { peer, at: Date.now() })
    if (previous?.peer.address !== peer.address || previous.peer.name !== peer.name) this.emit('changed')
  }
  private forget(): void {
    let changed = false
    for (const [id, entry] of this.heard) if (Date.now() - entry.at > FORGET_MS) { this.heard.delete(id); changed = true }
    if (changed) this.emit('changed')
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.socket?.close()
    this.socket = null
    this.heard.clear()
  }
}
