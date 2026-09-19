/** Checks distribution units and the boundaries of Electron privileges and public contracts. */
export const packageDependencies = {
  '@design-system/react': [],
  quuu: ['@design-system/react'],
  '@quuu/mobile': ['@design-system/react']
}
export const purePackages = new Set()
export function layerOf(file) {
  if (file.startsWith('apps/mac/src/')) {
    const local = file.slice('apps/mac/src/'.length)
    if (local.startsWith('main/')) return `main/${local.split('/').length > 2 ? local.split('/')[1] : 'composition'}`
    if (local.startsWith('renderer/')) return `renderer/${local.split('/')[2] ?? 'composition'}`
    return local.split('/')[0]
  }
  if (file.startsWith('apps/mobile/src/')) return `mobile/${file.split('/')[3]}`
  return 'package'
}
const isApi = file => /^apps\/mac\/src\/preload\/(api\.ts|api\/[^/]+\.ts)$/.test(file)
const isContract = file => ['apps/mac/src/preload/contract.ts','apps/mac/src/preload/events.ts'].includes(file)
const isChannel = file => file === 'apps/mac/src/preload/channels.ts'
const isIpcOwner = file => file.startsWith('apps/mac/src/main/ipc/') || ['apps/mac/src/main/index.ts','apps/mac/src/main/menus.ts'].includes(file)
export function layerViolation(from, to, typeOnly = false) {
  const source = layerOf(from), target = layerOf(to)
  if (from.split('/').includes('shared') || to.split('/').includes('shared')) return 'shared is forbidden'
  if (from.startsWith('apps/mac/') && to.startsWith('apps/mobile/') || from.startsWith('apps/mobile/') && to.startsWith('apps/mac/')) return 'cross-app source imports are forbidden'
  if (source.startsWith('renderer/') && target.startsWith('main/')) return 'renderer must not import main implementation'
  if (source.startsWith('main/') && target.startsWith('renderer/')) return 'main must not depend on the View'
  if (target === 'preload' && source !== 'preload') {
    if (typeOnly && isApi(to) && (source.startsWith('renderer/') || isIpcOwner(from))) return null
    if (isIpcOwner(from) && (isApi(to) || isContract(to) || isChannel(to))) return null
    if (isChannel(to) && from === 'apps/mac/src/renderer/src/main.tsx') return null
    return 'cross-process imports are limited to public API types, the IPC contract, and connection channels'
  }
  if (source === 'preload' && target !== 'preload') return 'preload must not import app logic'
  if (source === 'renderer/model' && target.startsWith('renderer/') && target !== 'renderer/model') return 'view models must not depend on screens, the store, or interactions'
  if (source === 'renderer/ui' && target.startsWith('renderer/') && !['renderer/ui','renderer/model'].includes(target)) return 'ui must not depend on screens, the store, or interactions'
  if (source === 'renderer/state' && target.startsWith('renderer/') && !['renderer/state','renderer/model'].includes(target)) return 'state must not depend on screens or interactions'
  if (source === 'renderer/interaction' && ['renderer/components','renderer/views'].includes(target)) return 'interactions must not depend on screen composition'
  if (source === 'mobile/bridge' && target.startsWith('mobile/') && !['mobile/bridge','mobile/sync'].includes(target)) return 'bridge must not depend on mobile screens'
  if (source === 'mobile/sync' && target.startsWith('mobile/') && target !== 'mobile/sync') return 'the sync wire format must not depend on screens or the bridge implementation'
  if (source === 'main/tasks' && /main\/execution\/(scheduler|runner|recovery)\.ts$/.test(to)) return 'task operations must not import concrete execution management'
  if (source === 'main/db' && /(?:operations|bootstrap|scheduler|runner|recovery|service)\.ts$/.test(to)) return 'the storage layer must not depend on operations or startup composition'
  if (source === 'main/tasks' && target === 'main/mobile-sync') return 'task operations must not depend on the wire format'
  if (source === 'main/review' && target === 'main/execution') return 'review must not depend on execution management'
  if (source === 'main/terminal' && target === 'main/review') return 'terminal must not depend on review'
  return null
}
