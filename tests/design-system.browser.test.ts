import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import electron from 'electron'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import { expect, it } from 'vitest'

it('keeps control appearance and visible icon names consistent in real Chromium across both themes and densities', async () => {
  const profile = await mkdtemp(resolve(tmpdir(), 'quuu-design-check-'))
  const server = await createServer({
    configFile: false, root: resolve(import.meta.dirname, '..'),
    plugins: [react()], logLevel: 'error',
    cacheDir: resolve(profile, 'vite'),
    optimizeDeps: { entries: ['tests/fixtures/design-system/index.html'] },
    server: { host: '127.0.0.1', port: 0 }
  })
  try {
    await server.listen()
    const address = server.httpServer?.address()
    if (!address || typeof address === 'string') throw new Error('Missing fixture server address')
    if (typeof electron !== 'string') throw new Error('Electron executable path is unavailable')
    const { stdout } = await promisify(execFile)(electron, [
      resolve(import.meta.dirname, 'fixtures/design-system/run.mjs'),
      `http://127.0.0.1:${address.port}/tests/fixtures/design-system/index.html`,
      `--user-data-dir=${profile}`
    ], { timeout: 150_000, maxBuffer: 1024 * 1024, env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } })
    expect(stdout).toContain('dark/compact: geometry')
    expect(stdout).toContain('light/comfortable: geometry')
    expect(stdout).toContain('dark/compact: icon names')
    expect(stdout).toContain('light/comfortable: icon names')
    expect(stdout).toContain('dark: explorer pointer')
    expect(stdout).toContain('light: explorer pointer')
  } finally {
    await server.close()
    await rm(profile, { recursive: true, force: true })
  }
}, 180_000)
