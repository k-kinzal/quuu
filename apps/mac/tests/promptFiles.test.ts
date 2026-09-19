import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { savePromptFiles } from '../src/main/platform/promptFiles.js'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'quuu-prompt-files-'))
  vi.stubEnv('QUUU_USER_DATA', directory)
})
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }) })

it('keeps clipboard bytes, extensions and duplicate names in distinct files that remain readable after another save', async () => {
  const files = [{ name: '図面.png', data: new Uint8Array([0, 255, 42]) }, { name: '図面.png', data: new Uint8Array([1, 2, 3]) }]
  const paths = await savePromptFiles(files)
  const second = await savePromptFiles(files)
  expect(new Set([...paths, ...second]).size).toBe(4)
  for (const [index, path] of paths.entries()) {
    expect(path.endsWith('図面.png')).toBe(true)
    expect(await readFile(path)).toEqual(Buffer.from(files[index].data))
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  }
})

it('confines clipboard names to the app staging directory, including path traversal and empty names', async () => {
  const paths = await savePromptFiles(['../../escape.pdf', '/elsewhere/absolute.txt', '..', '', 'line\nfile.png'].map(name => ({ name, data: new Uint8Array() })))
  expect(new Set(paths.map(dirname)).size).toBe(1)
  for (const path of paths) {
    expect(dirname(dirname(path))).toBe(join(directory, 'prompt-files'))
    expect(path).not.toContain('\n')
    expect((await stat(path)).size).toBe(0)
  }
})

it('removes partial files if any write fails instead of handing over incomplete attachments', async () => {
  await expect(savePromptFiles([
    { name: 'first.png', data: new Uint8Array([1]) },
    { name: 'x'.repeat(300), data: new Uint8Array([2]) }
  ])).rejects.toThrow()
  expect(await readdir(join(directory, 'prompt-files'))).toEqual([])
})
