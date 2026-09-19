import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { analyze, cyclesOf, importsOf } from './analyze.mjs'
import { layerViolation } from './policy.mjs'

const directories = []
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'quuu-architecture-'))
  directories.push(root)
  const write = (path, content) => {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  for (const [dir, name] of [['apps/mac','quuu'], ['apps/mobile','@quuu/mobile'], ['packages/design-system','@design-system/react']]) {
    write(`${dir}/package.json`, JSON.stringify({name, exports: {'.':'./src/index.ts'}, dependencies: name === '@design-system/react' ? {} : {'@design-system/react':'*'}}))
    const config = JSON.stringify({compilerOptions: {moduleResolution:'bundler',module:'esnext',baseUrl:'.',paths:{'@design-system/react':['../../packages/design-system/src/index.ts'],'@design-system/react/*':['../../packages/design-system/src/*']}}})
    for (const file of ['tsconfig.json','tsconfig.node.json','tsconfig.web.json','tsconfig.preload.json']) write(`${dir}/${file}`, config)
  }
  write('packages/design-system/src/index.ts', 'export interface Value { id: string }')
  return {root, write, issues: () => analyze(root).issues.join('\n')}
}
test('distinguishes type imports, re-exports, dynamic imports, and require', () => {
  const imports = importsOf('test.ts', `
    import type { T } from './types.js'
    export { value } from './value.js'
    type Module = typeof import('./module.js')
    const lazy = import('./lazy.js')
    const legacy = require('./legacy.js')
    const sqlite = nodeRequire('node:sqlite')
    import { type A } from './a.js'
  `)
  assert.deepEqual(imports.map(e => e.specifier), ['./types.js','./value.js','./module.js','./lazy.js','./legacy.js','node:sqlite','./a.js'])
  assert.deepEqual(imports.map(e => e.typeOnly), [true,false,true,false,false,false,true])
  assert.equal(imports[0].line, 2)
  assert.equal(importsOf('test.ts','import(name)')[0].specifier, null)
})
test('distinguishes shared branches from cycles', () => {
  const graph = new Map([['a',new Set(['b','c'])],['b',new Set(['c'])],['c',new Set()]])
  assert.deepEqual(cyclesOf(graph), [])
  graph.get('c').add('a')
  assert.deepEqual(cyclesOf(graph), [['a','b','c','a']])
})
for (const [from,to] of [
  ['shared/a.ts','main/bootstrap.ts'],
  ['renderer/src/model/a.ts','renderer/src/state/store.ts'],
  ['renderer/src/state/store.ts','renderer/src/interaction/a.ts'],
  ['renderer/src/ui/a.tsx','renderer/src/components/a.tsx'],
  ['renderer/src/components/a.tsx','main/bootstrap.ts'],
  ['main/review/service.ts','main/execution/runner.ts'],
  ['main/db/repo.ts','main/bootstrap.ts'],
  ['main/terminal/service.ts','main/review/service.ts'],
  ['main/tasks/operations.ts','main/execution/scheduler.ts'],
  ['main/tasks/operations.ts','main/mobile-sync/protocol.ts'],
  ['main/tasks/operations.ts','preload/api.ts'],
  ['preload/index.ts','main/tasks/operations.ts']
]) test(`rejects a reverse reference: ${from} → ${to}`, () => {
  assert.ok(layerViolation(`apps/mac/src/${from}`,`apps/mac/src/${to}`,true))
})
test('the contract implementation lives in the IPC layer; the renderer uses only generated API types', () => {
  assert.equal(layerViolation('apps/mac/src/main/ipc/index.ts','apps/mac/src/preload/contract.ts'),null)
  assert.equal(layerViolation('apps/mac/src/main/ipc/index.ts','apps/mac/src/preload/api/tasks.ts'),null)
  assert.equal(layerViolation('apps/mac/src/renderer/src/state/client.ts','apps/mac/src/preload/api.ts',true),null)
  assert.ok(layerViolation('apps/mac/src/renderer/src/state/client.ts','apps/mac/src/preload/contract.ts'))
  assert.ok(layerViolation('apps/mac/src/renderer/src/state/store.ts','apps/mac/src/preload/api/tasks.ts'))
})
test('detects runtime code in the API declaration and re-exported main types', () => {
  const {write,issues} = fixture()
  write('apps/mac/src/main/tasks/types.ts','export interface Task { id: string }')
  write('apps/mac/src/preload/api.ts',"export type { Task } from '../main/tasks/types.js'; export const value = 1")
  assert.match(issues(),/runtime code in the API declaration/)
  assert.match(issues(),/preload must not import app logic/)
})
test('a declared app can use the Design System public entry', () => {
  const {write,issues} = fixture()
  write('apps/mac/src/renderer/src/ui/a.ts',"export type { Value } from '@design-system/react'")
  assert.equal(issues(),'')
})
for (const specifier of ['../../../../../../packages/design-system/src/index.js','@design-system/react/internal']) test(`rejects bypassing the public entry: ${specifier}`, () => {
  const {write,issues} = fixture()
  write('packages/design-system/src/internal.ts','export interface Value { id: string }')
  write('apps/mac/src/renderer/src/ui/a.ts',`export type { Value } from '${specifier}'`)
  assert.match(issues(),/public entry|non-public entry/)
})
test('detects dependencies not declared in the manifest', () => {
  const {write,issues} = fixture()
  write('apps/mac/package.json',JSON.stringify({name:'quuu'}))
  write('apps/mac/src/renderer/src/ui/a.ts',"export type { Value } from '@design-system/react'")
  assert.match(issues(),/missing from manifest/)
})
test('rejects app type imports from the Design System too', () => {
  const {write,issues} = fixture()
  write('apps/mac/src/main/tasks/types.ts','export interface Task { id: string }')
  write('packages/design-system/src/index.ts',"export type { Task } from '../../../apps/mac/src/main/tasks/types.js'")
  assert.match(issues(),/dependency direction violation/)
})
test('retired packages and shared cannot come back', () => {
  const {write,issues} = fixture()
  write('packages/domain/package.json',JSON.stringify({name:'@quuu/domain'}))
  write('apps/mac/src/shared/a.ts',"import type { T } from '@quuu/domain'")
  assert.match(issues(),/responsibility and dependency direction are undefined/)
  assert.match(issues(),/shared is forbidden/)
  assert.match(issues(),/retired boundary/)
})
for (const dir of ['apps/mac/src/renderer/src','apps/mac/src/preload','apps/mobile/src/bridge','packages/design-system/src']) test(`Node privileges are not allowed in: ${dir}`, () => {
  const {write,issues} = fixture()
  write(`${dir}/a.ts`,"import { readFileSync } from 'node:fs'")
  assert.match(issues(),/OS dependency/)
})
test('relative paths cannot cross app boundaries either', () => {
  const {write,issues} = fixture()
  write('apps/mobile/src/sync/protocol.ts','export interface Task {id:string}')
  write('apps/mac/src/main/tasks/a.ts',"export type { Task } from '../../../../mobile/src/sync/protocol.js'")
  assert.match(issues(),/cross-app source import/)
})
test('detects unresolved imports and type cycles from real sources', () => {
  const {write,issues} = fixture()
  write('apps/mac/src/main/tasks/a.ts',"export type { B } from './b.js'; import './missing.js'; export interface A {id:string}")
  write('apps/mac/src/main/tasks/b.ts',"export type { A } from './a.js'; export interface B {id:string}")
  assert.match(issues(),/unresolvable dependency/)
  assert.match(issues(),/file cycle/)
})
