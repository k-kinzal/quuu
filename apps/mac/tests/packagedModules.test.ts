import { createPackage } from '@electron/asar'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { missingModules } from '../scripts/verify-packaged-modules.mjs'

let directory: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'quuu-packaged-modules-')) })
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

async function archive(files: Record<string, string>): Promise<string> {
  const app = join(directory, 'app')
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dirname(join(app, file)), { recursive: true })
    await writeFile(join(app, file), content)
  }
  const target = join(directory, 'app.asar')
  await createPackage(app, target)
  return target
}
const manifest = (dependencies: Record<string, string> = {}): string => JSON.stringify({ dependencies })

it('reports a dependency of an imported package that the archive left out', async () => {
  const target = await archive({
    'out/main/index.js': 'import { fromMarkdown } from "mdast-util-from-markdown"\nimport { app } from "electron"\nimport "node:fs"\nimport "./chunk.js"',
    'node_modules/mdast-util-from-markdown/package.json': manifest({ micromark: '^4', '@types/mdast': '^4' }),
    'node_modules/micromark/package.json': manifest({ 'micromark-util-subtokenize': '^2' })
  })
  expect(missingModules(target)).toEqual(['micromark-util-subtokenize (needed by micromark)'])
})

it('accepts an archive whose imports resolve, including nested and scoped packages', async () => {
  const target = await archive({
    'out/main/index.js': 'const { z } = await import("zod")\nimport { McpServer } from "@modelcontextprotocol/sdk/server/index.js"',
    'out/preload/index.cjs': 'const { ipcRenderer } = require("electron")',
    'node_modules/zod/package.json': manifest(),
    'node_modules/@modelcontextprotocol/sdk/package.json': manifest({ ajv: '^8' }),
    'node_modules/@modelcontextprotocol/sdk/node_modules/ajv/package.json': manifest()
  })
  expect(missingModules(target)).toEqual([])
})
