import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dbPath, userDataDir } from '../src/main/appPaths.js'
import { DRAFTS_KEY } from '../src/renderer/src/state/drafts.js'

/**
 * Keep the public name (Quuu) decoupled from the storage name (taskd).
 *
 * When renaming, fixing the storage location to match looks natural, but doing so
 * makes **existing tasks and run history appear to vanish**. It is fixable — the app
 * is just looking at an empty new location — but to the person using it, that is the
 * same as losing everything. This is a spot people are tempted to "tidy up", so make
 * it fail the moment someone aligns the names.
 */
const ROOT = join(import.meta.dirname, '..')

describe('application name', () => {
  it('the public name is Quuu (.app name and bundle ID)', () => {
    const yml = readFileSync(join(ROOT, 'electron-builder.yml'), 'utf8')
    expect(yml).toMatch(/^productName:\s*Quuu$/m)
    expect(yml).toMatch(/^appId:\s*net\.kinzal\.quuu$/m)
  })

  it('data location and DB name keep the old name (never lose sight of what already exists)', () => {
    const saved = process.env.QUUU_USER_DATA
    delete process.env.QUUU_USER_DATA
    try {
      expect(userDataDir()).toMatch(/Library\/Application Support\/taskd$/)
      expect(dbPath()).toMatch(/\/taskd\.db$/)
    } finally {
      if (saved !== undefined) process.env.QUUU_USER_DATA = saved
    }
  })

  it("Electron's userData is also decided by appPaths (never derived from the name)", () => {
    // Electron's default userData is derived from **the app's name**. It holds
    // localStorage (pane widths, ordering, drafts) and cookies, so making this
    // conditional would move just the UI state elsewhere the moment the app is
    // renamed. Keeping the DB under the old name would not help.
    const index = readFileSync(join(ROOT, 'src/main/index.ts'), 'utf8')
    expect(index).toContain("app.setPath('userData', userDataDir())")
    expect(index).not.toMatch(/if \(process\.env\.QUUU_USER_DATA\)/)
  })

  it('localStorage keys holding UI state also keep the old name', () => {
    expect(DRAFTS_KEY).toBe('taskd.drafts.v1')
    const store = readFileSync(join(ROOT, 'src/renderer/src/state/store.ts'), 'utf8')
    for (const key of ['taskd.layout.', 'taskd.table.', 'taskd.target.']) {
      expect(store).toContain(key)
    }
  })
})
