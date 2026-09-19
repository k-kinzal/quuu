import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en as mainEn } from '../src/main/i18n/en.js'
import { en as rendererEn } from '../src/renderer/src/model/i18n/en.js'
import { en as mobileEn } from '../../mobile/src/model/i18n/en.js'

/**
 * Display copy lives in the locale resources, and English is the source language.
 *
 * The `ja: typeof en` typing already makes a missing or extra Japanese key a type
 * error, so what types cannot see is the other direction: a `t()` call naming a key
 * nobody defined. i18next answers that by returning the key itself, so the mistake
 * ships as `composer.send` printed on a button — visible only to whoever opens that
 * screen, in the language nobody on the team is testing in.
 *
 * Keys built from a template literal (``t(`taskStatus.${status}`)``) cannot be read
 * statically, so their group is checked as a whole instead.
 */

const ROOT = join(import.meta.dirname, '..', '..')

function flatten(value: unknown, prefix = ''): Set<string> {
  const keys = new Set<string>()
  for (const [name, child] of Object.entries(value as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (child && typeof child === 'object') for (const nested of flatten(child, key)) keys.add(nested)
    else keys.add(key)
  }
  return keys
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    // The resources themselves are the definitions, not callers
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sources(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

/** Keys named by a plain string literal, which is what can be checked statically. */
function literalKeys(dir: string): Map<string, string> {
  const used = new Map<string, string>()
  for (const file of sources(dir)) {
    for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([A-Za-z0-9_.-]+)'/g)) {
      used.set(match[1], file)
    }
  }
  return used
}

/** Group prefixes reached through a template literal, e.g. ``t(`taskStatus.${status}`)``. */
function templateGroups(dir: string): Set<string> {
  const groups = new Set<string>()
  for (const file of sources(dir)) {
    for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*`([A-Za-z0-9_.-]+)\.\$\{/g)) {
      groups.add(match[1])
    }
  }
  return groups
}

const AREAS = [
  { name: 'Mac renderer', dir: join(ROOT, 'mac/src/renderer/src'), resources: rendererEn },
  { name: 'Mac main process', dir: join(ROOT, 'mac/src/main'), resources: mainEn },
  { name: 'iPhone app', dir: join(ROOT, 'mobile/src'), resources: mobileEn }
] as const

describe('every t() call names copy that exists', () => {
  for (const area of AREAS) {
    it(`${area.name}: no call reaches a key the resources do not define`, () => {
      const defined = flatten(area.resources)
      // A count-bearing call resolves through its plural variants
      const resolves = (key: string): boolean =>
        defined.has(key) || defined.has(`${key}_one`) || defined.has(`${key}_other`)

      const missing = [...literalKeys(area.dir)]
        .filter(([key]) => !resolves(key))
        .map(([key, file]) => `${key} (${file.slice(ROOT.length + 1)})`)

      expect(missing).toEqual([])
    })

    it(`${area.name}: every group built from a template literal exists`, () => {
      const groups = [...flatten(area.resources)].map((key) => key.split('.')[0])
      const missing = [...templateGroups(area.dir)].filter((group) => !groups.includes(group))

      expect(missing).toEqual([])
    })
  }
})

describe('the Mac and the iPhone say the same thing about the same state', () => {
  /*
   * The two apps keep their own resources (neither imports the other), so nothing but
   * this stops the words from drifting apart. A task that reads Review on the Mac and
   * something else on the phone stops looking like one product.
   */
  it('the shared status vocabulary is worded identically', () => {
    expect(mobileEn.taskStatus).toEqual(rendererEn.taskStatus)
    expect(mobileEn.runStatus).toEqual(rendererEn.runStatus)
    expect(mobileEn.dependsMode).toEqual(rendererEn.dependsMode)
    expect(mobileEn.addAction).toEqual(rendererEn.addAction)
  })

  it('the native menus use the same words as the screens', () => {
    expect(mainEn.taskStatus).toEqual(rendererEn.taskStatus)
    expect(mainEn.runStatus).toEqual(rendererEn.runStatus)
    expect(mainEn.addAction).toEqual(rendererEn.addAction)
  })
})
