import { cliForCommand, cliForId } from '../agent-clis/registry.js'

export type LogAdapter =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'grok'
  | 'copilot'
  | 'agy'
  | 'opencode'
  | 'stdout'

export const IMPORTABLE_ADAPTERS: LogAdapter[] = [
  'claude',
  'codex',
  'cursor',
  'grok',
  'copilot',
  'agy',
  'opencode'
]

export function adapterOfExternalKey(externalKey: string | null): LogAdapter | null {
  if (!externalKey) return null
  const prefix = externalKey.split(':', 1)[0]
  return IMPORTABLE_ADAPTERS.find((a) => a === prefix) ?? null
}

/** Old runs did not save their adapter. Prefer recorded provenance over a rewritten definition. */
export function legacyRunAdapter(
  run: { command: string; externalKey?: string | null },
  configured: { command: string; logAdapter: LogAdapter } | null
): LogAdapter {
  const external = adapterOfExternalKey(run.externalKey ?? null)
  if (external) return external
  const basename = (command: string): string => command.trim().split('/').pop() ?? ''
  if (configured && basename(configured.command) === basename(run.command)) return configured.logAdapter
  const cli = cliForCommand(run.command)
  return IMPORTABLE_ADAPTERS.find(id => cli !== null && cliForId(id) === cli) ?? 'stdout'
}
