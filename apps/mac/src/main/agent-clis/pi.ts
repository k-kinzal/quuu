import type { CliDriver } from './types.js'

/** Pi 1.1: JSON mode exits after one run; --approve trusts the project's resources. */
export const piCli: CliDriver = {
  command: 'pi',
  name: 'Pi',
  resume: id => ['--session', id],
  prompt: { kind: 'positional' },
  argsTemplate: ['--print', '--mode', 'json', '--approve', '--session-id', '{{sessionId}}', '--', '{{prompt}}'],
  resumeArgsTemplate: ['--print', '--mode', 'json', '--approve', '--session', '{{sessionId}}', '--', '{{prompt}}']
}
