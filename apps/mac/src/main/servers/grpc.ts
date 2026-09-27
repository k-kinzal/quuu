import { createServer, type ServerHttp2Session } from 'node:http2'
import { once } from 'node:events'
import { fromJson, toJson, type DescMethodUnary, type JsonValue } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { connectNodeAdapter } from '@connectrpc/connect-node'
import { ORPCError } from '@orpc/server'
import { ZodError } from 'zod'
import { Quuu } from '../../api/generated/quuu_pb.js'
import { wire } from '../../api/generated/wire.js'
import { decodeWire, encodeWire } from '../../api/wire.js'
import { Caller, RemoteOperations } from './callers.js'
import { authorized } from './authentication.js'

function failure(error: unknown): ConnectError {
  if (error instanceof ConnectError) return error
  if (error instanceof ZodError) return new ConnectError(error.message, Code.InvalidArgument)
  if (error instanceof ORPCError) {
    const code = error.code === 'UNAUTHORIZED' ? Code.Unauthenticated : error.code === 'BAD_REQUEST' ? Code.InvalidArgument : error.code === 'NOT_FOUND' ? Code.NotFound : error.code === 'FORBIDDEN' ? Code.PermissionDenied : Code.FailedPrecondition
    const reason = error.data as { reason?: string } | undefined
    return new ConnectError(reason?.reason ?? error.message, code)
  }
  return new ConnectError(error instanceof Error ? error.message : String(error), Code.FailedPrecondition)
}

async function* events(caller: Caller, signal: AbortSignal): AsyncGenerator<{ name: string; payload: JsonValue }> {
  const queue: Array<{ name: string; payload: JsonValue }> = []
  let wake: (() => void) | undefined
  let overflow = false
  const push = (event: { name: string; payload: JsonValue }): void => {
    if (queue.length >= 128) overflow = true
    else queue.push(event)
    wake?.()
  }
  const stop = (): void => wake?.()
  caller.on('event', push)
  caller.on('closed', stop)
  signal.addEventListener('abort', stop)
  try {
    yield { name: 'quuu.ready', payload: {} }
    while (!signal.aborted && !caller.closed) {
      if (overflow) throw new ConnectError('Consumer fell behind; reload state and reconnect', Code.ResourceExhausted)
      const event = queue.shift()
      if (event) { caller.lastUsed = Date.now(); yield event }
      else await new Promise<void>(resolve => { wake = resolve })
    }
  } finally {
    caller.off('event', push)
    caller.off('closed', stop)
    signal.removeEventListener('abort', stop)
  }
}

export class GrpcServer {
  private connections = new Set<ServerHttp2Session>()
  private readonly server
  private callers = new Set<string>()
  constructor(private operations: RemoteOperations, token: string) {
    const adapter = connectNodeAdapter({
      grpc: true, grpcWeb: false, connect: false,
      readMaxBytes: 4 * 1024 * 1024, writeMaxBytes: 32 * 1024 * 1024,
      maxTimeoutMs: 120_000,
      interceptors: [next => async request => {
        if (!authorized(request.header.get('authorization'), token)) throw new ConnectError('Authentication required', Code.Unauthenticated)
        try { return await next(request) } catch (error) { throw failure(error) }
      }],
      routes: router => {
        router.rpc(Quuu.method.connect, () => {
          const caller = operations.create()
          this.callers.add(caller.id)
          caller.once('closed', () => this.callers.delete(caller.id))
          return { clientId: caller.id }
        })
        const callerFor = (headers: Headers): Caller => {
          const id = headers.get('quuu-client-id')
          if (!id || !this.callers.has(id)) throw new ConnectError('Unknown client session', Code.Unauthenticated)
          return operations.get(id)
        }
        router.rpc(Quuu.method.disconnect, (_request, context) => {
          const caller = callerFor(context.requestHeader)
          operations.remove(caller.id)
          this.callers.delete(caller.id)
          return {}
        })
        router.rpc(Quuu.method.watch, async function* (_request, context) {
          for await (const event of events(callerFor(context.requestHeader), context.signal)) {
            yield fromJson(Quuu.method.watch.output, event)
          }
        })
        for (const [name, mapping] of Object.entries(wire)) {
          const method = Quuu.methods.find(method => method.localName === mapping.method) as DescMethodUnary | undefined
          if (!method) throw new Error(`Missing generated RPC: ${name}`)
          router.rpc(method, async (request, context) => {
            const json = toJson(method.input, request) as { value?: JsonValue }
            const input = decodeWire(mapping.input, json.value ?? {})
            const output = await operations.call(callerFor(context.requestHeader), name, input)
            return fromJson(method.output, mapping.output.kind === 'void' ? {} : { value: encodeWire(mapping.output, output) })
          })
        }
      },
    })
    this.server = createServer({ maxSessionMemory: 16, settings: { maxConcurrentStreams: 32 } }, adapter)
    this.server.on('session', session => { this.connections.add(session); session.once('close', () => this.connections.delete(session)); session.on('error', () => session.destroy()) })
    this.server.on('error', error => console.error('gRPC server:', error))
  }
  async start(port: number): Promise<string> {
    this.server.listen(port, '127.0.0.1')
    await once(this.server, 'listening')
    const address = this.server.address()
    if (!address || typeof address === 'string') throw new Error('Missing server address')
    return `http://127.0.0.1:${address.port}`
  }
  async stop(): Promise<void> {
    for (const id of this.callers) this.operations.remove(id)
    this.callers.clear()
    for (const session of this.connections) session.destroy()
    await new Promise<void>(resolve => this.server.close(() => resolve()))
  }
}
