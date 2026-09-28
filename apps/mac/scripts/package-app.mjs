/*
 * Run electron-builder for the platform this machine packages (macOS or Windows).
 *
 * Electron is hoisted to the workspace root, where electron-builder does not look for its
 * version, so the version is passed in. A Node script rather than `$(…)` in package.json,
 * because npm runs scripts through cmd.exe on Windows.
 *
 * Windows packages one architecture per run with explicit `target:arch` specs: given both at
 * once, NSIS also builds an installer carrying both copies of Quuu, and `--x64` alone does not
 * narrow the targets electron-builder.yml lists.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { version } = require('electron/package.json')
const cli = require.resolve('electron-builder/cli.js')
const args = process.argv.slice(2)
const build = (platform) => execFileSync(
  process.execPath,
  [cli, ...platform, ...args, `--config.electronVersion=${version}`],
  { stdio: 'inherit' }
)

if (process.platform !== 'win32') build(['--mac'])
else if (args.includes('--dir')) build(['--win'])
else for (const arch of ['x64', 'arm64']) build(['--win', `nsis:${arch}`, `zip:${arch}`])
