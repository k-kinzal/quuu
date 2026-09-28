import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { isSignedForUpdates } from '../src/main/updates/signing.js'
import { windowsFeedName } from '../src/main/updates/windowsFeed.js'

export function releaseVersion(tag: string): string {
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(tag)) throw new Error('Release tag must be YYYY.MM.DD')
  const [year, month, day] = tag.split('.').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error('Release tag must be a valid calendar date')
  }
  // Squirrel compares the version in the feed to CFBundleShortVersionString.
  return `${year}.${month}.${day}`
}

export async function writeReleaseManifests(output: string, tag: string, version: string): Promise<void> {
  if (version !== releaseVersion(tag)) throw new Error('Release tag and packaged version do not match')
  for (const arch of ['arm64', 'x64']) {
    const name = `Quuu-${version}-${arch}.zip`
    const archive = join(output, name)
    const size = (await stat(archive)).size
    const bundle = join(output, arch === 'arm64' ? 'mac-arm64' : 'mac', 'Quuu.app')
    const signed = await isSignedForUpdates(bundle)
    const digest = createHash('sha256')
    for await (const chunk of createReadStream(archive)) digest.update(chunk as Buffer)
    const updateTo = {
      version,
      name: `Quuu ${version}`,
      url: `https://github.com/k-kinzal/quuu/releases/download/${tag}/${name}`,
      sha256: digest.digest('hex'),
      size
    }
    // An unsigned release remains downloadable, but never replaces a signed installation.
    const manifest = signed
      ? { currentRelease: version, releases: [{ version, updateTo }] }
      : { currentRelease: '0.0.0', releases: [] }
    await writeFile(join(output, `RELEASES-${arch}.json`), `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`${arch}: ${signed ? 'automatic update' : 'manual download only'}`)
  }
}

/**
 * The Windows feeds: the installer each architecture moves to (desktop/updateEngines.ts). Always
 * published — an installer replaces an unsigned install as a manual download would, and a signed
 * installation checks the installer's publisher itself.
 */
export async function writeWindowsManifests(output: string, tag: string, version: string): Promise<void> {
  if (version !== releaseVersion(tag)) throw new Error('Release tag and packaged version do not match')
  for (const arch of ['x64', 'arm64']) {
    const name = `Quuu-${version}-win-${arch}-setup.exe`
    const installer = join(output, name)
    const size = (await stat(installer)).size
    const digest = createHash('sha256')
    for await (const chunk of createReadStream(installer)) digest.update(chunk as Buffer)
    const updateTo = {
      version,
      name: `Quuu ${version}`,
      url: `https://github.com/k-kinzal/quuu/releases/download/${tag}/${name}`,
      sha256: digest.digest('hex'),
      size
    }
    const manifest = { currentRelease: version, releases: [{ version, updateTo }] }
    await writeFile(join(output, windowsFeedName(arch)), `${JSON.stringify(manifest, null, 2)}\n`)
  }
}

if (process.argv.includes('--stamp') || process.argv.includes('--write') || process.argv.includes('--write-windows')) {
  const root = resolve(import.meta.dirname, '..')
  const packageFile = join(root, 'package.json')
  const metadata = JSON.parse(await readFile(packageFile, 'utf8')) as { version: string }
  const tag = process.env.TAG ?? ''
  if (process.argv.includes('--stamp')) {
    metadata.version = releaseVersion(tag)
    await writeFile(packageFile, `${JSON.stringify(metadata, null, 2)}\n`)
  } else if (process.argv.includes('--write-windows')) {
    await writeWindowsManifests(join(root, 'release'), tag, metadata.version)
  } else {
    await writeReleaseManifests(join(root, 'release'), tag, metadata.version)
  }
}
