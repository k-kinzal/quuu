import { claudeCli } from './agent-clis/claude.js'
import { codexCli } from './agent-clis/codex.js'
import { cursorCli } from './agent-clis/cursor.js'
import { grokCli } from './agent-clis/grok.js'
import { agyCli } from './agent-clis/agy.js'
import { opencodeCli } from './agent-clis/opencode.js'
import { copilotCli } from './agent-clis/copilot.js'
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
      argsTemplate: codexCli.argsTemplate,
      /*
       * `codex exec resume <SESSION_ID> <PROMPT>` (observed on v0.149.0).
       *
       * There is no way to pass an ID on the first run (`codex exec` picks its
       * own), so Quuu picks up the ID the stdout header announces and records
       * it (`session/stdoutSessionId.ts`). The `{{sessionId}}` used here is
       * that recovered ID.
       */
      resumeArgsTemplate: codexCli.resumeArgsTemplate,
      concurrency: 1,
      logAdapter: 'codex'
    },
    {
      name: 'Cursor',
      descriptionKey: 'seed.cursor',
      command: 'cursor-agent',
      // -p is non-interactive. --force never asks for permission. --resume also creates a new chat
      argsTemplate: cursorCli.argsTemplate,
      resumeArgsTemplate: cursorCli.resumeArgsTemplate,
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
      argsTemplate: grokCli.argsTemplate,
      resumeArgsTemplate: grokCli.resumeArgsTemplate,
      concurrency: 1,
      logAdapter: 'grok'
    },
    {
      name: 'Antigravity',
      descriptionKey: 'seed.agy',
      command: 'agy',
      /*
       * `--add-dir` is what makes the project the workspace. Without it the CLI ignores the
       * directory it was started in and works inside its own scratch space instead (measured: a
       * file it was asked to write in the project landed in `~/.gemini/antigravity-cli/scratch`).
       *
       * `--output-format stream-json` is not for looks: the first line it prints is the
       * conversation it opened, and that is the only way to know which transcript under `brain/`
       * belongs to this run (`session/stdoutSessionId.ts`). The conversation view reads that
       * transcript, so the JSON stream is only ever the fallback view.
       */
      argsTemplate: agyCli.argsTemplate,
      resumeArgsTemplate: agyCli.resumeArgsTemplate,
      concurrency: 1,
      logAdapter: 'agy'
    },
    {
      name: 'opencode',
      descriptionKey: 'seed.opencode',
      command: 'opencode',
      /*
       * `--auto` approves everything that is not explicitly denied, which is what makes the run
       * unattended. The prompt is a bare positional: `--` is not usable here (`agents/cli.ts`
       * says what it does instead), so a prompt opening with `-` is the one shape this CLI
       * cannot be handed.
       *
       * There is no way to name a new session (`--session` only continues one that exists), so
       * the ID opencode chose is recovered from its store afterwards (`sessionIdentity.ts`).
       */
      argsTemplate: opencodeCli.argsTemplate,
      resumeArgsTemplate: opencodeCli.resumeArgsTemplate,
      concurrency: 1,
      logAdapter: 'opencode'
    },
    {
      name: 'GitHub Copilot',
      descriptionKey: 'seed.copilot',
      command: 'copilot',
      // --allow-all-tools is required for non-interactive runs (stated in the help)
      argsTemplate: copilotCli.argsTemplate,
      /*
       * --resume takes an optional value, so written separately as
       * `--resume <id>` the ID is not read as its argument. Join with `=`,
       * matching the example in the help.
       */
      resumeArgsTemplate: copilotCli.resumeArgsTemplate,
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
    argsTemplate: claudeCli.argsTemplate.map(arg => arg === '{{model}}' ? 'opus' : arg),
    resumeArgsTemplate: claudeCli.resumeArgsTemplate.map(arg => arg === '{{model}}' ? 'opus' : arg),
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
    argsTemplate: claudeCli.argsTemplate.map(arg => arg === '{{model}}' ? 'sonnet' : arg),
    resumeArgsTemplate: claudeCli.resumeArgsTemplate.map(arg => arg === '{{model}}' ? 'sonnet' : arg),
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
    insertOptional(db, def, order++)
  }
  rememberOffered(db, OPTIONAL_AGENTS.map((def) => def.name))

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


/**
 * Offer definitions for CLIs that arrived after this database was first seeded.
 *
 * `seedIfEmpty` only ever runs on an empty database, so support for another CLI would reach
 * **nobody who already uses Quuu**: the settings screen would simply never mention it. So each
 * definition is offered once more here, on a database that already has rows.
 *
 * Two things keep that from being pushy:
 *
 *   - it is offered **once**. Which ones have been offered is remembered, so a definition the
 *     user deleted stays deleted
 *   - it arrives disabled, like every seeded definition. Nothing runs, and nothing is billed,
 *     until the user picks it
 *
 * A CLI that is not installed is left unoffered rather than marked, so installing it later still
 * brings its definition along.
 */
export async function offerNewAgents(db: Db): Promise<void> {
  const existing = repo.listAgents(db)
  // An empty database belongs to seedIfEmpty, which records every name itself
  if (existing.length === 0) return

  const offered = new Set(offeredNames(db))
  const missing = OPTIONAL_AGENTS.filter((def) => !offered.has(def.name))
  if (missing.length === 0) return

  const path = await resolveLoginPath()
  let order = existing.reduce((max, agent) => Math.max(max, agent.sortOrder), 0) + 1
  const added: string[] = []

  for (const def of missing) {
    if (!commandExists(def.command, path)) continue
    // A definition for that CLI is already there (the user's own, or one from an older seed)
    if (!existing.some((agent) => agent.command === def.command)) {
      insertOptional(db, def, order++)
    }
    added.push(def.name)
  }

  if (added.length > 0) rememberOffered(db, [...offered, ...added])
}

/**
 * Record every optional definition as already offered, without adding any.
 *
 * For a state that is built to be looked at (the fixture): what is installed on the machine
 * must not decide what the screen shows, or a screenshot means something different on every
 * machine it is taken on.
 */
export function markOptionalAgentsOffered(db: Db): void {
  rememberOffered(db, OPTIONAL_AGENTS.map((def) => def.name))
}

/** Which optional definitions have been offered already. */
function offeredNames(db: Db): string[] {
  const stored = repo.getMetaValue(db, OFFERED_AGENTS_KEY)
  if (stored === null) return []
  try {
    const names = JSON.parse(stored) as unknown
    return Array.isArray(names) ? names.filter((name): name is string => typeof name === 'string') : []
  } catch {
    return []
  }
}

function rememberOffered(db: Db, names: string[]): void {
  repo.setMetaValue(db, OFFERED_AGENTS_KEY, JSON.stringify([...new Set(names)]))
}

const OFFERED_AGENTS_KEY = 'offered_optional_agents'

function insertOptional(db: Db, def: (typeof OPTIONAL_AGENTS)[number], sortOrder: number): void {
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
    sortOrder
  })
}
