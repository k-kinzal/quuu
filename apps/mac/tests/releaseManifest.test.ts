import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { releaseVersion, writeReleaseManifests } from '../scripts/release-manifest.js'

const { signed } = vi.hoisted(() => ({ signed: vi.fn<() => Promise<boolean>>() }))
vi.mock('../src/main/updates/signing.js', () => ({ isSignedForUpdates: signed }))
let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'quuu-release-feed-'))
  signed.mockResolvedValue(true)
  for (const arch of ['arm64', 'x64']) await writeFile(join(directory, `Quuu-2026.9.27-${arch}.zip`), arch)
})
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

it('normalizes dated tags to the numeric version used by the app', () => {
  expect(releaseVersion('2026.09.07')).toBe('2026.9.7')
  expect(releaseVersion('2028.02.29')).toBe('2028.2.29')
})
it.each(['2026.9.27', 'v2026.09.27', '2026.02.29', '2026.13.01', '2026.04.31'])('rejects an invalid release tag: %s', tag => {
  expect(() => releaseVersion(tag)).toThrow()
})
it('publishes separate architecture feeds with exact tagged URLs and archive digests', async () => {
  await writeReleaseManifests(directory, '2026.09.27', '2026.9.27')
  for (const arch of ['arm64', 'x64']) {
    expect(JSON.parse(await readFile(join(directory, `RELEASES-${arch}.json`), 'utf8'))).toEqual({
      currentRelease: '2026.9.27',
      releases: [{ version: '2026.9.27', updateTo: {
        version: '2026.9.27', name: 'Quuu 2026.9.27',
        url: `https://github.com/k-kinzal/quuu/releases/download/2026.09.27/Quuu-2026.9.27-${arch}.zip`,
        sha256: createHash('sha256').update(arch).digest('hex'), size: arch.length
      } }]
    })
  }
})
it('never offers an ad-hoc archive as an automatic update', async () => {
  signed.mockResolvedValue(false)
  await writeReleaseManifests(directory, '2026.09.27', '2026.9.27')
  expect(JSON.parse(await readFile(join(directory, 'RELEASES-arm64.json'), 'utf8'))).toEqual({ currentRelease: '0.0.0', releases: [] })
})
it('refuses a feed that disagrees with the packaged version or lacks its archive', async () => {
  await expect(writeReleaseManifests(directory, '2026.09.27', '1.0.0')).rejects.toThrow('do not match')
  await rm(join(directory, 'Quuu-2026.9.27-arm64.zip'))
  await expect(writeReleaseManifests(directory, '2026.09.27', '2026.9.27')).rejects.toThrow('ENOENT')
})
