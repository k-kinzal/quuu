import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

const releaseMetadata = z.object({ quuuDistribution: z.literal('github-release') })

export function isReleaseBuild(isPackaged: boolean, platform: string, appPath: string): boolean {
  // Each has an update engine (desktop/updateEngines.ts); anything else ships no feed
  if (!isPackaged || (platform !== 'darwin' && platform !== 'win32')) return false
  try {
    // Provenance belongs to the bundle, not its location or the launch environment.
    const metadata: unknown = JSON.parse(readFileSync(join(appPath, 'package.json'), 'utf8'))
    return releaseMetadata.safeParse(metadata).success
  } catch {
    return false
  }
}
