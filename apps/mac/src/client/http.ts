import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createORPCClient } from '@orpc/client'
import { fromJson, toJson, type DescMethodUnary, type JsonValue } from '@bufbuild/protobuf'
import { createClient } from '@connectrpc/connect'
import { createGrpcTransport, Http2SessionManager } from '@connectrpc/connect-node'
import { z } from 'zod'
import { operations } from '../api/catalog.js'
import { Quuu } from '../api/generated/quuu_pb.js'
import { wire } from '../api/generated/wire.js'
import { decodeWire, encodeWire } from '../api/wire.js'
import type { QuuuApi } from '../api/types.js'

const ConnectionSchema = z.object({ version: z.literal(1), http: z.string().nullable(), mcp: z.string().nullable(), token: z.string().min(1) })
export function connectionSettings() {
  if (process.env.QUUU_URL && process.env.QUUU_TOKEN) return { http: process.env.QUUU_URL, mcp: null, token: process.env.QUUU_TOKEN }
  const file = process.env.QUUU_CONNECTION_FILE ?? join(process.env.QUUU_USER_DATA ?? defaultUserData(), 'connections.json')
  try { return ConnectionSchema.parse(JSON.parse(readFileSync(file, 'utf8')) as unknown) }
  catch (error) { throw new Error(`Cannot read Quuu connection settings at ${file}. Start Quuu and enable HTTP in Settings → Connections.`, { cause: error }) }
}

/** The app's data directory; the client cannot import the app, so this mirrors main/appPaths.ts. */
function defaultUserData(): string {
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'taskd')
  return join(homedir(), 'Library', 'Application Support', 'taskd')
}

/** Generated Protobuf descriptors and the official gRPC transport provide the external client. */
export class QuuuHttpClient {
  readonly api: QuuuApi
  readonly rpc
  private readonly transport
  private readonly session: Http2SessionManager
  private readonly headers: Headers
  private connecting: Promise<void> | null = null
  private closed = false
  private readonly definitions = new Map(operations().map(operation => [operation.name, operation]))
  constructor(url: string, token: string) {
    this.session = new Http2SessionManager(url)
    this.headers = new Headers({ authorization: `Bearer ${token}` })
    // Set for an agent Quuu launched; the app's telemetry tells its calls from a person's by this.
    if (process.env.QUUU_RUN_ID) this.headers.set('quuu-run-id', process.env.QUUU_RUN_ID)
    this.transport = createGrpcTransport({ baseUrl: url, sessionManager: this.session, defaultTimeoutMs: 30_000, readMaxBytes: 32 * 1024 * 1024, writeMaxBytes: 4 * 1024 * 1024 })
    this.rpc = createClient(Quuu, this.transport)
    this.api = createORPCClient<QuuuApi>({ call: (path, input, options) => this.call(path.join('.'), input, options.signal) })
  }
  private async connect(): Promise<void> {
    if (this.closed) throw new Error('The Quuu client is closed')
    this.connecting ??= this.rpc.connect({}, { headers: this.headers }).then(result => { this.headers.set('quuu-client-id', result.clientId) })
    await this.connecting
  }
  async call(name: string, input?: unknown, signal?: AbortSignal): Promise<unknown> {
    const definition = this.definitions.get(name), mapping = wire[name]
    if (!definition || !mapping) throw new Error(`Unknown operation: ${name}`)
    const parsed = definition.input.parse(input)
    await this.connect()
    const method = Quuu.methods.find(method => method.localName === mapping.method) as DescMethodUnary
    const request = fromJson(method.input, mapping.input.kind === 'void' ? {} : { value: encodeWire(mapping.input, parsed) })
    const response = await this.transport.unary(method, signal, undefined, this.headers, request)
    const json = toJson(method.output, response.message) as { value?: JsonValue }
    return definition.output.parse(decodeWire(mapping.output, json.value ?? {}))
  }
  async *watch(signal: AbortSignal): AsyncGenerator<{ name: string; payload: JsonValue }> {
    await this.connect()
    for await (const message of this.rpc.watch({}, { headers: this.headers, signal, timeoutMs: 0 })) {
      yield toJson(Quuu.method.watch.output, message) as { name: string; payload: JsonValue }
    }
  }
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    try {
      if (this.connecting) {
        await this.connecting
        await this.rpc.disconnect({}, { headers: this.headers, timeoutMs: 2000 })
      }
    } finally { this.session.abort() }
  }
}
