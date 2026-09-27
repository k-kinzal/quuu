import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { isReleaseBuild } from '../src/main/updates/distribution.js'

let directory: string
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'quuu-distribution-')) })
afterEach(() => { rmSync(directory, { recursive: true, force: true }) })

it('enables updates only for a packaged Mac bundle marked as a GitHub Release', () => {
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ quuuDistribution: 'github-release' }))
  expect(isReleaseBuild(true, 'darwin', directory)).toBe(true)
  expect(isReleaseBuild(false, 'darwin', directory)).toBe(false)
  expect(isReleaseBuild(true, 'win32', directory)).toBe(false)
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
