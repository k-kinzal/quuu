/** Copy for the label tables in `model/labels.ts` (statuses, adapters, modes). */
export const labels = {
  taskStatus: {
    draft: 'Draft',
    held: 'Held',
    queued: 'Queued',
    running: 'Running',
    review: 'Review',
    failed: 'Failed',
    done: 'Done'
  },
  dependsMode: {
    done: 'When done',
    finished: 'When finished'
  },
  runStatus: {
    starting: 'Starting',
    running: 'Running',
    succeeded: 'Succeeded',
    failed: 'Failed',
    limited: 'Limit',
    canceled: 'Canceled',
    timeout: 'Timed out'
  },
  logAdapter: {
    claude: 'Claude Code (session logs in ~/.claude)',
    codex: 'Codex (session logs in ~/.codex)',
    cursor: 'Cursor (session logs in ~/.cursor/chats)',
    grok: 'Grok (session logs in ~/.grok/sessions)',
    copilot: 'GitHub Copilot (session logs in ~/.copilot)',
    stdout: 'Standard output log'
  },
  groupStrategy: {
    priority: 'First free slot in defined order',
    'round-robin': 'Rotate in turn',
    'least-busy': 'Pick the least busy'
  },
  runErrorKind: {
    limit: 'Limit / rate limited',
    auth: 'Authentication error',
    timeout: 'Timed out',
    spawn: 'Failed to launch',
    'nonzero-exit': 'Exited with an error',
    orphaned: 'Process disappeared',
    canceled: 'Canceled',
    'no-agent': 'No agent resolved'
  },
  commitIdentityMode: {
    inherit: 'Follow the app setting',
    off: 'Do not pass an identity',
    custom: "This project's App"
  },
  addAction: {
    draft: 'Add as draft',
    held: 'Add held',
    queued: 'Add',
    now: 'Run now'
  }
}
