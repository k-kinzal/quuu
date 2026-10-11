import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import electron from 'electron'
import { expect, it } from 'vitest'

it('automatically keeps new screens clear of native window controls across navigation, scrolling and responsive changes', async () => {
  const profile = await mkdtemp(resolve(tmpdir(), 'quuu-window-controls-'))
  try {
    const outDir = resolve(profile, 'dist')
    // Match the packaged app's React and Emotion CSS insertion paths. Keep NODE_ENV local to the build process.
    await promisify(execFile)(process.execPath, [resolve(import.meta.dirname, 'fixtures/window-controls/build.mjs'), outDir], {
      timeout: 60_000, maxBuffer: 1024 * 1024, env: { ...process.env, NODE_ENV: 'production' }
    })
    if (typeof electron !== 'string') throw new Error('Missing Electron executable')
    const { stdout } = await promisify(execFile)(electron, [
      resolve(import.meta.dirname, 'fixtures/window-controls/run.mjs'),
      pathToFileURL(resolve(outDir, 'tests/fixtures/window-controls/index.html')).href,
      `--user-data-dir=${resolve(profile, 'browser')}`
    ], { timeout: 60_000, maxBuffer: 1024 * 1024, env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } })
    expect(stdout).toContain('window controls: all layouts passed')
  } finally {
    await rm(profile, { recursive: true, force: true })
  }
}, 90_000)
