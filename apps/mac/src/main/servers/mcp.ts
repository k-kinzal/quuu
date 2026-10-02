import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { operations } from '../../api/catalog.js'
import { authorized } from './authentication.js'
import { RemoteOperations, type Caller } from './callers.js'

interface McpSession { server: Server; transport: StreamableHTTPServerTransport; caller: Caller }
const definitions = operations().map(operation => {
  const empty = operation.input instanceof z.ZodVoid
  const direct = operation.input instanceof z.ZodObject
  const schema = empty ? z.object({}).strict() : direct ? operation.input : z.object({ input: operation.input }).strict()
  return { ...operation, empty, direct, schema, tool: operation.name.replaceAll('.', '_') }
})

export class McpServer {
  private sessions = new Map<string, McpSession>()
  private readonly server
  private readonly expiry: NodeJS.Timeout
  private url: string | null = null
  constructor(private operations: RemoteOperations, private token: string) {
    this.server = createServer((request, response) => { void this.handle(request, response).catch(error => {
      console.error('MCP request:', error)
      if (!response.headersSent) response.writeHead(400).end(JSON.stringify({ error: 'Invalid MCP request' }))
      else response.end()
    }) })
    this.server.requestTimeout = 30_000
    this.server.headersTimeout = 10_000
    this.expiry = setInterval(() => {
      for (const session of this.sessions.values()) if (Date.now() - session.caller.lastUsed > 15 * 60_000) void session.server.close()
    }, 60_000)
    this.expiry.unref()
  }
  async start(port: number): Promise<string> {
    this.server.listen(port, '127.0.0.1')
    await once(this.server, 'listening')
    const address = this.server.address()
    if (!address || typeof address === 'string') throw new Error('Missing server address')
    this.url = `http://127.0.0.1:${address.port}/mcp`
    return this.url
  }
  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.url !== '/mcp') { response.writeHead(404).end(); return }
    if (!authorized(request.headers.authorization, this.token)) { response.writeHead(401).end(); return }
    const expected = new URL(this.url!)
    if (request.headers.host !== expected.host || (request.headers.origin && request.headers.origin !== expected.origin)) { response.writeHead(403).end(); return }
    const id = request.headers['mcp-session-id']
    if (Array.isArray(id)) { response.writeHead(400).end(); return }
    let session = id ? this.sessions.get(id) : undefined
    if (id && !session) { response.writeHead(404).end(); return }
    let body: unknown
    if (request.method === 'POST') {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of request) {
        const bytes = Buffer.from(chunk as Uint8Array)
        size += bytes.length
        if (size > 4 * 1024 * 1024) { response.writeHead(413).end(); return }
        chunks.push(bytes)
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
    }
    if (!session) {
      if (request.method !== 'POST' || !isInitializeRequest(body)) { response.writeHead(400).end(); return }
      const caller = this.operations.create({ kind: 'mcp' })
      const server = new Server({ name: 'quuu', version: '1.0.0' }, { capabilities: { tools: {} } })
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID, enableJsonResponse: true,
        onsessioninitialized: sessionId => { this.sessions.set(sessionId, { server, transport, caller }) },
      })
      const emit = (event: { name: string; payload: unknown }): void => {
        void server.notification({ method: 'notifications/quuu/event', params: event }).catch(() => { /* Disconnected HTTP clients resume through their next request. */ })
      }
      caller.on('event', emit)
      server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: definitions.map(operation => ({
        name: operation.tool,
        description: `Quuu ${operation.name}. Uses the same operation as the desktop app.${operation.name === 'logs.page' ? ' Read bounded, structured session history. Pass next as offset and retain generation; search filters each scanned page.' : ''}`,
        inputSchema: z.toJSONSchema(operation.schema, { io: 'input', unrepresentable: 'any' }) as { type: 'object'; properties: Record<string, object> },
      })) }))
      server.setRequestHandler(CallToolRequestSchema, async request => {
        try {
          const definition = definitions.find(operation => operation.tool === request.params.name)
          if (!definition) throw new Error('Unknown tool')
          const args = definition.schema.parse(request.params.arguments ?? {}) as Record<string, unknown>
          const result = await this.operations.call(caller, definition.name, definition.empty ? undefined : definition.direct ? args : args.input)
          const structuredContent = { result: result ?? null }
          return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent }
        } catch (error) {
          const reason = error instanceof ORPCError ? (error.data as { reason?: string } | undefined)?.reason : undefined
          return { content: [{ type: 'text', text: reason ?? (error instanceof Error ? error.message : String(error)) }], isError: true }
        }
      })
      await server.connect(transport)
      const onclose = transport.onclose
      transport.onclose = () => {
        onclose?.()
        if (transport.sessionId) this.sessions.delete(transport.sessionId)
        this.operations.remove(caller.id)
      }
      session = { server, transport, caller }
    }
    session.caller.lastUsed = Date.now()
    try { await session.transport.handleRequest(request, response, body) }
    finally {
      // A malformed initialization must not retain a caller that has no session ID.
      if (!session.transport.sessionId) { this.operations.remove(session.caller.id); await session.server.close() }
    }
  }
  async stop(): Promise<void> {
    clearInterval(this.expiry)
    await Promise.all([...this.sessions.values()].map(session => session.server.close()))
    this.sessions.clear()
    this.server.closeAllConnections()
    await new Promise<void>(resolve => this.server.close(() => resolve()))
  }
}
