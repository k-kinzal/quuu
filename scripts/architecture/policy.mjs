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
const isApi = file => /^apps\/mac\/src\/api\/(types\.ts|schemas\/[^/]+\.ts|events\.ts)$/.test(file)
const isChannel = file => file === 'apps/mac/src/api/channels.ts'
const receptions = new Set(['main/api', 'main/ipc', 'main/servers', 'main/desktop', 'main/composition'])
export function layerViolation(from, to, typeOnly = false) {
  const source = layerOf(from), target = layerOf(to)
  if (source === 'api' && target !== 'api') return 'public contracts must not import implementation or transport'
  if (source === 'client' && !['api', 'client'].includes(target)) return 'HTTP clients depend only on the public contract and generated protocol'
  if (source === 'cli' && !['api', 'client', 'cli'].includes(target)) return 'CLI operations must go through the HTTP client'
  if ((source.startsWith('renderer/') || source === 'preload') && ['client', 'cli', 'main/servers'].includes(target)) return 'desktop operations must not use the HTTP client or servers'
  if (target === 'api' && source !== 'api') {
    if (['client', 'cli', 'preload'].includes(source) || receptions.has(source)) return null
    if (source.startsWith('renderer/') && (typeOnly && isApi(to) || isChannel(to) && from.endsWith('/main.tsx'))) return null
    return 'features do not depend on public wire contracts; renderer imports only API types'
  }
  if (source.startsWith('main/') && !receptions.has(source) && ['main/api', 'main/servers', 'main/ipc', 'main/desktop'].includes(target)) return 'features must not depend on reception or desktop composition'
  if (source === 'main/api' && ['main/servers', 'main/ipc', 'main/desktop'].includes(target)) return 'operation reception must not depend on a transport or desktop implementation'
  if (source === 'main/servers' && ['main/db', 'main/tasks', 'main/execution', 'main/ipc', 'main/desktop'].includes(target)) return 'servers call the operation reception, not storage or feature implementations'
  if (source === 'main/agent-clis' && target.startsWith('main/') && target !== source) return 'CLI drivers must not depend on Quuu or its adapters'
  const provider = /^apps\/mac\/src\/main\/agent-adapters\/(claude|codex|cursor|grok|copilot|agy|opencode|stdout)\//
  if (provider.test(to) && source !== 'main/agent-adapters') return 'provider formats are private to agent adapters; use the adapter registry'
  if (source === 'main/agent-adapters' && ['main/db', 'main/tasks', 'main/import'].includes(target)) return 'adapters translate provider evidence; Quuu owns persistence and task policy'
  if (source === 'main/agent-adapters' && target === 'main/execution' && !(typeOnly && to.endsWith('/types.ts'))) return 'adapters must not depend on execution management'
  if (['main/execution', 'main/session', 'main/import', 'main/report', 'main/mobile-sync'].includes(source) && target === 'main/agent-clis' && !typeOnly) return 'Quuu flows must invoke CLIs through an agent adapter'
  if (from.split('/').includes('shared') || to.split('/').includes('shared')) return 'shared is forbidden'
  if (from.startsWith('apps/mac/') && to.startsWith('apps/mobile/') || from.startsWith('apps/mobile/') && to.startsWith('apps/mac/')) return 'cross-app source imports are forbidden'
  if (source.startsWith('renderer/') && target.startsWith('main/')) return 'renderer must not import main implementation'
  if (source.startsWith('main/') && target.startsWith('renderer/')) return 'main must not depend on the View'
  if (target === 'preload' && source !== 'preload') {
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
