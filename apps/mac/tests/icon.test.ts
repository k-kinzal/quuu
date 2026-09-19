import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * An icon is "one original plus its generated files", and the link between them
 * shows up as broken only at run time (when the OS looks the icon up), never at build time.
 * A mismatched name still lets `npm run dist` and `ios:build` succeed, so it is pinned down here.
 *
 * **One original per product.** Separate artwork for Mac and iPhone creates a state where only one
 * of them has been redrawn, and nobody notices until the two are seen side by side.
 */
const REPO = join(import.meta.dirname, '..', '..', '..')
const ICON = join(REPO, 'brand', 'icon.icon')
const MAC = join(REPO, 'apps', 'mac', 'build')
const IOS = join(REPO, 'apps', 'mobile', 'ios', 'Quuu')

type IconJson = {
  groups: {
    layers: { name: string; 'image-name'?: string; glass?: boolean }[]
    specular?: boolean
    shadow?: { opacity: number }
    translucency?: { enabled: boolean }
  }[]
  'supported-platforms': unknown
}

const iconJson = JSON.parse(readFileSync(join(ICON, 'icon.json'), 'utf8')) as IconJson
const builderYml = readFileSync(join(MAC, '..', 'electron-builder.yml'), 'utf8')
const iosPlist = readFileSync(join(REPO, 'apps', 'mobile', 'ios', 'Info.plist'), 'utf8')
const iosProject = readFileSync(
  join(REPO, 'apps', 'mobile', 'ios', 'Quuu.xcodeproj', 'project.pbxproj'),
  'utf8'
)

describe('the application icon', () => {
  it('has every image the original references in Assets', () => {
    const names = iconJson.groups.flatMap((g) => g.layers.map((l) => l['image-name']))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(name).toBeDefined()
      expect(existsSync(join(ICON, 'Assets', name!))).toBe(true)
    }
  })

  it('keeps the groups to four or fewer (beyond that Liquid Glass cannot break it apart)', () => {
    expect(iconJson.groups.length).toBeLessThanOrEqual(4)
  })

  it('draws no shadow, blur or gradient in the foreground SVG', () => {
    // The system adds those at run time. Drawing them yourself applies them twice.
    // Everything the original references is covered. Listing the names by hand lets a redrawn layer
    // slip past the check (it actually did), so they are read from icon.json.
    const names = iconJson.groups
      .flatMap((g) => g.layers.map((l) => l['image-name']!))
      .filter((name) => name.endsWith('.svg'))
    for (const name of names) {
      const svg = readFileSync(join(ICON, 'Assets', name), 'utf8')
      expect(svg).not.toMatch(/<filter|feGaussianBlur|feDropShadow|Gradient/)
    }
  })

  it('does not stack glass, specular highlight, shadow or transparency onto a finished PNG', () => {
    // Keep the color and texture of the given image. Unlike an SVG, a PNG already has its shading baked in.
    for (const group of iconJson.groups) {
      const layers = group.layers.filter((layer) => layer['image-name']?.endsWith('.png'))
      if (layers.length === 0) continue
      expect(group.specular).toBe(false)
      expect(group.shadow?.opacity).toBe(0)
      expect(group.translucency?.enabled).toBe(false)
      for (const layer of layers) {
        expect(layer.glass).toBe(false)
        const png = readFileSync(join(ICON, 'Assets', layer['image-name']!))
        expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
        expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(1024)
        expect(png.readUInt32BE(16)).toBe(png.readUInt32BE(20))
      }
    }
  })

  it('keeps exactly one original (no .icon inside the app)', () => {
    expect(existsSync(join(MAC, 'icon.icon'))).toBe(false)
    expect(existsSync(join(IOS, 'icon.icon'))).toBe(false)
  })
})

describe('the macOS build outputs', () => {
  it('has them all', () => {
    for (const f of ['Assets.car', 'icon.icns', 'icon.png']) {
      expect(existsSync(join(MAC, f))).toBe(true)
    }
  })

  it('matches CFBundleIconName to the name of the original', () => {
    // The icon name inside Assets.car is the name of the .icon (icon.icon -> "icon").
    // Get it wrong and macOS 26 cannot find the icon, leaving a gray box.
    expect(builderYml).toMatch(/CFBundleIconName:\s*icon\b/)
    expect(builderYml).toMatch(/from:\s*build\/Assets\.car/)
  })

  it('makes the PNG for the Dock 1024 square', () => {
    const png = readFileSync(join(MAC, 'icon.png'))
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    // IHDR puts width and height after the 8-byte signature plus 4 bytes of length and 4 of type
    expect(png.readUInt32BE(16)).toBe(1024)
    expect(png.readUInt32BE(20)).toBe(1024)
  })
})

describe('the iOS build outputs', () => {
  it('keeps the layered icon inside the target (carried as a resource, as it is)', () => {
    expect(existsSync(join(IOS, 'Assets.car'))).toBe(true)
  })

  it('matches CFBundleIconName to the name of the original', () => {
    expect(iosPlist).toMatch(/<key>CFBundleIconName<\/key>\s*<string>icon<\/string>/)
  })

  it('holds no legacy PNG - a double mask would leave a white rim', () => {
    for (const f of ['icon60x60@2x.png', 'icon76x76@2x~ipad.png']) {
      expect(existsSync(join(IOS, f)), f).toBe(false)
    }
    // Since it is absent, Info.plist must not point at it either (pointing at a missing file gives a gray box)
    expect(iosPlist).not.toMatch(/CFBundleIconFiles/)
  })

  it('requires iOS 18 or newer (the floor for Icon Composer)', () => {
    const targets = [...iosProject.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/g)].map((m) =>
      Number(m[1])
    )
    expect(targets.length).toBeGreaterThan(0)
    for (const t of targets) expect(t).toBeGreaterThanOrEqual(18)
  })
})
