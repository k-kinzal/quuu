import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib'

// Backports retain the old Brotli version string. Node's security release also
// exposes this error code; Electron links Chromium's decoder independently.
// https://github.com/google/brotli/commit/0ed4268a4401abcb4472096340477cf4af7d1a2b
function checkRuntime() {
  if (process.versions.electron) {
    // Electron 45's Chromium 156 decoder matches the upstream fixed source.
    // Its Node 24.22.0 bindings do not yet expose the new error constant.
    assert.ok(Number(process.versions.electron.split('.')[0]) >= 45 &&
      Number(process.versions.chrome.split('.')[0]) >= 156,
    'CVE-2026-111497: use Electron 45 or newer; see docs/security-updates.md')
  } else {
    assert.equal(constants.BROTLI_DECODER_ERROR_FORMAT_BLOCK_SWITCH, -17,
      'CVE-2026-111497: use patched Node.js (24.22.1 / 26.12.1 or newer)')
  }
  const input = Buffer.from('Quuu Brotli runtime verification')
  assert.deepEqual(brotliDecompressSync(brotliCompressSync(input)), input)
  console.log(JSON.stringify({
    node: process.versions.node, electron: process.versions.electron,
    chromium: process.versions.chrome, brotli: process.versions.brotli,
    blockSwitchError: constants.BROTLI_DECODER_ERROR_FORMAT_BLOCK_SWITCH
  }))
}

checkRuntime()
if (!process.versions.electron) {
  const require = createRequire(import.meta.url)
  // An explicit executable also checks the packaged app, including its CLI runtime.
  execFileSync(process.argv[2] ?? require('electron'), [import.meta.filename], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit', timeout: 30_000
  })
}
