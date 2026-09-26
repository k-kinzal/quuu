import type { ToolCall } from './types.js'

/**
 * Which tools of the structured log run a shell command.
 *
 * Each CLI names its shell differently, and the name is the only thing that says whether a
 * result is a command's output (a commit receipt, a `cd`) or a file's contents that happen to
 * look like one. Every rule that reads commands off a session asks this one list, so a CLI
 * whose shell was added here is understood by all of them at once.
 */
export const SHELL_TOOLS = new Set([
  'Bash', 'Shell', 'exec', 'exec_command', 'shell', 'shell_command', 'run_in_terminal', 'write_stdin', 'wait'
])

export function isShellTool(name: string): boolean {
  return SHELL_TOOLS.has(name)
}

/** Keys under which a CLI hands its shell the command line, in order of preference. */
const COMMAND_KEYS = ['command', 'cmd', 'CommandLine']

/**
 * The command line a shell tool ran. null for a call that is not a shell, or names no command.
 *
 * A parser that already unpicked the target (Codex writes its calls as JavaScript) has put the
 * command there; the others hand the arguments over as named values.
 */
export function shellCommandOf(tool: ToolCall): string | null {
  if (!isShellTool(tool.name)) return null
  if (typeof tool.target === 'string' && tool.target.length > 0) return tool.target
  if (typeof tool.input === 'string') return tool.input
  if (tool.input && typeof tool.input === 'object') {
    const fields = tool.input as Record<string, unknown>
    for (const key of COMMAND_KEYS) {
      const value = fields[key]
      if (typeof value === 'string' && value.length > 0) return value
      if (Array.isArray(value)) {
        const parts = value.filter((part): part is string => typeof part === 'string')
        if (parts.length > 0) return parts.join(' ')
      }
    }
  }
  return null
}
