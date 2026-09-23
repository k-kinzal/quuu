import type { CliDriver } from './types.js'

/** Argument spellings measured against the installed CLI; user templates remain authoritative. */
export const codexCli: CliDriver = {
  command: 'codex',
  name: 'Codex', resume: (id) => ['resume', id], prompt: { kind: 'positional' },
  argsTemplate: ['exec', '--skip-git-repo-check', '--', '{{prompt}}'],
  resumeArgsTemplate: [
    'exec',
    'resume',
    '{{sessionId}}',
    '--skip-git-repo-check',
    '--',
    '{{prompt}}'
  ]
}
