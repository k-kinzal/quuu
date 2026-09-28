import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { isReleaseBuild } from '../src/main/updates/distribution.js'
import { hasUpdateSignature } from '../src/main/updates/signing.js'

let directory: string
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'quuu-distribution-')) })
afterEach(() => { rmSync(directory, { recursive: true, force: true }) })

it('enables updates only for a packaged Mac or Windows app marked as a GitHub Release', () => {
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ quuuDistribution: 'github-release' }))
  expect(isReleaseBuild(true, 'darwin', directory)).toBe(true)
  expect(isReleaseBuild(true, 'win32', directory)).toBe(true)
  expect(isReleaseBuild(false, 'darwin', directory)).toBe(false)
  expect(isReleaseBuild(false, 'win32', directory)).toBe(false)
  // No update engine and no feed for anything else
  expect(isReleaseBuild(true, 'linux', directory)).toBe(false)
})

it.each([
  '{}',
  '{"quuuDistribution":"local"}',
  '{"quuuDistribution":true}',
  'null',
  'invalid json'
])('keeps local, old, and unrecognized packages out of automatic updates: %s', metadata => {
  writeFileSync(join(directory, 'package.json'), metadata)
  expect(isReleaseBuild(true, 'darwin', directory)).toBe(false)
})

it('disables updates when bundle metadata cannot be read', () => {
  expect(isReleaseBuild(true, 'darwin', directory)).toBe(false)
})

it('requires a certificate signature that can authenticate a later build', () => {
  expect(hasUpdateSignature('Signature=adhoc\nTeamIdentifier=not set\n')).toBe(false)
  expect(hasUpdateSignature('code object is not signed at all')).toBe(false)
  expect(hasUpdateSignature('Authority=Developer ID Application: Example\nAuthority=Apple Root CA\n')).toBe(true)
})
