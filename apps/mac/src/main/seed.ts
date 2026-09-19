import type { LogAdapter } from './agents/cliAdapter.js'
import { DEFAULT_LIMIT_PATTERNS } from './agents/defaults.js'
import type { AgentInput } from './agents/types.js'
import type { Db } from './db/database.js'
import * as repo from './db/repo.js'
import { commandExists, resolveLoginPath } from './platform/shellEnv.js'
import { t } from './i18n/index.js'

/**
 * Definitions for CLIs other than Claude. **Seeded only where the command exists.**
 *
 * The arguments were verified empirically (actually run on this machine,
 * confirming down to the session log being created under the ID Quuu assigned).
 * Every CLI needs these 4 things in common; missing any breaks silently.
 *
 *   1. Runs non-interactively, once, and exits   … without exiting, the Run never settles
 *   2. Never asks for permission                 … nobody answers, so it waits forever
 *   3. Session ID can be passed / recovered      … this ties together the conversation view and resumed runs
 *   4. The prompt is handed over as a value      … a message opening with `--cached` is text, not options
 *
 * CLIs that can't take 3 as an argument (Codex / Copilot) get the CLI-chosen ID
 * recovered afterwards (sessionIdentity.ts). CLIs that can must include `{{sessionId}}`.
 */
const OPTIONAL_AGENTS: Array<
  Pick<
    AgentInput,
    'name' | 'command' | 'argsTemplate' | 'resumeArgsTemplate' | 'concurrency'
  > & { logAdapter: LogAdapter; descriptionKey: string }
> = [
    {
      name: 'Codex',
      descriptionKey: 'seed.codex',
      command: 'codex',
      argsTemplate: ['exec', '--skip-git-repo-check', '--', '{{prompt}}'],
      /*
       * `codex exec resume <SESSION_ID> <PROMPT>` (observed on v0.149.0).
       *
       * There is no way to pass an ID on the first run (`codex exec` picks its
       * own), so Quuu picks up the ID the stdout header announces and records
       * it (`session/stdoutSessionId.ts`). The `{{sessionId}}` used here is
       * that recovered ID.
       */
      resumeArgsTemplate: [
        'exec',
        'resume',
        '{{sessionId}}',
        '--skip-git-repo-check',
        '--',
        '{{prompt}}'
      ],
      concurrency: 1,
      logAdapter: 'codex'
    },
    {
      name: 'Cursor',
      descriptionKey: 'seed.cursor',
      command: 'cursor-agent',
      // -p is non-interactive. --force never asks for permission. --resume also creates a new chat
      argsTemplate: ['--resume', '{{sessionId}}', '-p', '--force', '--', '{{prompt}}'],
      resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '--force', '--', '{{prompt}}'],
      concurrency: 1,
      logAdapter: 'cursor'
    },
    {
      name: 'Grok',
      descriptionKey: 'seed.grok',
      command: 'grok',
      /*
       * -s sets the ID of a new session. It can't take an existing ID, so resuming uses -r.
       * Grok is the one CLI that takes the prompt as an option value, so it is joined with `=`
       * (`agents/cli.ts` explains why a separate `-p {{prompt}}` breaks).
       */
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
      ],
      concurrency: 1,
      logAdapter: 'grok'
    },
    {
      name: 'GitHub Copilot',
      descriptionKey: 'seed.copilot',
      command: 'copilot',
      // --allow-all-tools is required for non-interactive runs (stated in the help)
      argsTemplate: ['-p', '{{prompt}}', '--allow-all-tools', '--no-color'],
      /*
       * --resume takes an optional value, so written separately as
       * `--resume <id>` the ID is not read as its argument. Join with `=`,
       * matching the example in the help.
       */
      resumeArgsTemplate: [
        '-p',
        '{{prompt}}',
        '--resume={{sessionId}}',
        '--allow-all-tools',
        '--no-color'
      ],
      concurrency: 1,
      logAdapter: 'copilot'
    }
  ]

/**
 * The base laid down on first launch. Starting from an empty screen leaves
 * "what to define, and how" unclear, so working definitions are there from the start.
 */
export async function seedIfEmpty(db: Db): Promise<void> {
  if (repo.listAgents(db).length > 0) return

  const path = await resolveLoginPath()

  const opus = repo.insertAgent(db, {
    name: 'Claude Opus',
    description: t('seed.opus'),
    command: 'claude',
    argsTemplate: [
      '-p',
      '--session-id',
      '{{sessionId}}',
      '--model',
      'opus',
      '--permission-mode',
      'bypassPermissions',
      '--',
      '{{prompt}}'
    ],
    resumeArgsTemplate: [
      '--resume',
      '{{sessionId}}',
      '-p',
      '--model',
      'opus',
      '--permission-mode',
      'bypassPermissions',
      '--',
      '{{prompt}}'
    ],
    env: {},
    concurrency: 2,
    fallbackAgentId: null,
    limitPatterns: DEFAULT_LIMIT_PATTERNS,
    cooldownSeconds: 1800,
    timeoutSeconds: 7200,
    logAdapter: 'claude',
    enabled: commandExists('claude', path),
    sortOrder: 0
  })

  const sonnet = repo.insertAgent(db, {
    name: 'Claude Sonnet',
    description: t('seed.sonnet'),
    command: 'claude',
    argsTemplate: [
      '-p',
      '--session-id',
      '{{sessionId}}',
      '--model',
      'sonnet',
      '--permission-mode',
      'bypassPermissions',
      '--',
      '{{prompt}}'
    ],
    resumeArgsTemplate: [
      '--resume',
      '{{sessionId}}',
      '-p',
      '--model',
      'sonnet',
      '--permission-mode',
      'bypassPermissions',
      '--',
      '{{prompt}}'
    ],
    env: {},
    concurrency: 3,
    fallbackAgentId: null,
    limitPatterns: DEFAULT_LIMIT_PATTERNS,
    cooldownSeconds: 1800,
    timeoutSeconds: 7200,
    logAdapter: 'claude',
    enabled: commandExists('claude', path),
    sortOrder: 1
  })

  repo.updateAgent(db, opus.id, { fallbackAgentId: sonnet.id })

  let order = 2
  for (const def of OPTIONAL_AGENTS) {
    if (!commandExists(def.command, path)) continue
    const { descriptionKey, ...agent } = def
    repo.insertAgent(db, {
      ...agent,
      // Resolved here, not at module load: the language is not settled until initMainI18n
      description: t(descriptionKey),
      env: {},
      fallbackAgentId: null,
      limitPatterns: DEFAULT_LIMIT_PATTERNS,
      cooldownSeconds: 900,
      timeoutSeconds: 7200,
      /*
       * Seeded but not enabled.
       *
       * If several CLIs start running in parallel right on first launch, you
       * get billed without knowing which did what. The user picks and enables
       * the ones they use.
       */
      enabled: false,
      sortOrder: order++
    })
  }

  repo.insertGroup(db, {
    name: 'Claude (Opus → Sonnet)',
    description: t('seed.group'),
    strategy: 'priority',
    memberIds: [opus.id, sonnet.id],
    // The only group there is. A first project should run without a visit to settings
    isDefault: true,
    sortOrder: 0
  })
}

