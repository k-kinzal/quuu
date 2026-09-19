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
