/*
 * Run electron-builder for the platform this machine packages (macOS or Windows).
 *
 * Electron is hoisted to the workspace root, where electron-builder does not look for its
 * version, so the version is passed in. A Node script rather than `$(…)` in package.json,
 * because npm runs scripts through cmd.exe on Windows.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { version } = require('electron/package.json')
const platform = process.platform === 'win32' ? '--win' : '--mac'
execFileSync(
  process.execPath,
  [require.resolve('electron-builder/cli.js'), platform, ...process.argv.slice(2), `--config.electronVersion=${version}`],
  { stdio: 'inherit' }
)
