import type { CliDriver } from './types.js'

/** Argument spellings measured against the installed CLI; user templates remain authoritative. */
export const cursorCli: CliDriver = {
  command: 'cursor-agent',
  name: 'Cursor',
  resume: (id) => ['--resume', id],
  // Same as Claude Code: `-p/--print` is a flag, the prompt is a positional
  prompt: { kind: 'positional' },
  argsTemplate: ['--resume', '{{sessionId}}', '-p', '--force', '--', '{{prompt}}'],
  resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '--force', '--', '{{prompt}}']
}
