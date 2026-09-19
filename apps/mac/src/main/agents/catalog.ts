import { t } from '../i18n/index.js'
import type { LogAdapter } from './cliAdapter.js'

/**
 * Keeps the name import stores and the CLI name shown on screen in step.
 *
 * These become rows in the agents table, so they are resolved when a row is written,
 * never at module load: the language is not settled until `initMainI18n`. Rows already
 * in a database keep the words they were created with.
 */
export function agentCliName(adapter: LogAdapter): string {
  return adapter === 'stdout' ? t('agentCatalog.stdout') : CLI_BRAND_NAME[adapter]
}

/** Brand names, which are the same in every language. */
const CLI_BRAND_NAME: Record<Exclude<LogAdapter, 'stdout'>, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  grok: 'Grok',
  copilot: 'GitHub Copilot'
}

export function externalAgentName(adapter: LogAdapter): string {
  return t('agentCatalog.external', { name: agentCliName(adapter) })
}
