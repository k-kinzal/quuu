/**
 * Fake data for looking at the screen.
 *
 * An empty app reveals nothing; the jams only show "when rows pile up",
 * "when values are long", and "when duration digits change", so build the
 * data up to the point where those can be reproduced.
 *
 *   npx tsx scripts/dev-fixture.ts /tmp/taskd-shot
 *
 * Never touches production data (~/Library/Application Support/taskd).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'
import { openDatabase } from '../src/main/db/database.js'
import { REPORT_ASSET_HREF, REPORT_STYLE_FILE, writeReportAssets } from '../src/main/report/assets.js'
import * as repo from '../src/main/db/repo.js'
import { markOptionalAgentsOffered } from '../src/main/seed.js'
import { DEFAULT_SETTINGS } from '../src/main/settings/types.js'
import { OPEN_STATUSES } from '../src/main/tasks/status.js'
import type { TaskStatus } from '../src/main/tasks/status.js'
import { externalAgentName } from '../src/main/agents/catalog.js'

const dir = process.argv[2] ?? '/tmp/taskd-shot'
// The report assets resolve their home from this, and fixture data must never reach production
process.env.QUUU_USER_DATA = dir
rmSync(dir, { recursive: true, force: true })
mkdirSync(join(dir, 'logs'), { recursive: true })

const db = openDatabase(join(dir, 'taskd.db'))
const iso = (minutesAgo: number): string => new Date(Date.now() - minutesAgo * 60_000).toISOString()

/* ---------------------------------------------------------------- Agents */

const opus = repo.insertAgent(db, {
  name: 'Claude Opus',
  description: 'Default agent. Runs Claude Code non-interactively.',
  // This data exists to be looked at, not run, so use a harmless command
  command: 'true',
  argsTemplate: ['-p', '{{prompt}}', '--model', 'opus'],
  resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '{{prompt}}'],
  // The env-var field also only reveals its jams once rows are in it
  env: { ANTHROPIC_MODEL: 'opus', MAX_THINKING_TOKENS: '31999' },
  concurrency: 2,
  fallbackAgentId: null,
  limitPatterns: [],
  cooldownSeconds: 900,
  timeoutSeconds: 0,
  logAdapter: 'claude',
  enabled: true,
  sortOrder: 0
})

const codex = repo.insertAgent(db, {
  name: 'Codex',
  description: '',
  command: 'true',
  argsTemplate: ['exec', '{{prompt}}'],
  resumeArgsTemplate: [],
  env: {},
  concurrency: 1,
  fallbackAgentId: null,
  limitPatterns: [],
  cooldownSeconds: 900,
  timeoutSeconds: 0,
  logAdapter: 'codex',
  enabled: true,
  sortOrder: 1
})

/*
 * Also build the state where every supported CLI is listed. The jams that come
 * with more rows (name widths, the adapter column, how disabled looks) only
 * show once the set is complete.
 */
/*
 * The set below **is** the set. Whichever CLIs happen to be installed on this machine must not
 * add rows of their own, or the same screenshot differs from machine to machine.
 */
markOptionalAgentsOffered(db)

for (const [i, def] of (
  [
    { name: 'Cursor', command: 'cursor-agent', logAdapter: 'cursor' as const },
    { name: 'Grok', command: 'grok', logAdapter: 'grok' as const },
    { name: 'GitHub Copilot', command: 'copilot', logAdapter: 'copilot' as const },
    { name: 'Antigravity', command: 'agy', logAdapter: 'agy' as const },
    { name: 'opencode', command: 'opencode', logAdapter: 'opencode' as const }
  ]
).entries()) {
  repo.insertAgent(db, {
    name: def.name,
    description: '',
    // This data exists to be looked at, not run, so use a harmless command
    command: 'true',
    argsTemplate: ['-p', '{{prompt}}'],
    resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '{{prompt}}'],
    env: {},
    concurrency: 1,
    fallbackAgentId: null,
    limitPatterns: [],
    cooldownSeconds: 900,
    timeoutSeconds: 0,
    logAdapter: def.logAdapter,
    // Same as the initial state: installed but disabled, to verify how that looks
    enabled: false,
    sortOrder: 2 + i
  })
}

/*
 * A group. Member order is the priority order, so put in **at least 2**
 * (a drag-to-reorder surface shows no movement with a single item).
 */
const agentGroup = repo.insertGroup(db, {
  name: 'Opus → Codex',
  description: 'Falls through to the next on a rate limit',
  strategy: 'priority',
  memberIds: [opus.id, codex.id],
  // Marked as the default, so the list shows the mark and a project added on this data gets it
  isDefault: true,
  sortOrder: 0
})

/**
 * Definitions the importer creates behind the scenes. They do not appear in
 * settings (if this row is visible, that is a bug). What must not appear is
 * exactly what needs checking on the real screen.
 *
 * Names come from the same function as the real thing. Hand-typing them here
 * would leave the fixture data on the old wording when the name changes.
 */
const externalAgents = new Map(
  ([['codex', 'codex'], ['claude', 'claude'], ['cursor', 'cursor-agent']] as const).map(
    ([adapter, command], i) => [
      adapter,
      repo.insertAgent(db, {
        name: externalAgentName(adapter),
        description: 'For importing directly launched sessions. Not used by the scheduler.',
        command,
        argsTemplate: [],
        resumeArgsTemplate: [],
        env: {},
        concurrency: 1,
        fallbackAgentId: null,
        limitPatterns: [],
        cooldownSeconds: 0,
        timeoutSeconds: 0,
        logAdapter: adapter,
        enabled: false,
        source: 'imported',
        sortOrder: 90 + i
      }).id
    ]
  )
)

/* -------------------------------------------------------------- Projects */

const projectSpecs: Array<{
  name: string
  path: string
  color: string
  targetKind: 'agent' | 'group'
  target: string
}> = [
    {
      name: 'Quuu',
      path: '/Users/me/Projects/taskd',
      color: '#60abef',
      targetKind: 'group',
      target: agentGroup.id
    },
    {
      name: 'design-system',
      path: '/Users/me/Projects/design-system',
      color: '#70c38f',
      targetKind: 'agent',
      target: opus.id
    },
    {
      name: 'runtime-tools',
      path: '/Users/me/Projects/runtime-tools',
      color: '#e4a249',
      targetKind: 'agent',
      target: codex.id
    },
    {
      name: 'docs-site',
      path: '/Users/me/Projects/docs-site',
      color: '#a286d3',
      targetKind: 'agent',
      target: opus.id
    }
  ]

const projects = projectSpecs.map((p, i) =>
  repo.insertProject(db, {
    name: p.name,
    path: p.path,
    color: p.color,
    priority: 2,
    targetKind: p.targetKind,
    targetId: p.target,
    maxConcurrent: 2,
    enabled: true,
    sortOrder: i
  })
)

  /* ------------------------------------------------------ Automatic tasks */

  /*
   * Definitions that queue a task when their conditions line up. Three are
   * placed with different settings to check how the columns look with rows
   * lined up (enabled/disabled, with/without an expression).
   */
  ;[
    {
      name: 'Burn down issues',
      prompt: 'Pick one from gh issue list, fix it, and open a PR',
      whenIdle: true,
      cron: '0 3 * * *',
      blockStatuses: OPEN_STATUSES,
      enabled: true,
      dueAt: iso(-260),
      lastEnqueued: iso(700)
    },
    {
      name: 'Address review comments',
      prompt: 'Respond to review comments on my open PRs',
      whenIdle: true,
      cron: '',
      blockStatuses: OPEN_STATUSES,
      enabled: true,
      dueAt: null,
      lastEnqueued: iso(120)
    },
    {
      name: 'Add some random feature',
      prompt: 'Pick one feature that seems interesting and implement it',
      whenIdle: true,
      cron: '',
      blockStatuses: [],
      enabled: false,
      dueAt: null,
      lastEnqueued: null
    }
  ].forEach((r, i) => {
    const rule = repo.insertTaskRule(db, {
      projectId: projects[0].id,
      name: r.name,
      prompt: r.prompt,
      priority: 2,
      agentOverrideId: null,
      whenIdle: r.whenIdle,
      cron: r.cron,
      frequency: i === 1 ? 'weekdays' : i === 2 ? 'weekly' : 'none',
      blockStatuses: r.blockStatuses,
      enabled: r.enabled,
      sortOrder: i,
      dueAt: r.dueAt
    })
    if (r.lastEnqueued) repo.updateTaskRule(db, rule.id, { lastEnqueuedAt: r.lastEnqueued })
  })

/* ----------------------------------------------------------------- Tasks */

let runSeq = 0

/**
 * A run pretending it happened in a worktree.
 *
 * To see on the real screen that "the place to open" is not necessarily the
 * project directory, put exactly one run somewhere else (the inspector's
 * "working directory" only appears when this differs).
 */
const WORKTREE = '/Users/me/Projects/taskd-worktrees/dashboard'

function addRun(
  taskId: string,
  status: 'succeeded' | 'failed' | 'running' | 'limited',
  startedMinutesAgo: number,
  durationSeconds: number,
  errorMessage = '',
  cwd?: string
): string {
  const id = `run_${String(++runSeq).padStart(4, '0')}`
  repo.insertRun(db, {
    id,
    taskId,
    agentId: opus.id,
    resolvedFromGroupId: null,
    sessionId: `1f2a${runSeq}c8-4d5e-6f70-8192-a3b4c5d6e7f8`,
    kind: runSeq % 3 === 0 ? 'followup' : 'initial',
    status,
    attempt: 1,
    fallbackFromRunId: null,
    pid: status === 'running' ? 12345 : null,
    cwd: cwd ?? (runSeq === 1 ? WORKTREE : '/Users/me/Projects/taskd'),
    command: 'claude',
    args: ['-p', '…'],
    promptPreview: '',
    exitCode: status === 'succeeded' ? 0 : status === 'failed' ? 1 : null,
    errorKind: status === 'failed' ? 'nonzero-exit' : null,
    errorMessage,
    sessionLogPath: join(dir, 'logs', `${id}.jsonl`),
    stdoutLogPath: join(dir, 'logs', `${id}.log`),
    startedAt: iso(startedMinutesAgo),
    endedAt: status === 'running' ? null : iso(startedMinutesAgo - durationSeconds / 60)
  })
  return id
}

interface Spec {
  project: number
  title: string
  status: TaskStatus
  priority: 0 | 1 | 2 | 3
  /** Run history. [result, started minutes ago, duration seconds] */
  runs?: [('succeeded' | 'failed' | 'running' | 'limited'), number, number, string?][]
  /** A follow-up queued by send-back. Not yet sent, so it shows at the end of the conversation as pending run */
  pending?: string
}

// Duration digits are deliberately scattered (1 digit / 2 digits / minutes / hours)
const specs: Spec[] = [
  {
    project: 0,
    title: 'Rebuild the color tokens in OKLCH and put the checks in tests',
    status: 'review',
    priority: 1,
    runs: [
      ['succeeded', 26, 4],
      ['succeeded', 94, 47],
      ['failed', 180, 3721, 'ENOENT: claude not found']
    ]
  },
  {
    project: 0,
    title: 'Run slot not released when the pid cannot be traced at startup',
    status: 'failed',
    priority: 0,
    runs: [['failed', 41, 512, 'exit 1: TypeError: Cannot read properties of undefined']]
  },
  {
    project: 1,
    title: 'Group components by category in Storybook',
    status: 'running',
    priority: 2,
    runs: [['running', 7, 0]]
  },
  { project: 1, title: 'Reorganize the writing conventions', status: 'draft', priority: 2 },
  { project: 2, title: 'Rotate logs by date', status: 'queued', priority: 1 },
  { project: 2, title: 'Reliably clean up MCP server grandchild processes', status: 'queued', priority: 2 },
  // P0 keeps its slot even while held, so the lock shows on a row that is not moving
  { project: 3, title: 'Generate the API reference in CI', status: 'held', priority: 0 },
  {
    project: 3,
    title: 'Restructure the site TOC by section',
    status: 'review',
    priority: 2,
    runs: [['succeeded', 12, 138]]
  },
  {
    project: 0,
    title: 'Make run history the only scrollable area in the inspector',
    status: 'done',
    priority: 2,
    runs: [['succeeded', 1440, 96]]
  },
  /*
   * Right after reading the review and sending the task back. A not-yet-sent
   * utterance hangs off the end of the conversation as "pending run". Without
   * this, where a send-back lands cannot be verified on the real screen
   */
  {
    project: 1,
    title: 'Tighten the tool-row verb column so long verbs never wrap',
    status: 'queued',
    priority: 1,
    runs: [['succeeded', 33, 214]],
    pending: 'The verbs should stay readable when collapsed too.\nAt 44px "Refactor" gets cramped, so re-derive the width from character count.'
  }
]

const taskIds: string[] = []
for (const spec of specs) {
  const task = repo.insertTask(db, {
    projectId: projects[spec.project].id,
    title: spec.title,
    prompt: `${spec.title}\n\nBackground and steps go here.`,
    priority: spec.priority,
    status: spec.status === 'draft' ? 'draft' : 'queued'
  })
  taskIds.push(task.id)

  let last: string | null = null
  for (const [status, startedAgo, seconds, message] of spec.runs ?? []) {
    last = addRun(task.id, status, startedAgo, seconds, message ?? '')
  }
  if (spec.status !== 'draft' && spec.status !== 'queued') {
    repo.setTaskStatus(db, task.id, spec.status, { currentRunId: last })
  }
  // A send-back means "continue the session and send a follow-up". Only both together make a continued run
  if (spec.pending) {
    repo.setTaskStatus(db, task.id, spec.status, {
      currentRunId: last,
      sessionId: `1f2a${runSeq}c8-4d5e-6f70-8192-a3b4c5d6e7f8`,
      pendingMessage: spec.pending
    })
  }
}

/* ------------------------------------------ Sessions run outside (import) */

/*
 * Sessions launched directly, outside Quuu.
 *
 * Projects created by the importer have an **empty execution target**, so this
 * row alone sources the "target" column differently (from the task's
 * external_key). It exists to check on the real screen that this has not
 * regressed to "unassigned".
 */
const external = repo.insertProject(db, {
  name: 'metrics-pipeline',
  path: '/Users/me/Projects/metrics-pipeline',
  color: '#d3869b',
  priority: 5,
  targetKind: 'agent',
  targetId: null,
  maxConcurrent: 1,
  enabled: true,
  source: 'imported',
  sortOrder: projects.length
})

/* ----------------------------------- Conversation (Codex rollout log) */

/**
 * The rollout log Codex writes. **Shaped differently from Claude's log.**
 *
 * Whether the screen renders consistently across CLIs cannot be known from
 * one CLI's log alone. Based on real captures, only the shapes that need
 * parsing are lined up here.
 *
 *   - every tool call arrives under the single name `exec`, and its body is
 *     a JavaScript string calling `tools.<function>({…})`
 *   - the old form is `function_call` + `arguments` (a JSON string)
 *   - results always carry the `Script completed / Wall time … / Output:` preamble
 *   - diffs use the `*** Begin Patch` format, with the target path written inside
 *   - the `developer` role and the AGENTS.md preamble are not human utterances (must not appear)
 */
function codexRollout(cwd: string): string {
  const exec = (script: string): string => script
  const lines: unknown[] = [
    { type: 'session_meta', payload: { cwd } },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'developer',
        content: [{ type: 'input_text', text: '<permissions instructions>\nFilesystem sandboxing…\n</permissions instructions>' }]
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: `# AGENTS.md instructions for ${cwd}\n\n<INSTRUCTIONS>\n…\n</INSTRUCTIONS>` },
          { type: 'input_text', text: `<environment_context>\n  <cwd>${cwd}</cwd>\n</environment_context>` }
        ]
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Fix the dashboard ordering. Right now it is insertion order, so recently active items sink to the bottom.' }]
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'reasoning',
        summary: [
          {
            type: 'summary_text',
            text: '**Find where the ordering comes from**\n\nWhether SQL or the render side decides the order changes where the fix goes. First read the code that produces the list.'
          }
        ],
        encrypted_content: 'gAAAAA…'
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        call_id: 'call_1',
        name: 'exec',
        input: exec(
          `const r = await tools.exec_command({cmd:"rg -n 'ORDER BY' src/dashboard",workdir:"${cwd}",yield_time_ms:10000});\ntext(r.output);\n`
        )
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'call_1',
        output: [
          { type: 'input_text', text: 'Script completed\nWall time 0.4 seconds\nOutput:\n' },
          { type: 'input_text', text: 'src/dashboard/query.ts:42:  ORDER BY created_at ASC' }
        ]
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        call_id: 'call_2',
        name: 'exec',
        input: exec(
          `const r = await tools.exec_command({cmd:"sed -n '1,120p' src/dashboard/query.ts",workdir:"${cwd}"});\ntext(r.output);\n`
        )
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'call_2',
        output: 'Script completed\nWall time 0.1 seconds\nOutput:\n\nexport const listQuery = `SELECT * FROM cards ORDER BY created_at ASC`'
      }
    },
    // A plan update. Neither a run nor a write, so it should get its own verb in the column
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        call_id: 'call_3',
        name: 'exec',
        input: exec(
          [
            'const p = await tools.update_plan({plan:[',
            '  {step:"Read where the ordering comes from",status:"completed"},',
            '  {step:"Switch to last-updated descending",status:"in_progress"},',
            '  {step:"Add a test and run it",status:"pending"}',
            ']});',
            'text(p);'
          ].join('\n')
        )
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'call_3',
        output: 'Script completed\nWall time 0.0 seconds\nOutput:\n{}'
      }
    },
    /*
     * A diff. The target path is written only inside the patch, and that patch
     * is embedded as a **JavaScript string** (newlines as the 2 characters `\n`)
     */
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        call_id: 'call_4',
        name: 'exec',
        input: exec(
          `const patch = ${JSON.stringify(
            [
              '*** Begin Patch',
              '*** Update File: src/dashboard/query.ts',
              '@@',
              '-export const listQuery = `SELECT * FROM cards ORDER BY created_at ASC`',
              '+export const listQuery = `SELECT * FROM cards ORDER BY updated_at DESC, created_at DESC`',
              '*** End Patch'
            ].join('\n')
          )};\nconst r = await tools.apply_patch(patch);\ntext(r);\n`
        )
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'call_4',
        output: [{ type: 'input_text', text: 'Script completed\nWall time 0.0 seconds\nOutput:\n' }, { type: 'input_text', text: 'Updated src/dashboard/query.ts' }]
      }
    },
    // A failed run. Verifies it separates in red
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        call_id: 'call_5',
        name: 'exec',
        input: exec(`const r = await tools.exec_command({cmd:"npm test -- dashboard",workdir:"${cwd}"});\ntext(r.output);\n`)
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'call_5',
        output: [
          { type: 'input_text', text: 'Script failed\nWall time 6.2 seconds\nOutput:\n' },
          { type: 'input_text', text: "FAIL tests/dashboard.test.ts > recently active items come first\nAssertionError: expected 'card_02' to be 'card_09'" }
        ]
      }
    },
    /*
     * Run in the background and wait. The waiting side writes only a number,
     * so without linking them it becomes a bare "wait" row
     */
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        call_id: 'call_7',
        name: 'exec',
        input: exec(`const r = await tools.exec_command({cmd:"npm run build",workdir:"${cwd}"});\ntext(r.output);\n`)
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'call_7',
        output: 'Script running with cell ID 12\nWall time 10.0 seconds\nOutput:\n'
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'call_8',
        name: 'wait',
        arguments: JSON.stringify({ cell_id: '12', yield_time_ms: 30000 })
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'call_8',
        output: 'Script completed\nWall time 21.0 seconds\nOutput:\nbuilt in 20.4s'
      }
    },
    // The old form (function_call + arguments). If unparsed, the row shows an empty target
    {
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'call_6',
        name: 'shell_command',
        arguments: JSON.stringify({ command: 'npm test -- dashboard', workdir: cwd })
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'call_6',
        output: 'Script completed\nWall time 5.8 seconds\nOutput:\n\nTest Files  1 passed (1)'
      }
    },
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: [
              'Changed the ordering to **last-updated descending**.',
              '',
              '| Sort key | Before | After |',
              '| --- | --- | --- |',
              '| Primary | `created_at ASC` | `updated_at DESC` |',
              '| Secondary | — | `created_at DESC` |',
              '',
              '```sh',
              'npm test -- dashboard',
              '```',
              '',
              'Only when `updated_at` ties does it fall back to insertion order.'
            ].join('\n')
          }
        ]
      }
    }
  ]

  let n = 0
  return (
    lines
      .map((e) => JSON.stringify({ ...(e as object), timestamp: iso(260 - ++n) }))
      .join('\n') + '\n'
  )
}

; (
  [
    /*
     * The one running import is Cursor.
     *
     * claude / codex keep running markers (pid files, locks) that point at
     * **real directories on this dev machine**. The fake session ID is not
     * there, so 15 seconds after launch it gets demoted to done (correct
     * behavior). Cursor commonly has chats without markers, so it stays
     * visibly running within the update-time window (10 minutes). Shoot right
     * after regenerating the data.
     */
    { adapter: 'cursor', title: 'Read the trial-run logs and list the failed steps', startedAgo: 14, running: true },
    { adapter: 'claude', title: 'Make gh callable from the Worker', startedAgo: 130, running: false },
    { adapter: 'codex', title: 'Fix the dashboard ordering', startedAgo: 260, running: false }
  ] as const
).forEach((s, i) => {
  const key = `${s.adapter}:0000000${i}-1111-2222-3333-44444444444${i}`
  const imported = repo.insertTask(db, {
    projectId: external.id,
    title: s.title,
    prompt: '',
    priority: 2,
    status: s.running ? 'running' : 'done',
    source: 'imported',
    externalKey: key
  })

  /*
   * Create both the Run and the session log.
   *
   * Without a Run, the status column stays "starting". Also, a running one
   * must have **a log that exists and was written just now**, or the startup
   * reconciliation (importer.refreshRunning) decides "no longer traceable"
   * and demotes it to done. Same as the real thing: an outside session's
   * liveness is only knowable from its log.
   */
  const runId = `run_ext_${i}`
  const logPath = join(dir, 'logs', `${runId}.jsonl`)
  /*
   * Only Codex gets a real-shaped conversation. Whether the conversation pane
   * renders consistently across CLIs cannot be known from Claude's log alone
   * (in fact it was not consistent).
   */
  writeFileSync(
    logPath,
    s.adapter === 'codex'
      ? codexRollout(external.path)
      : `{"type":"session_meta","payload":{"cwd":"${external.path}"}}\n`
  )
  repo.insertRun(db, {
    id: runId,
    taskId: imported.id,
    agentId: externalAgents.get(s.adapter)!,
    resolvedFromGroupId: null,
    sessionId: key.split(':')[1],
    kind: 'initial',
    status: s.running ? 'running' : 'succeeded',
    attempt: 1,
    fallbackFromRunId: null,
    pid: null,
    cwd: '/Users/me/Projects/metrics-pipeline',
    command: s.adapter === 'cursor' ? 'cursor-agent' : s.adapter,
    args: [],
    promptPreview: '',
    exitCode: s.running ? null : 0,
    errorKind: null,
    errorMessage: '',
    sessionLogPath: logPath,
    stdoutLogPath: logPath,
    source: 'imported',
    externalKey: key,
    startedAt: iso(s.startedAgo),
    endedAt: s.running ? null : iso(s.startedAgo - 12)
  })

  repo.setTaskStatus(db, imported.id, s.running ? 'running' : 'done', {
    currentRunId: runId,
    sessionId: key.split(':')[1],
    doneAt: s.running ? null : iso(s.startedAgo - 12)
  })
})

/* Even when a long launch instruction pushes the CLI banner past 8KB, the structured log must still be discovered. */
const recoveryId = '01a075da-e8ed-75d0-8354-e1302f5a72c2'
const recoveryTask = repo.insertTask(db, { projectId: external.id, title: 'Recover the chat from a long launch instruction', prompt: 'Fix the dashboard ordering', status: 'review' })
const recoveryStdout = join(dir, 'logs', 'run_long_prompt.log')
const recoveryDay = join(dir, 'codex-sessions', '2026', '09', '06')
mkdirSync(recoveryDay, { recursive: true })
writeFileSync(join(recoveryDay, `rollout-now-${recoveryId}.jsonl`), codexRollout(external.path))
writeFileSync(recoveryStdout, '# cmd: codex exec ' + 'x'.repeat(50_248) + '\nOpenAI Codex v0.153.4\n--------\nworkdir: /tmp\nsession id: ' + recoveryId + '\n--------\nexec\nmust not fall back to plain output\n')
repo.insertRun(db, { id: 'run_long_prompt', taskId: recoveryTask.id, agentId: codex.id, resolvedFromGroupId: null, sessionId: 'quuu-generated-id', kind: 'initial', status: 'succeeded', attempt: 1, fallbackFromRunId: null, pid: null, cwd: external.path, command: 'codex', args: [], promptPreview: 'Fix the dashboard ordering', exitCode: 0, errorKind: null, errorMessage: '', sessionLogPath: null, stdoutLogPath: recoveryStdout, startedAt: iso(10), endedAt: iso(1) })
repo.setTaskStatus(db, recoveryTask.id, 'review', { currentRunId: 'run_long_prompt', sessionId: 'quuu-generated-id' })

/* ------------------------------------------------------------- Bulk rows */

/*
 * A state with rows piled high.
 *
 *   QUUU_FIXTURE_BULK=240 npm run dev:fixture
 *
 * "The open ones are few enough to read" stops holding as the count grows.
 * Column widths, sorting, and filtering **can only be checked with the count
 * up**, so make that state producible. Default is 0 (no extra rows).
 */
const bulk = Number(process.env.QUUU_FIXTURE_BULK ?? 0)

const VERBS = ['Fix', 'Rewrite', 'Rebuild', 'Measure', 'Extend', 'Collapse', 'Strip', 'Align']
const NOUNS = [
  'log rotation',
  'startup reconciliation',
  'session tailing',
  'the queue pickup conditions',
  'the fallback chain',
  'the notification copy',
  'icon generation',
  'the run history columns',
  'the agent concurrency slots',
  'the migrations'
]
const BULK_STATUSES: TaskStatus[] = [
  'queued',
  'queued',
  'queued',
  'review',
  'done',
  'failed',
  'held',
  'draft',
  'running'
]

for (let i = 0; i < bulk; i++) {
  // No randomness. Without identical data across reshoots, before/after comparison breaks
  const status = BULK_STATUSES[i % BULK_STATUSES.length]
  const projectIndex = i % projects.length
  const noun = NOUNS[(i * 3) % NOUNS.length]
  const verb = VERBS[(i * 5) % VERBS.length]
  const long = i % 7 === 0 ? ' (the longer heading variant, stretched until truncation kicks in)' : ''

  const task = repo.insertTask(db, {
    projectId: projects[projectIndex].id,
    title: `${verb} ${noun}${long}`,
    prompt: `${verb} ${noun}.`,
    priority: [0, 1, 2, 2, 3][i % 5] as 0 | 1 | 2 | 3,
    status: status === 'draft' ? 'draft' : 'queued'
  })

  let last: string | null = null
  if (status === 'review' || status === 'failed' || status === 'done' || status === 'running') {
    last = addRun(
      task.id,
      status === 'review' || status === 'done' ? 'succeeded' : status === 'failed' ? 'failed' : 'running',
      (i % 97) * 7 + 3,
      [4, 47, 312, 3721][i % 4],
      status === 'failed' ? `exit 1: verification of ${noun} failed` : ''
    )
  }
  if (status !== 'draft' && status !== 'queued') {
    repo.setTaskStatus(db, task.id, status, { currentRunId: last })
  }
}

/* ---------------------------------------------------------------- Images */

/**
 * Images that appear in conversations.
 *
 * Without differing aspect ratios side by side, the collapsed height
 * alignment and wrapping stay invisible. To avoid adding dependencies,
 * assemble the PNGs in place (solid color, so a few hundred bytes each).
 */
function png(width: number, height: number, rgb: [number, number, number]): string {
  const chunk = (type: string, body: Buffer): Buffer => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(body.length, 0)
    head.write(type, 4, 'ascii')
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
    return Buffer.concat([head, body, tail])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 8 bit
  ihdr[9] = 2 // truecolor
  const row = Buffer.concat([
    Buffer.from([0]), // no filter
    Buffer.from(Array.from({ length: width }, () => rgb).flat())
  ])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]).toString('base64')
}

const shotWide = png(1600, 900, [58, 106, 168])
const shotTall = png(600, 900, [122, 74, 148])
/** Wider than the pane. Checks the right edge is not clipped when collapsed. */
const shotBanner = png(2400, 160, [74, 132, 106])

/* ------------------------------------ Conversation (one awaiting review) */

const conversation = [
  {
    type: 'user',
    message: {
      role: 'user',
      content: [
        { type: 'text', text: 'Rebuild the color tokens in OKLCH. This is how it looks right now.' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: shotWide } },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: shotTall } },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: shotBanner } }
      ]
    }
  },
  /*
   * A line the CLI injects. It must not appear as a human utterance, so it is
   * placed here to verify on the real screen that it does not show up
   */
  {
    type: 'user',
    isMeta: true,
    message: {
      role: 'user',
      content:
        '[Image: original 1600x900, displayed at 1600x900. Multiply coordinates by 1.0 to map to original image.]'
    }
  },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      model: 'claude-opus-4',
      content: [
        {
          type: 'text',
          text: 'I will convert the current tokens to OKLCH and measure where they break first.'
        },
        {
          type: 'tool_use',
          id: 'tu_1',
          name: 'Read',
          input: { file_path: 'packages/design-system/src/theme/tokens.ts' }
        }
      ]
    }
  },
  {
    type: 'user',
    message: {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu_1', content: 'export const palettes = { … }' }
      ]
    }
  },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      model: 'claude-opus-4',
      content: [
        {
          type: 'tool_use',
          id: 'tu_2',
          name: 'Read',
          input: { file_path: '/tmp/taskd-shots/01-default.png' }
        }
      ]
    }
  },
  // An image a tool returned. Appears as the result when opened
  {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tu_2',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: shotWide } }
          ]
        }
      ]
    }
  },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      model: 'claude-opus-4',
      content: [
        {
          type: 'text',
          text: 'The neutral hue was drifting between 256 and 271 degrees. The surface hierarchy also spans only 3.9 points from canvas to default, separated by nothing but borders. I will pin H=264 and re-step the lightness at perceptually equal intervals.'
        }
      ]
    }
  },
  /*
   * One message with every format in it.
   * "Headings and bullet lists" alone never jam Markdown rendering, so line
   * up tables, fenced code, diagrams, and checkboxes to verify on the real screen
   */
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      model: 'claude-opus-4',
      content: [
        {
          type: 'text',
          text: [
            '## What I did',
            '',
            'Changed the tokens to be **designed in OKLCH and baked to sRGB**.',
            'The checks live in `tests/tokens.test.ts`, so touching a value makes them fail.',
            '',
            '| Step | Before | After | Delta |',
            '| --- | --- | ---: | ---: |',
            '| canvas | `#131417` | `#1f2023` | +5.5 |',
            '| subtle | `#191b1f` | `#25272b` | +5.2 |',
            '| default | `#1d2024` | `#292c30` | +5.1 |',
            '',
            '### Steps',
            '',
            '1. Convert the current hex values to OKLCH and measure the hue drift',
            '2. Pin H=264 and re-step the lightness at equal intervals',
            '3. Verify colors used as text at 4.5:1',
            '',
            '```ts',
            "import { palettes } from './tokens.js'",
            '',
            '/** Whether adjacent surfaces differ enough in perceived lightness to tell apart */',
            'export function steps(scheme: ColorScheme): number[] {',
            "  const surfaces = ['canvas', 'subtle', 'default'] as const",
            '  return surfaces.map((k) => oklch(palettes[scheme].surface[k]).l * 100)',
            '}',
            '```',
            '',
            'The checks pass with:',
            '',
            '```sh',
            'npm run check   # lint + typecheck + test',
            'npm run storybook',
            '```',
            '',
            'The gist of the diff is these three lines.',
            '',
            '```diff',
            '-    canvas: \'#131417\',',
            '+    canvas: \'#1f2023\',',
            '     border: { subtle: \'#363940\' },',
            '```',
            '',
            '### How values were decided',
            '',
            '```mermaid',
            'flowchart TD',
            '  A[hex to OKLCH] --> B{Hue drifting?}',
            '  B -->|drifting| C[Pin H=264]',
            '  B -->|uniform| D[Check lightness steps]',
            '  C --> D',
            '  D --> E{Meets 4.5:1?}',
            '  E -->|no| F[Raise lightness again]',
            '  F --> D',
            '  E -->|yes| G[[Bake into tokens]]',
            '```',
            '',
            'The pickup order goes like this.',
            '',
            '```mermaid',
            'sequenceDiagram',
            '  participant H as You',
            '  participant T as Quuu',
            '  participant A as Agent',
            '  H->>T: Review and mark done',
            '  T->>A: Fetch the next task',
            '  A-->>T: Return as awaiting review',
            '  Note over T,A: Done is a human privilege, so it stops here',
            '```',
            '',
            '### Remaining',
            '',
            '- [x] Pinned the neutral hue',
            '- [x] Matched the surface lightness deltas to macOS',
            '- [ ] Light `selected` sits close to hover — push it one more step apart',
            '',
            '> Telling surfaces apart is the job of the 1px border, not the value gap.',
            '> Too much gap and adjacent surfaces repel each other.',
            '',
            'See [convention L](https://github.com/k-kinzal/quuu#readme) for details.'
          ].join('\n')
        }
      ]
    }
  },
  /*
   * The second and third instructions.
   *
   * A bundle's heading **swaps out when the next instruction arrives**, so a
   * log with only one instruction cannot show the swap on the real screen.
   * Place both a long instruction (truncation applies) and a short one (it
   * does not), and make the second bundle taller than the pane (otherwise
   * the heading never gets pushed out).
   */
  {
    type: 'user',
    message: {
      role: 'user',
      content: [
        'About light `selected` sitting close to hover — push it one more step apart.',
        'Selection is a state and hover is a reaction; at equal strength there is no telling before from after the press.',
        '',
        '- Tint the selection ground toward the primary color; keep hover achromatic',
        '- Redo the 4.5:1 checks against the paired text colors'
      ].join('\n')
    }
  },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      model: 'claude-opus-4',
      content: [
        { type: 'text', text: 'I will measure the selection/hover gap before pushing them apart.' },
        {
          type: 'tool_use',
          id: 'tu_2',
          name: 'Edit',
          input: { file_path: 'packages/design-system/src/theme/tokens.ts' }
        }
      ]
    }
  },
  {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_2', content: "selected: '#d0e2f6'" }]
    }
  },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      model: 'claude-opus-4',
      content: [
        {
          type: 'text',
          text: [
            'Moved selection one step toward the primary color and kept hover achromatic.',
            '',
            '| Surface | Before | After | Contrast vs text |',
            '| --- | --- | --- | ---: |',
            '| selected | `#d0e2f6` | `#c3dbf7` | 8.1:1 |',
            '| hover | `#e4e7ed` | `#e4e7ed` | 9.4:1 |',
            '',
            'Before the press (hover) and after (selection) now split on the presence of hue.',
            'Achromatic versus primary-tinted, so even at similar lightness they cannot be confused.',
            '',
            'Added the checks to `tests/tokens.test.ts`.',
            '',
            '```sh',
            'npm run check',
            '```',
            '',
            'I looked at every spot where selection and hover sit side by side, in both light and dark:',
            'list rows, menu items, and run history rows.',
            '',
            '### Remaining',
            '',
            '- [x] Moved selection toward the primary color',
            '- [x] Left hover achromatic',
            '- [ ] How a row that goes disabled while selected (a held task) should look',
            '',
            'For disabled rows I intend to dim only the text, with no ground of their own,',
            'but whether "selected yet unpressable" reads correctly when it overlaps',
            'selection is something to decide after seeing the real screen.'
          ].join('\n')
        }
      ]
    }
  },
  /*
   * The recap the CLI writes to itself when context runs out. It quotes the
   * human, so shown as an utterance it reads like them. Placed mid-conversation
   * to verify on the real screen that it does not show up
   */
  {
    type: 'user',
    isCompactSummary: true,
    isVisibleInTranscriptOnly: true,
    message: {
      role: 'user',
      content:
        'This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\nSummary:\n1. Primary Request and Intent:\n   - "Rebuild the color tokens in OKLCH." The user attached three screenshots of the current palette.\n2. Work done so far:\n   - Converted `tokens.ts` and measured where the contrast breaks first.'
    }
  },
  { type: 'user', message: { role: 'user', content: 'Align the borders too.' } },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      model: 'claude-opus-4',
      content: [{ type: 'text', text: 'Moved them onto `border.subtle`.' }]
    }
  }
]

let t = 0
const jsonl = conversation
  .map((e) =>
    JSON.stringify({
      ...e,
      uuid: `u${++t}`,
      sessionId: '1f2a1c8-4d5e-6f70-8192-a3b4c5d6e7f8',
      timestamp: iso(26 - t)
    })
  )
  .join('\n')
writeFileSync(join(dir, 'logs', 'run_0001.jsonl'), jsonl + '\n')
repo.setTaskSessionId(db, taskIds[0], '1f2a1c8-4d5e-6f70-8192-a3b4c5d6e7f8')

/* ---------------------------- Conversation (one sent back, pending run) */

/*
 * A conversation right after a send-back.
 *
 * Keep a real exchange even if short. Without a log the conversation pane is
 * empty, and **what the trailing "pending run" continues from** cannot be
 * verified on the real screen.
 */
const sentBackTaskId = taskIds[taskIds.length - 1]
const sentBackRun = repo.listRunsByTask(db, sentBackTaskId)[0]
const sentBack = [
  {
    type: 'user',
    message: { role: 'user', content: 'Tighten the tool-row verb column to where even long verbs never wrap.' }
  },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      model: 'claude-opus-4',
      content: [
        { type: 'text', text: 'The verb column was fixed at 44px. I will measure before re-deciding.' },
        {
          type: 'tool_use',
          id: 'tu_s1',
          name: 'Edit',
          input: { file_path: 'src/renderer/src/ui/session.tsx' }
        }
      ]
    }
  },
  {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_s1', content: 'flex: 0 0 44px' }]
    }
  },
  {
    type: 'assistant',
    message: {
      role: 'assistant',
      model: 'claude-opus-4',
      content: [
        {
          type: 'text',
          text: 'Tightened it to **40px**, sized to the shortest verbs. The vertical axis stays aligned when collapsed.'
        }
      ]
    }
  }
]

let s = 0
writeFileSync(
  join(dir, 'logs', `${sentBackRun.id}.jsonl`),
  sentBack
    .map((e) =>
      JSON.stringify({
        ...e,
        uuid: `s${++s}`,
        sessionId: sentBackRun.sessionId,
        timestamp: iso(33 - s)
      })
    )
    .join('\n') + '\n'
)

/* ------------------- Conversation (a limit the agent wrote down itself) */

/*
 * A run that died against a usage limit, and a follow-up that reached the agent before one did.
 *
 * The CLI writes both halves into the session itself: the instruction it accepted, and the
 * "you've reached your limit" it answers with. The failure box and the trailing "not yet sent"
 * utterance are both decided against this conversation, so **only a log of this shape shows on
 * the real screen whether either of them is saying what the conversation already says**. Both
 * used to: the reason was printed at the head of the pane while the agent said it in the middle,
 * and an instruction already handed over sat underneath as still to send.
 */
const LIMIT_SAID =
  "You've reached your Fable limit. Switch to another model, or manage usage credits at claude.ai/settings/usage, to continue."

function writeSession(runId: string, entries: Array<{ role: 'user' | 'assistant'; text: string; minutesAgo: number }>): void {
  const sessionId = repo.getRun(db, runId)!.sessionId
  writeFileSync(
    join(dir, 'logs', `${runId}.jsonl`),
    entries
      .map((entry, i) =>
        JSON.stringify({
          type: entry.role,
          uuid: `${runId}-${i}`,
          sessionId,
          timestamp: iso(entry.minutesAgo),
          message: {
            role: entry.role,
            ...(entry.role === 'assistant' ? { model: 'claude-opus-4' } : {}),
            content: [{ type: 'text', text: entry.text }]
          }
        })
      )
      .join('\n') + '\n'
  )
}

const spentAsked = 'Add support for agy, grok and opencode.'
const spent = repo.insertTask(db, {
  projectId: projects[0].id,
  title: 'Add the remaining agent CLIs',
  prompt: spentAsked,
  priority: 2,
  status: 'queued'
})
const spentRun = addRun(spent.id, 'failed', 34, 4, LIMIT_SAID)
repo.setTaskStatus(db, spent.id, 'failed', {
  currentRunId: spentRun,
  sessionId: repo.getRun(db, spentRun)!.sessionId
})
writeSession(spentRun, [
  { role: 'user', text: spentAsked, minutesAgo: 34 },
  { role: 'assistant', text: LIMIT_SAID, minutesAgo: 34 }
])

const heldAsked = 'Re-lay the fuzz targets over the core and DB implementations.'
const held = repo.insertTask(db, {
  projectId: projects[0].id,
  title: 'Re-lay the fuzz targets',
  prompt: heldAsked,
  priority: 2,
  status: 'queued'
})
const heldRun = addRun(held.id, 'limited', 62, 12)
repo.setTaskStatus(db, held.id, 'queued', {
  currentRunId: heldRun,
  sessionId: repo.getRun(db, heldRun)!.sessionId,
  pendingMessage: 'please continue'
})
writeSession(heldRun, [
  { role: 'user', text: heldAsked, minutesAgo: 240 },
  { role: 'assistant', text: 'Rewrote the core targets. The DB side is next.', minutesAgo: 236 },
  // Handed over by the run that then hit the limit: the agent is holding it, unanswered
  { role: 'user', text: 'please continue', minutesAgo: 61 }
])

/* -------------------------------------------------------------- Settings */

// A real diff exercises the full project/change listing and deleted-file reads.
if (process.env.QUUU_FIXTURE_REVIEW === '1') {
  const cwd = join(dir, 'review-repo')
  const git = (...args: string[]): string => execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8' }).trim()
  for (const path of ['src', 'removed/legacy', 'docs', 'new/components']) mkdirSync(join(cwd, path), { recursive: true })
  writeFileSync(join(cwd, 'src/index.ts'), 'export const version = 1\n')
  writeFileSync(join(cwd, 'src/unchanged.ts'), 'export const stable = true\n')
  writeFileSync(join(cwd, 'removed/legacy/client.ts'), 'export const legacyClient = true\n')
  writeFileSync(join(cwd, 'docs/README.md'), '# Documentation\n')
  git('init', '-q')
  git('config', 'user.name', 'Fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  git('add', '.')
  git('commit', '-qm', 'Before task')
  const baseHead = git('rev-parse', 'HEAD')
  const baseTree = git('rev-parse', 'HEAD^{tree}')
  const project = repo.insertProject(db, { ...projects[0], name: 'File change colors', path: cwd, targetId: opus.id })
  const task = repo.insertTask(db, { projectId: project.id, title: 'Inspect project and change row colors', prompt: 'Review file and directory changes.', status: 'draft' })
  const id = addRun(task.id, 'succeeded', 10, 60, '', cwd)
  repo.setTaskStatus(db, task.id, 'review', { currentRunId: id })
  repo.insertTaskReviewBase(db, { taskId: task.id, cwd, startedAt: iso(10), baseHead, baseTree })
  writeFileSync(join(cwd, 'src/index.ts'), 'export const version = 2\n')
  writeFileSync(join(cwd, 'new/components/Row.tsx'), 'export const Row = () => null\n')
  writeFileSync(join(cwd, 'src/a-long-new-filename-that-needs-the-available-row-width.ts'), 'export const created = true\n')
  rmSync(join(cwd, 'removed'), { recursive: true })
  git('add', '-A')
  git('commit', '-qm', 'Add, remove and modify files')
  writeFileSync(join(cwd, 'docs/README.md'), '# Updated documentation\n')
  git('add', 'docs/README.md')
  git('commit', '-qm', 'Update documentation')
  writeFileSync(join(cwd, 'src/index.ts'), 'export const version = 3\n')
  git('add', 'src/index.ts')
  writeFileSync(join(cwd, 'src/index.ts'), 'export const version = 4\n')
  writeFileSync(join(cwd, 'src/local.ts'), 'export const local = true\n')
}

// A real, isolated repository lets pagination and saved review revisions be checked together.
const historyCount = Number(process.env.QUUU_FIXTURE_HISTORY ?? 0)
if (Number.isSafeInteger(historyCount) && historyCount > 0) {
  const cwd = join(dir, 'history-repo')
  mkdirSync(cwd, { recursive: true })
  const git = (...args: string[]): string => execFileSync('/usr/bin/git', args, { cwd, encoding: 'utf8' }).trim()
  git('init', '-q')
  git('config', 'user.name', 'Fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(cwd, 'result.txt'), 'Before the task\n')
  git('add', '.')
  git('commit', '-qm', 'Before task')
  const baseHead = git('rev-parse', 'HEAD')
  const baseTree = git('rev-parse', 'HEAD^{tree}')
  const project = repo.insertProject(db, { ...projects[0], name: 'History performance', path: cwd, targetId: opus.id })
  const task = repo.insertTask(db, { projectId: project.id, title: 'Read a long conversation and its saved review', prompt: 'Review the latest results.', status: 'draft' })
  const id = addRun(task.id, 'succeeded', 10, 60, '', cwd)
  repo.setTaskStatus(db, task.id, 'review', { currentRunId: id })
  repo.insertTaskReviewBase(db, { taskId: task.id, cwd, startedAt: iso(10), baseHead, baseTree })
  writeFileSync(join(cwd, 'result.txt'), 'The task committed this result.\n')
  git('add', '.')
  const receipt = git('commit', '-m', 'Record the task result')
  // Shaped like a real run: a few instructions, each answered by hundreds of tool calls
  // with a paragraph now and then, so every page boundary falls inside one response.
  const entries = Array.from({ length: historyCount }, (_, i) => {
    const said = (type: 'user' | 'assistant', block: object): object => ({ type, uuid: `history-${i}`, timestamp: iso(9), message: { content: [block] } })
    if (i % 200 === 0) return [said('user', { type: 'text', text: `Instruction ${i}: Check the next part of the implementation.` })]
    if (i % 5 === 0) return [said('assistant', { type: 'text', text: `Result ${i}: **verified**.\n\nThis response stays readable while earlier pages are loaded.` })]
    const call = i % 2 ? { name: 'Read', input: { file_path: `src/part${i}.ts` } } : { name: 'Bash', input: { command: `npm test -- part${i}` } }
    return [
      said('assistant', { type: 'tool_use', id: `history-call-${i}`, ...call }),
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `history-call-${i}`, content: `part ${i} ok` }] } }
    ]
  }).flat()
  const tail = [
    { type: 'assistant', uuid: 'history-commit', message: { content: [{ type: 'tool_use', id: 'fixture-commit', name: 'Bash', input: { command: 'git commit -m "Record the task result"' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'fixture-commit', content: receipt }] } },
    { type: 'assistant', uuid: 'history-latest', message: { content: [{ type: 'text', text: '**Latest result:** the change is committed and ready for review.' }] } }
  ]
  writeFileSync(join(dir, 'logs', `${id}.jsonl`), [...entries, ...tail].map(entry => JSON.stringify(entry)).join('\n') + '\n')
}

/*
 * Settings live **as one JSON blob in the single `app` row** (`AppState.loadSettings`).
 * Writing per-key rows like `theme` or `autoStartScheduler` here means the app
 * never reads them = it launches with defaults (scheduler and import enabled).
 *
 * That actually happened: merely launching with this fake data imported over
 * 300 real sessions and the scheduler started handing out runs.
 * **Data meant for looking must do nothing but be looked at.**
 */
/* --------------------------------------------------------------- Report */

/**
 * A change report to look at.
 *
 * Without one in the fixture the only state ever seen is the shut tab, and the page — the part a
 * person actually reads — stays unlooked-at until it reaches a real screen.
 *
 * Written **the shape the instructions ask for**: ordinary HTML, the shared stylesheet, and a
 * diagram left to the layout engine rather than placed by hand. So this also checks that the
 * shipped assets are what dresses and draws a report.
 */
const reportTaskId = taskIds[0]
const project0Path = repo.getProject(db, repo.getTask(db, reportTaskId)!.projectId)?.path ?? dir
const reportHome = join(dir, 'reports', reportTaskId)
const reportPage = join(reportHome, 'rpt_fixture.html')
mkdirSync(reportHome, { recursive: true })
writeReportAssets()
writeFileSync(reportPage, `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>変更の意図</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${REPORT_ASSET_HREF}/${REPORT_STYLE_FILE}"></head><body>
<svg class="draw-defs" aria-hidden="true" focusable="false"><defs>
  <marker id="dd-arrow" markerUnits="userSpaceOnUse" viewBox="0 0 8 6"
    refX="8" refY="3" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
    <path class="draw-arrowhead" d="M0 0L8 3L0 6Z"/>
  </marker>
</defs></svg>
<article class="sheet">
  <p class="eyebrow">CHANGE OF INTENT</p>
  <h1>レビューは「読む」に変わった</h1>
  <p class="stand">材料は同じ。組み立てる人が変わった。</p>
  <div class="hero">
    <div class="was"><span class="cap">BEFORE</span><span class="claim">人が差分から意味を組み立てる</span>
      <span class="unit">材料はあるが、まとまりはない</span></div>
    <div class="mid"><svg class="draw" viewBox="0 0 56 16" aria-hidden="true">
      <path class="draw-line draw-arrow" d="M0 8H52"/>
    </svg></div>
    <div class="now"><span class="cap">AFTER</span><span class="claim">別の AI が組み立て、人は読む</span>
      <span class="unit">届くのは変更の意味</span></div>
  </div>
  <section class="sec" aria-labelledby="section-1">
    <div class="label"><h2 id="section-1">01 / 誰が組み立てるか</h2></div>
    <div class="field">
      <p class="lead">同じ材料を、別の AI が組み立てる。</p>
      <figure class="plate plate-full plate-unnumbered" id="figure-flow">
        <ol class="flow tone-blue">
          <li><span class="flow-mark">01</span><strong class="flow-name">作業の記録</strong><span class="flow-detail">依頼・会話・差分を集める</span></li>
          <li><span class="flow-mark">02</span><strong class="flow-name">意味を整理</strong><span class="flow-detail">別の AI が、何が変わったかを説明する</span></li>
          <li><span class="flow-mark">03</span><strong class="flow-name">人が読む</strong><span class="flow-detail">結果と根拠を確かめ、判断する</span></li>
        </ol>
        <figcaption><span class="plate-label">図 1.</span>読む人へ届く前に、材料が説明へ変わる。
          <span class="plate-source">検証用のサンプル。実際のタスクの成果ではありません。</span></figcaption>
      </figure>
    </div>
  </section>
  <section class="sec" aria-labelledby="section-2">
    <div class="label"><h2 id="section-2">02 / 作業と独立</h2></div>
    <div class="field">
      <p class="lead">レポートの生成を待たず、次の作業へ進める。</p>
      <figure class="plate plate-full plate-unnumbered" id="figure-runs">
        <div class="draw-wrap"><svg class="draw" style="--dd-draw-width: 640px" viewBox="0 0 640 176"
          role="img" aria-label="作業がレビューに届くと、別の実行でレポートを生成する。次の作業も並行して進められる。">
          <rect class="draw-box" x="8" y="52" width="160" height="64" rx="6"/>
          <text class="draw-label draw-strong" x="88" y="89" text-anchor="middle">レビューに到達</text>
          <path class="draw-line draw-arrow" d="M168 84H264V40H312"/>
          <path class="draw-line draw-arrow" d="M264 84V136H312"/>
          <rect class="draw-box-toned tone-blue" x="320" y="8" width="300" height="64" rx="6"/>
          <text class="draw-label draw-strong" x="470" y="45" text-anchor="middle">別の実行でレポートを生成</text>
          <rect class="draw-box" x="320" y="104" width="300" height="64" rx="6"/>
          <text class="draw-label" x="470" y="141" text-anchor="middle">次の作業を進める</text>
        </svg></div>
        <figcaption><span class="plate-label">図 2.</span>作業の実行枠とレポート生成は別に管理される。</figcaption>
      </figure>
    </div>
    <div class="figures">
      <figure><h3>読む場所はひとつ</h3><p>レポートは差分や PR と同じタブ列で開く。</p></figure>
      <figure><h3>タスク全体を説明</h3><p>最初の依頼から追加の修正までを一つの結果として読む。</p></figure>
      <figure><h3>根拠を残す</h3><p>図の説明には、検証条件と分かっていない点も添える。</p></figure>
    </div>
    <p class="caveat">レポートは判断の材料。作業を完了にするのは人です。</p>
  </section>
</article>
</body></html>
`)
repo.saveTaskReport(db, {
  taskId: reportTaskId,
  status: 'ready',
  // Matches the review projection of that task, so it does not read as written before the last change
  revision: '',
  path: reportPage,
  cwd: project0Path,
  logPath: join(reportHome, 'rpt_fixture.log'),
  error: '',
  startedAt: iso(22),
  endedAt: iso(20),
  pid: null,
  pending: '',
  exitPath: ''
})
writeFileSync(join(reportHome, 'rpt_fixture.log'), '# Quuu report\n# fixture\n')

repo.setSetting(
  db,
  'app',
  JSON.stringify({
    ...DEFAULT_SETTINGS,
    theme: 'dark',
    // Stop queued tasks from launching real agents
    autoStartScheduler: false,
    // The report surface is worth looking at, and the fixture agents run a harmless `true`
    reportEnabled: true,
    // Written by a group, so the screen shows the choice that is not a single name
    reportTargetKind: 'group',
    reportTargetId: agentGroup.id,
    // Do not mix in directly launched sessions (real history makes the screen unreadable)
    importExternalSessions: false,
    importCreateProjects: false,
    // Do not write fake tasks out to the production iCloud.
    mobileSyncEnabled: false
  })
)

// Only when run by hand: a harmless CLI that delays log creation and updates becomes available.
if (process.env.QUUU_FIXTURE_UX === '1') {
  const delayed = repo.insertAgent(db, {
    ...codex, name: 'Delayed-response check', command: process.execPath,
    argsTemplate: [fileURLToPath(new URL('./fixture-delayed-agent.mjs', import.meta.url)), dir, '{{sessionId}}', '{{prompt}}'],
    resumeArgsTemplate: [fileURLToPath(new URL('./fixture-delayed-agent.mjs', import.meta.url)), dir, '{{sessionId}}', '{{prompt}}'],
    sortOrder: 99
  })
  const project = repo.insertProject(db, { ...projects[0], name: 'UX check', path: dir, targetKind: 'agent', targetId: delayed.id })
  repo.insertTask(db, { projectId: project.id, title: 'Verify slow responses and send-back', prompt: 'Please confirm the response to input.', status: 'draft' })
  // Names picked to exercise sorting: case, numeric suffixes, and one CJK name for non-Latin collation
  for (const [i, name] of ['zebra', 'alpha', 'Beta', 'project-10', 'project-2', '日本語資料', ...Array.from({ length: 18 }, (_, i) => `library-${i + 1}`)].entries()) {
    repo.insertProject(db, { ...project, name, path: join(dir, 'projects', name), sortOrder: i + 20 })
  }
}

console.log(`fixture: ${dir}`)
// Count the imported ones too. If the numbers disagree, "thought it was created but was not" goes unnoticed
console.log(
  `  projects=${repo.listProjects(db).length} tasks=${repo.listTasks(db).length} runs=${runSeq}`
)
