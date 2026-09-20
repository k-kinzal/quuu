import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openExternalLink } from '../src/main/platform/externalLinks.js'

const { launch, openExternal, showItemInFolder } = vi.hoisted(() => ({
  launch: vi.fn().mockResolvedValue(undefined),
  openExternal: vi.fn().mockResolvedValue(undefined),
  showItemInFolder: vi.fn()
}))
vi.mock('../src/main/platform/launch.js', () => ({ launch }))
vi.mock('electron', () => ({ shell: { openExternal, showItemInFolder } }))

let directory: string
beforeEach(async () => {
  vi.clearAllMocks()
  directory = await mkdtemp(join(tmpdir(), 'quuu-path-links-'))
})
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

it('opens a directory in Finder rather than revealing its parent', async () => {
  await openExternalLink(directory)
  expect(launch).toHaveBeenCalledTimes(1)
  expect(launch).toHaveBeenCalledWith(['-a', 'Finder', directory])
  expect(showItemInFolder).not.toHaveBeenCalled()
  expect(openExternal).not.toHaveBeenCalled()
})

it('reveals files without launching their default application', async () => {
  const file = join(directory, 'result.command')
  await writeFile(file, 'echo should-not-run')
  await openExternalLink(file)
  expect(showItemInFolder).toHaveBeenCalledTimes(1)
  expect(showItemInFolder).toHaveBeenCalledWith(file)
  expect(launch).not.toHaveBeenCalled()
  expect(openExternal).not.toHaveBeenCalled()
})

it('uses Finder explicitly even for an application bundle', async () => {
  const bundle = join(directory, 'Example.app')
  await mkdir(bundle)
  await openExternalLink(bundle)
  expect(launch).toHaveBeenCalledTimes(1)
  expect(launch).toHaveBeenCalledWith(['-a', 'Finder', bundle])
})

it('decodes local links exactly once and expands the home directory', async () => {
  const path = join(directory, '日本語 data #1%20?')
  await mkdir(path)
  await openExternalLink(path.split('/').map(encodeURIComponent).join('/'))
  await openExternalLink(pathToFileURL(path).href)
  await openExternalLink(`~/${relative(homedir(), path).split('/').map(encodeURIComponent).join('/')}`)
  expect(launch.mock.calls).toEqual(Array.from({ length: 3 }, () => [['-a', 'Finder', path]]))
})

it('reports unavailable paths without opening Finder or falling back to an application', async () => {
  await expect(openExternalLink(join(directory, 'missing'))).rejects.toThrow(/missing/)
  expect(launch).not.toHaveBeenCalled()
  expect(showItemInFolder).not.toHaveBeenCalled()
  expect(openExternal).not.toHaveBeenCalled()
})

it.each(['javascript:alert(1)', 'data:text/html,test', './relative', '//server/share', 'file://server/share', '/tmp/%00bad'])('rejects unsupported destination %s', async href => {
  await expect(openExternalLink(href)).rejects.toThrow()
  expect(launch).not.toHaveBeenCalled()
  expect(showItemInFolder).not.toHaveBeenCalled()
  expect(openExternal).not.toHaveBeenCalled()
})

it.each(['https://example.com/docs', 'http://example.com', 'mailto:a@example.com'])('keeps external link %s working', async href => {
  await openExternalLink(href)
  expect(openExternal).toHaveBeenCalledTimes(1)
  expect(openExternal).toHaveBeenCalledWith(href)
  expect(launch).not.toHaveBeenCalled()
})
