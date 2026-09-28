import { z } from 'zod'

/**
 * The Windows update feed. The same JSON shape Squirrel.Mac reads on macOS
 * (`scripts/release-manifest.ts` writes both), naming the installer instead of a zip.
 */
const updateTo = z.object({
  version: z.string(),
  url: z.string().url().startsWith('https://github.com/'),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().positive()
})
const feedSchema = z.object({
  currentRelease: z.string(),
  releases: z.array(z.object({ version: z.string(), updateTo }))
})
export type WindowsUpdate = z.infer<typeof updateTo>

/** The feed name an architecture reads beside the Mac's `RELEASES-<arch>.json`. */
export function windowsFeedName(arch: string): string {
  return `RELEASES-win32-${arch}.json`
}

/** Dated versions (`2026.9.27`) compared part by part as numbers. */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0)
    if (Number.isNaN(difference)) return 0
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

/** The installer to move to, or null when the feed offers nothing newer than what runs. */
export function pendingUpdate(feed: unknown, currentVersion: string): WindowsUpdate | null {
  const parsed = feedSchema.parse(feed)
  const release = parsed.releases.find((entry) => entry.version === parsed.currentRelease)
  if (!release || release.updateTo.version !== parsed.currentRelease) return null
  return compareVersions(parsed.currentRelease, currentVersion) > 0 ? release.updateTo : null
}
