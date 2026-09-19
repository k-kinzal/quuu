import { describe, expect, it } from 'vitest'
import { APP_ENTRY, buildId, checkApp, emptyAppManifest, shouldInstall } from '../src/main/mobile-sync/appDistribution.js'
import type { SyncAppFile, SyncAppManifest } from '../src/main/mobile-sync/appDistribution.js'
import { parseAppManifest } from '../src/main/mobile-sync/readAppManifest.js'

/**
 * Shipping the screens over iCloud. **So they can be fixed without plugging in a cable.**
 *
 * One thing is pinned down here: **never install something incomplete**. A half-installed one
 * shows no screen the next time it opens, with no way at hand to go and fix it.
 */

const file = (path: string, hash: string): SyncAppFile => ({ path, hash, bytes: 1 })

function manifest(files: SyncAppFile[]): SyncAppManifest {
  return { ...emptyAppManifest(), build: buildId(files), publishedAt: 'x', files }
}

describe('the name of a build', () => {
  it('gives identical contents the same name (a rebuild is not re-shipped)', () => {
    const a = buildId([file('index.html', 'h1'), file('a.js', 'h2')])
    const b = buildId([file('a.js', 'h2'), file('index.html', 'h1')])
    expect(a).toBe(b)
  })

  it('gives a different name to a difference of even one byte', () => {
    const a = buildId([file('index.html', 'h1')])
    const b = buildId([file('index.html', 'h2')])
    expect(a).not.toBe(b)
  })
})

describe('whether it may be installed', () => {
  const m = manifest([file(APP_ENTRY, 'h1'), file('assets/x.js', 'h2')])

  it('installs when everything is there and the fingerprints match', () => {
    const present = new Map([
      [APP_ENTRY, 'h1'],
      ['assets/x.js', 'h2']
    ])
    expect(checkApp(m, present)).toEqual({ ok: true })
  })

  it('does not install when even one file has not arrived (never make a blank screen)', () => {
    const out = checkApp(m, new Map([[APP_ENTRY, 'h1']]))
    expect(out.ok).toBe(false)
    expect(out.ok === false && out.missing).toEqual(['assets/x.js'])
  })

  it('does not install on a fingerprint mismatch (it counts as still in transit)', () => {
    const out = checkApp(
      m,
      new Map([
        [APP_ENTRY, 'h1'],
        ['assets/x.js', 'ちがう']
      ])
    )
    expect(out.ok).toBe(false)
  })

  it('does not install a delivery with no entry point', () => {
    const out = checkApp(manifest([file('assets/x.js', 'h2')]), new Map([['assets/x.js', 'h2']]))
    expect(out.ok).toBe(false)
    expect(out.ok === false && out.missing).toEqual([APP_ENTRY])
  })

  it('does not install an unknown version', () => {
    const out = checkApp({ ...m, version: 99 }, new Map([[APP_ENTRY, 'h1']]))
    expect(out.ok).toBe(false)
  })
})

describe('whether to go and fetch it', () => {
  const m = manifest([file(APP_ENTRY, 'h1')])

  it('does not fetch what is installed already', () => {
    expect(shouldInstall(m, m.build, [])).toBe(false)
  })

  it('fetches something newer', () => {
    expect(shouldInstall(m, 'ふるい', [])).toBe(true)
  })

  it('does not go back to one that failed to come up (that would trap you until you plug in)', () => {
    expect(shouldInstall(m, 'ふるい', [m.build])).toBe(false)
  })
})

describe('reading the manifest', () => {
  it('drops a name pointing outside the manifest (it decides where files land, so it is never trusted)', () => {
    const text = JSON.stringify({
      version: 1,
      build: 'b',
      publishedAt: 'x',
      files: [
        { path: '../../逃げる', hash: 'h', bytes: 1 },
        { path: '/絶対', hash: 'h', bytes: 1 },
        { path: 'index.html', hash: 'h', bytes: 1 }
      ]
    })
    const out = parseAppManifest(text)
    expect(out.ok).toBe(true)
    expect(out.ok && out.value.files.map((f) => f.path)).toEqual(['index.html'])
  })

  it('does not throw even when it is corrupt (never stop the app in your hand)', () => {
    expect(parseAppManifest('{').ok).toBe(false)
    expect(parseAppManifest('{"version":1,"files":[]}').ok).toBe(false)
  })
})
