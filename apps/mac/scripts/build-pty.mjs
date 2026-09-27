/*
 * Build the pseudo-terminal host for the platform being packaged.
 *
 * macOS: native/quuu-pty.c, universal (arm64 + x86_64) through xcrun.
 * Windows: native/quuu-pty-win.c over ConPTY, with MinGW gcc (the Windows runners carry it).
 * `--target win32` cross-builds the Windows host from macOS with Homebrew's mingw-w64, and
 * QUUU_WIN_CC names another compiler.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = join(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(app, 'build', 'pty')
const flag = process.argv.indexOf('--target')
const target = flag >= 0 ? process.argv[flag + 1] : process.platform
const strict = ['-std=c11', '-Wall', '-Wextra', '-Werror', '-O2']

mkdirSync(output, { recursive: true })

if (target === 'darwin') {
  const binary = join(output, 'quuu-pty')
  execFileSync('xcrun', ['clang', ...strict, '-arch', 'arm64', '-arch', 'x86_64', join(app, 'native', 'quuu-pty.c'), '-o', binary], { stdio: 'inherit' })
  chmodSync(binary, 0o755)
} else if (target === 'win32') {
  const compiler = process.env.QUUU_WIN_CC || (process.platform === 'win32' ? 'gcc' : 'x86_64-w64-mingw32-gcc')
  execFileSync(compiler, [...strict, join(app, 'native', 'quuu-pty-win.c'), '-o', join(output, 'quuu-pty.exe'), '-lshell32'], { stdio: 'inherit' })
} else {
  throw new Error(`No pseudo-terminal host for ${target}. Quuu runs on macOS and Windows.`)
}
