import type { CliDriver } from './types.js'

/** Argument spellings measured against the installed CLI; user templates remain authoritative. */
export const agyCli: CliDriver = {
  command: 'agy',
  name: 'Antigravity',
  // The CLI's own word for a session is a conversation
  resume: (id) => ['--conversation', id],
  /*
   * `--print` **takes the prompt as its value**. Written separately it swallows whatever comes
   * next and says so ("--print took \"--dangerously-skip-permissions\" as its prompt" - measured),
   * and it tells you the same fix: attach it with `=`. Joined that way any text is read as text.
   */
  prompt: { kind: 'attached', flags: ['-p', '--print', '--prompt'], as: '--print' },
  argsTemplate: [
    '--add-dir',
    '{{projectPath}}',
    '--dangerously-skip-permissions',
    '--output-format',
    'stream-json',
    '--print={{prompt}}'
  ],
  resumeArgsTemplate: [
    '--conversation',
    '{{sessionId}}',
    '--add-dir',
    '{{projectPath}}',
    '--dangerously-skip-permissions',
    '--output-format',
    'stream-json',
    '--print={{prompt}}'
  ]
}
