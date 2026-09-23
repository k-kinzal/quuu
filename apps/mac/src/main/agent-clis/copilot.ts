import type { CliDriver } from './types.js'

/** Argument spellings measured against the installed CLI; user templates remain authoritative. */
export const copilotCli: CliDriver = {
  command: 'copilot',
  name: 'GitHub Copilot',
  /*
   * Copilot's `--resume` alone joins with `=`. Its help spells it `--resume[=value]`, and written
   * separately the ID is not read as its argument (same as the non-interactive side of `seed.ts`).
   */
  resume: (id) => [`--resume=${id}`],
  // `-p, --prompt <text>` takes the next argument as-is, `--help` included. Nothing to respell
  prompt: { kind: 'value' },
  argsTemplate: ['-p', '{{prompt}}', '--allow-all-tools', '--no-color'],
  resumeArgsTemplate: [
    '-p',
    '{{prompt}}',
    '--resume={{sessionId}}',
    '--allow-all-tools',
    '--no-color'
  ]
}
