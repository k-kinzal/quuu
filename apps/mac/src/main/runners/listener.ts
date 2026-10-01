import { createServer, type Server } from 'node:https'
import { z } from 'zod'
import { runnerCertificate } from './tls.js'
import { runnerLabels } from './labels.js'
import type { RunnerPoll } from './types.js'

const agent = z.object({ name: z.string().min(1).max(100), command: z.string().min(1).max(1024), version: z.string().max(300), signedIn: z.boolean().optional() }).strict()
const pair = z.object({ version: z.literal(1), pin: z.string().max(12), name: z.string().min(1).max(100),
  labels: runnerLabels.optional(),
  capacity: z.number().int().min(1).max(64), root: z.string().regex(/^\/[\w/.-]+$/).max(1024), agents: agent.array().max(64) }).strict()
const result = z.object({ exitCode: z.number().int().nullable(), canceled: z.boolean(), timedOut: z.boolean(),
  started: z.boolean().optional(),
  error: z.string().max(8192), sessionId: z.string().max(300),
  baseline: z.object({ startedAt: z.string(), baseHead: z.string().nullable(), baseTree: z.string().nullable() }).optional(),
  value: z.unknown().optional(), page: z.string().max(8 * 1024 * 1024).optional() })
const poll = z.object({ version: z.literal(1), labels: runnerLabels.optional(), agents: agent.array().max(64), updates: z.object({
  id: z.string().max(100), logOffset: z.number().int().nonnegative(), log: z.string().max(350_000),
  sessionOffset: z.number().int().nonnegative(), session: z.string().max(350_000), sessionId: z.string().max(300),
  result: result.optional()
}).array().max(64), installed: z.string().max(100).array().max(16).optional() }).strict()

export async function listenForRunners(options: {
  port: number; dir: string
  pair: (input: z.infer<typeof pair>) => unknown
  poll: (token: string, input: RunnerPoll) => Promise<unknown>
}): Promise<{ server: Server; port: number; fingerprint: string }> {
  const certificate = await runnerCertificate(options.dir)
  const server = createServer({ key: certificate.key, cert: certificate.cert, minVersion: 'TLSv1.2' }, (req, res) => {
    const respond = async (): Promise<void> => {
      if (req.method !== 'POST' || req.headers.origin || !['/pair', '/poll'].includes(req.url ?? '')) {
        res.writeHead(404).end(); return
      }
      let size = 0
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
        size += bytes.length
        if (size > 24 * 1024 * 1024) { res.writeHead(413).end(); return }
        chunks.push(bytes)
      }
      const input: unknown = JSON.parse(Buffer.concat(chunks).toString())
      const output = req.url === '/pair' ? options.pair(pair.parse(input))
        : await options.poll(req.headers.authorization?.replace(/^Bearer /, '') ?? '', poll.parse(input))
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(output))
    }
    void respond().catch(() => { if (!res.headersSent) res.writeHead(403); res.end() })
  })
  server.requestTimeout = 30_000
  server.headersTimeout = 10_000
  server.maxConnections = 64
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port, '0.0.0.0', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Runner listener has no address')
  return { server, port: address.port, fingerprint: certificate.fingerprint }
}
