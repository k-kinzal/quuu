import type { CliDriver } from './types.js'

/** Argument spellings measured against the installed CLI; user templates remain authoritative. */
export const grokCli: CliDriver = {
  command: 'grok',
  name: 'Grok',
  resume: (id) => ['--resume', id],
  /*
   * Grok is the one that takes the prompt as an option value (`-p, --single <PROMPT>`), and clap
   * refuses to fill a value from a `-`-leading token — it even suggests `--`, which here only
   * produces "a value is required for '--single'". Joined with `=` it is read as text.
   */
  prompt: { kind: 'attached', flags: ['-p', '--single'], as: '--single' },
  argsTemplate: [
    '--single={{prompt}}',
    '--session-id',
    '{{sessionId}}',
    '--permission-mode',
    'bypassPermissions'
  ],
  resumeArgsTemplate: [
    '--resume',
    '{{sessionId}}',
    '--single={{prompt}}',
    '--permission-mode',
    'bypassPermissions'
  ]
}
