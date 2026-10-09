import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import electron from 'electron'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'
import { expect, it } from 'vitest'

it('automatically keeps new screens clear of native window controls across navigation, scrolling and responsive changes', async () => {
  const profile = await mkdtemp(resolve(tmpdir(), 'quuu-window-controls-'))
  const server = await createServer({
    configFile: false, root: resolve(import.meta.dirname, '..'),
    plugins: [react()], logLevel: 'error', cacheDir: resolve(profile, 'vite'),
    optimizeDeps: { entries: ['tests/fixtures/window-controls/index.html'] },
    server: { host: '127.0.0.1', port: 0 }
  })
  try {
    await server.listen()
    const address = server.httpServer?.address()
    if (!address || typeof address === 'string' || typeof electron !== 'string') throw new Error('Missing browser fixture address')
    const { stdout } = await promisify(execFile)(electron, [
      resolve(import.meta.dirname, 'fixtures/window-controls/run.mjs'),
      `http://127.0.0.1:${address.port}/tests/fixtures/window-controls/index.html`,
      `--user-data-dir=${profile}`
    ], { timeout: 60_000, maxBuffer: 1024 * 1024, env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } })
    expect(stdout).toContain('window controls: all layouts passed')
  } finally {
    await server.close()
    await rm(profile, { recursive: true, force: true })
  }
}, 90_000)
