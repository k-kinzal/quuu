import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Where a native helper (native/*.c) lives.
 *
 * Packaged: `Resources/bin/<name>` (`resources\bin\<name>.exe` on Windows). A checkout runs the
 * one `npm run build:native` left in build/native, where Windows keeps one per architecture.
 * null when it was never built.
 */
export function nativeHelperPath(name: 'quuu-pty' | 'quuu-probe'): string | null {
  const windows = process.platform === 'win32'
  const packaged = windows ? `${name}.exe` : name
  const built = windows ? `${name}-${process.arch}.exe` : name
  const resourcesPath = 'resourcesPath' in process && typeof process.resourcesPath === 'string' ? process.resourcesPath : null
  const candidates = [
    ...(resourcesPath ? [join(resourcesPath, 'bin', packaged)] : []),
    join(process.cwd(), 'build', 'native', built),
    join(process.cwd(), 'apps', 'mac', 'build', 'native', built)
  ]
  return candidates.find(existsSync) ?? null
}
