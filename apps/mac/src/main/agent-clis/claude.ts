import type { CliDriver } from './types.js'

/** Argument spellings measured against the installed CLI; user templates remain authoritative. */
export const claudeCli: CliDriver = {
  command: 'claude',
  name: 'Claude Code', resume: (id) => ['--resume', id], prompt: { kind: 'positional' },
  argsTemplate: ['-p', '--session-id', '{{sessionId}}', '--model', '{{model}}', '--permission-mode', 'bypassPermissions', '--', '{{prompt}}'],
  resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '--model', '{{model}}', '--permission-mode', 'bypassPermissions', '--', '{{prompt}}']
}
