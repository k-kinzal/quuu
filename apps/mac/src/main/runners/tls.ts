import { execFile } from 'node:child_process'
import { X509Certificate, createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { connect } from 'node:tls'
import { Agent, request } from 'node:https'

export async function runnerCertificate(dir: string): Promise<{ key: Buffer; cert: Buffer; fingerprint: string }> {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const keyPath = join(dir, 'key.pem'), certPath = join(dir, 'cert.pem')
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    await promisify(execFile)('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyPath, '-out', certPath, '-days', '3650', '-subj', '/CN=Quuu Runner Controller'], { timeout: 30_000 })
    chmodSync(keyPath, 0o600)
  }
  const key = readFileSync(keyPath), cert = readFileSync(certPath)
  return { key, cert, fingerprint: new X509Certificate(cert).fingerprint256.replaceAll(':', '').toLowerCase() }
}

/** Verify the out-of-band fingerprint before sending a PIN, token or request body. */
export async function pinnedRequest(url: string, fingerprint: string, path: string, body: unknown, token?: string): Promise<unknown> {
  const target = new URL(url)
  if (target.protocol !== 'https:' || target.username || target.password || !/^[a-f0-9]{64}$/i.test(fingerprint)) {
    throw new Error('An HTTPS controller URL and SHA-256 certificate fingerprint are required')
  }
  const socket = connect({ host: target.hostname, port: Number(target.port || 443), rejectUnauthorized: false })
  await new Promise<void>((resolve, reject) => {
    socket.setTimeout(15_000, () => socket.destroy(new Error('Runner connection timed out')))
    socket.once('error', reject)
    socket.once('secureConnect', () => {
      const raw = socket.getPeerCertificate().raw
      if (!raw || createHash('sha256').update(raw).digest('hex') !== fingerprint.toLowerCase()) {
        socket.destroy(new Error('Controller certificate does not match the pairing fingerprint'))
        return
      }
      resolve()
    })
  })
  const agent = new Agent()
  agent.createConnection = () => socket
  return new Promise((resolve, reject) => {
    const req = request({ protocol: 'https:', hostname: target.hostname, port: target.port || 443, path,
      method: 'POST', agent,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    }, res => {
      let size = 0
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 32 * 1024 * 1024) { req.destroy(new Error('Runner response is too large')); return }
        chunks.push(chunk)
      })
      res.on('error', reject)
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error(`Controller rejected request (${res.statusCode})`)); return }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString()) as unknown) } catch (error) { reject(error instanceof Error ? error : new Error(String(error))) }
      })
    })
    req.once('error', reject)
    req.setTimeout(30_000, () => req.destroy(new Error('Runner request timed out')))
    req.end(JSON.stringify(body))
  }).finally(() => { agent.destroy(); socket.destroy() })
}
