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
/**
 * The CLI a command names: `/opt/homebrew/bin/claude`, `C:\\…\\claude.exe` and `claude.cmd` are all
 * `claude`. Windows spells the same program with an extension that says only how it is started.
 */
export function commandName(command: string): string {
  return (command.trim().split(/[\\/]/).filter(Boolean).pop() ?? '').replace(/\.(exe|cmd|bat|com)$/i, '')
}
export function cliForCommand(command: string): CliDriver | null {
  const name = commandName(command)
  return Object.values(drivers).find(driver => driver.command === name) ?? null
}
