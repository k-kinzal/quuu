import type { CliDriver } from './types.js'

/** Argument spellings measured against the installed CLI; user templates remain authoritative. */
export const opencodeCli: CliDriver = {
  command: 'opencode',
  name: 'opencode',
  resume: (id) => ['--session', id],
  // The prompt is a bare positional. See the `bare` style above for why nothing can be respelled
  prompt: { kind: 'bare' },
  argsTemplate: ['run', '--auto', '{{prompt}}'],
  resumeArgsTemplate: ['run', '--session', '{{sessionId}}', '--auto', '{{prompt}}']
}
