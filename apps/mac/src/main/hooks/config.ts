import { t } from '../i18n/index.js'
import type { ResolvedHook, TaskHook } from './types.js'

export const HOOK_DEFAULTS: Omit<ResolvedHook, 'id'> = {
  name: '', enabled: false, events: [], kind: 'agent', targetKind: 'agent', targetId: '',
  prompt: '', command: '', timeoutSeconds: 1200
}

export function resolveHooks(global: TaskHook[], project: TaskHook[]): ResolvedHook[] {
  const all = new Map(global.map(hook => [hook.id, hook]))
  for (const hook of project) {
    all.set(hook.id, { ...all.get(hook.id), ...Object.fromEntries(Object.entries(hook).filter(([, value]) => value !== undefined)), id: hook.id })
  }
  return [...all.values()].map(hook => ({ ...HOOK_DEFAULTS, ...hook }))
}

export function validateHooks(hooks: TaskHook[]): void {
  const ids = new Set<string>()
  for (const hook of hooks) {
    if (!hook.id || hook.id.startsWith('system:') || ids.has(hook.id)) throw new Error(t('hooks.invalidIds'))
    ids.add(hook.id)
  }
}
