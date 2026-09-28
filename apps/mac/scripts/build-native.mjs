/*
 * Build the native helpers for the platform being packaged, into build/native.
 *
 * macOS: the pseudo-terminal host (native/quuu-pty.c), universal (arm64 + x86_64) through xcrun.
 * Windows: the ConPTY terminal host (native/quuu-pty-win.c) and the process probe
 * (native/quuu-probe-win.c), for x64 and arm64, with `zig cc` (its bundled MinGW targets both
 * from any host). QUUU_ZIG names the zig binary; `--target win32` cross-builds from macOS.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = join(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(app, 'build', 'native')
const flag = process.argv.indexOf('--target')
const target = flag >= 0 ? process.argv[flag + 1] : process.platform
const strict = ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2']

mkdirSync(output, { recursive: true })

if (target === 'darwin') {
  const binary = join(output, 'quuu-pty')
  execFileSync('xcrun', ['clang', ...strict, '-arch', 'arm64', '-arch', 'x86_64', join(app, 'native', 'quuu-pty.c'), '-o', binary], { stdio: 'inherit' })
  chmodSync(binary, 0o755)
} else if (target === 'win32') {
  const zig = process.env.QUUU_ZIG || 'zig'
  // Named by electron-builder's ${arch}, so each package picks the one for the architecture it builds
  for (const [arch, triple] of [['x64', 'x86_64-windows-gnu'], ['arm64', 'aarch64-windows-gnu']]) {
    for (const helper of ['quuu-pty', 'quuu-probe']) {
      const source = join(app, 'native', `${helper}-win.c`)
      execFileSync(zig, ['cc', '-target', triple, ...strict, source, '-o', join(output, `${helper}-${arch}.exe`), '-lshell32'], { stdio: 'inherit' })
    }
  }
} else {
  throw new Error(`No native helpers for ${target}. Quuu runs on macOS and Windows.`)
}
