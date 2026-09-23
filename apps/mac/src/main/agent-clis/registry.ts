import { agyCli } from './agy.js'
import { claudeCli } from './claude.js'
import { codexCli } from './codex.js'
import { copilotCli } from './copilot.js'
import { cursorCli } from './cursor.js'
import { grokCli } from './grok.js'
import { opencodeCli } from './opencode.js'
import type { CliDriver } from './types.js'

const drivers: Record<string, CliDriver> = { claude: claudeCli, codex: codexCli, cursor: cursorCli, grok: grokCli, agy: agyCli, opencode: opencodeCli, copilot: copilotCli }
export function cliForId(id: string): CliDriver | null { return drivers[id] ?? null }
export function cliForCommand(command: string): CliDriver | null {
  const name = command.trim().split('/').filter(Boolean).pop()
  return Object.values(drivers).find(driver => driver.command === name) ?? null
}
