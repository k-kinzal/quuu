import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createRouterClient, ORPCError } from '@orpc/server'
import { operations } from '../../api/catalog.js'
import { EVENTS } from '../../api/channels.js'
import type { EventPayloads } from '../../api/events.js'
import type { QuuuApp } from '../bootstrap.js'
import type { DesktopOperations } from '../api/host.js'
import { createOperationsRouter } from '../api/router.js'

export class Caller extends EventEmitter {
  readonly id = randomUUID()
  lastUsed = Date.now()
  closed = false
  private cleanup = new Set<() => void>()
  own(fn: () => void): () => void {
    const release = (): void => { if (this.cleanup.delete(release)) fn() }
    this.cleanup.add(release)
    return release
  }
  close(): void {
    if (this.closed) return
    this.closed = true
    for (const release of this.cleanup) release()
    this.emit('closed')
    this.removeAllListeners()
  }
}

/** Shared in-process reception for both servers; neither server loops back through HTTP. */
export class RemoteOperations {
  private callers = new Map<string, Caller>()
  private readonly router
  private readonly expiry: NodeJS.Timeout
  private snapshotTimer: NodeJS.Timeout | null = null
  private readonly definitions = new Map(operations().map(operation => [operation.name, operation]))
  constructor(private app: QuuuApp, desktop: () => DesktopOperations) {
    this.router = createOperationsRouter<Caller>(app, {
      authorize: owner => { if (owner.closed) throw new ORPCError('UNAUTHORIZED') },
      releaseWithOwner: (owner, cleanup) => owner.own(cleanup),
      sendEvent: (owner, name, payload) => { if (!owner.closed) owner.emit('event', { name, payload }) },
      desktopFor: desktop,
    })
    this.expiry = setInterval(() => {
      for (const caller of this.callers.values()) if (Date.now() - caller.lastUsed > 15 * 60_000 && caller.listenerCount('event') === 0) this.remove(caller.id)
    }, 60_000)
    this.expiry.unref()
    app.on('changed', this.changed)
    app.on('status', this.status)
    app.on('settings', this.settings)
    app.on('notify', this.notify)
  }
  create(): Caller {
    if (this.callers.size >= 64) throw new Error('Too many clients; close an existing connection')
    const caller = new Caller()
    this.callers.set(caller.id, caller)
    return caller
  }
  get(id: string | null): Caller {
    const caller = id ? this.callers.get(id) : undefined
    if (!caller || caller.closed) throw new ORPCError('UNAUTHORIZED', { message: 'Connect to open a client session' })
    caller.lastUsed = Date.now()
    return caller
  }
  remove(id: string): void { this.callers.get(id)?.close(); this.callers.delete(id) }
  async call(caller: Caller, name: string, input: unknown): Promise<unknown> {
    const definition = this.definitions.get(name)
    if (!definition) throw new ORPCError('NOT_FOUND')
    let method: unknown = createRouterClient(this.router, { context: { owner: caller } })
    for (const key of name.split('.')) method = (method as Record<string, unknown>)[key]
    if (typeof method !== 'function') throw new Error(`Missing implementation: ${name}`)
    // oRPC validates the contract here, just as it does for an IPC call.
    return (method as (value: unknown) => Promise<unknown>)(input)
  }
  private broadcast<K extends keyof EventPayloads>(name: K, payload: EventPayloads[K]): void {
    for (const caller of this.callers.values()) caller.emit('event', { name, payload })
  }
  private changed = (): void => {
    if (this.snapshotTimer || ![...this.callers.values()].some(caller => caller.listenerCount('event'))) return
    this.snapshotTimer = setTimeout(() => { this.snapshotTimer = null; this.broadcast(EVENTS.snapshot, this.app.snapshot()) }, 80)
  }
  private status = (payload: EventPayloads[typeof EVENTS.schedulerStatus]): void => this.broadcast(EVENTS.schedulerStatus, payload)
  private settings = (payload: EventPayloads[typeof EVENTS.settings]): void => this.broadcast(EVENTS.settings, payload)
  private notify = (payload: EventPayloads[typeof EVENTS.toast]): void => this.broadcast(EVENTS.toast, payload)
  close(): void {
    clearInterval(this.expiry)
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer)
    for (const caller of this.callers.values()) caller.close()
    this.callers.clear()
    this.app.off('changed', this.changed)
    this.app.off('status', this.status)
    this.app.off('settings', this.settings)
    this.app.off('notify', this.notify)
  }
}
