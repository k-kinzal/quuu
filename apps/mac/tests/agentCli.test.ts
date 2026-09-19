import { describe, expect, it } from 'vitest'
import { promptAsValue, resumeInvocation } from '../src/main/agents/cli.js'
import { AgentOperations } from '../src/main/agents/operations.js'
import * as repo from '../src/main/db/repo.js'
import { seedIfEmpty } from '../src/main/seed.js'
import { memoryDb } from './helpers.js'

/**
 * A stopped session must come back in a form a human can continue.
 *
 * Get this wrong and you get "the terminal opened, but a new conversation started".
 * You only notice after you have finished typing, so pin the per-CLI shape here.
 */
describe('invocation shape when resuming interactively', () => {
  it('Claude Code passes the session ID to --resume', () => {
    expect(resumeInvocation({ command: 'claude', sessionId: 'abc-123' })).toEqual({
      command: 'claude',
      args: ['--resume', 'abc-123'],
      cliName: 'Claude Code'
    })
  })

  it('Codex uses the resume subcommand', () => {
    expect(resumeInvocation({ command: 'codex', sessionId: 'thread-1' })?.args).toEqual([
      'resume',
      'thread-1'
    ])
  })

  it('Cursor and Grok pass --resume as a separate argument', () => {
    expect(resumeInvocation({ command: 'cursor-agent', sessionId: 'chat-1' })?.args).toEqual([
      '--resume',
      'chat-1'
    ])
    expect(resumeInvocation({ command: 'grok', sessionId: 'g-1' })?.args).toEqual([
      '--resume',
      'g-1'
    ])
  })

  /* Its help says `--resume[=value]`; written separately, the ID is not read as the value */
  it('Copilot alone joins with =', () => {
    expect(resumeInvocation({ command: 'copilot', sessionId: 'sess-1' })?.args).toEqual([
      '--resume=sess-1'
    ])
  })

  it('recognizes the CLI even when the command was recorded as a full path', () => {
    const invocation = resumeInvocation({
      command: '/opt/homebrew/bin/claude',
      sessionId: 'abc'
    })
    // Invoke the recorded path as-is; only the recognition uses the basename
    expect(invocation).toEqual({
      command: '/opt/homebrew/bin/claude',
      args: ['--resume', 'abc'],
      cliName: 'Claude Code'
    })
  })

  /* Even when a user-defined agent picked stdout, resuming works from the command actually invoked. */
  it('resumes from the command even when the log adapter is stdout', () => {
    expect(
      resumeInvocation({ command: 'codex', adapter: 'stdout', sessionId: 's' })?.cliName
    ).toBe('Codex')
  })

  it('an imported session (no recorded command) is decided from the adapter', () => {
    expect(resumeInvocation({ command: '', adapter: 'cursor', sessionId: 's' })).toEqual({
      command: 'cursor-agent',
      args: ['--resume', 's'],
      cliName: 'Cursor'
    })
  })

  it('builds nothing without a session ID (never show a row that does nothing when pressed)', () => {
    expect(resumeInvocation({ command: 'claude', sessionId: null })).toBeNull()
    expect(resumeInvocation({ command: 'claude', sessionId: '   ' })).toBeNull()
  })

  it('builds nothing for an unknown CLI or an adapter that names no CLI', () => {
    expect(resumeInvocation({ command: 'my-agent', sessionId: 's' })).toBeNull()
    expect(resumeInvocation({ command: '', adapter: 'stdout', sessionId: 's' })).toBeNull()
    expect(resumeInvocation({ sessionId: 's' })).toBeNull()
  })
})

/**
 * A prompt is whatever the human typed, and some of it looks like arguments.
 *
 * "--cached is what git diff needs here" is a sentence; `codex exec` reads it as an unknown
 * option, prints its usage and exits — the agent never starts, and the run comes back as a failure
 * with no conversation to look at. Pin the per-CLI spelling that keeps the prompt text.
 */
describe('handing the prompt over as a value', () => {
  it('moves a positional prompt behind -- so options in the message stay text', () => {
    expect(promptAsValue('codex', ['exec', '--skip-git-repo-check', '{{prompt}}'])).toEqual([
      'exec',
      '--skip-git-repo-check',
      '--',
      '{{prompt}}'
    ])
  })

  it('moves the prompt to the end when flags follow it', () => {
    // `-- {{prompt}} --force` would hand `--force` to the agent as part of the message
    expect(
      promptAsValue('cursor-agent', ['--resume', '{{sessionId}}', '-p', '{{prompt}}', '--force'])
    ).toEqual(['--resume', '{{sessionId}}', '-p', '--force', '--', '{{prompt}}'])
  })

  /* Grok takes the prompt as `--single <PROMPT>`, and `--` there leaves the option with no value */
  it('joins the prompt onto the option with = where it is an option value', () => {
    expect(
      promptAsValue('grok', ['-p', '{{prompt}}', '--session-id', '{{sessionId}}'])
    ).toEqual(['--single={{prompt}}', '--session-id', '{{sessionId}}'])
  })

  /* Copilot's `-p, --prompt <text>` takes the next argument as-is, `--help` included */
  it('leaves Copilot alone, where the option already takes whatever follows', () => {
    const args = ['-p', '{{prompt}}', '--allow-all-tools']
    expect(promptAsValue('copilot', args)).toEqual(args)
  })

  it('changes nothing the second time (definitions are rewritten on every save)', () => {
    for (const [command, args] of [
      ['codex', ['exec', '{{prompt}}']],
      ['claude', ['-p', '{{prompt}}', '--model', 'opus']],
      ['grok', ['-p', '{{prompt}}']]
    ] as Array<[string, string[]]>) {
      const once = promptAsValue(command, args)
      expect(promptAsValue(command, once)).toEqual(once)
    }
  })

  it('leaves a hand-written -- where the user put it', () => {
    const args = ['exec', '--', '{{prompt}}', 'extra']
    expect(promptAsValue('codex', args)).toEqual(args)
  })

  it('leaves a prompt that is already spelled as a value', () => {
    const args = ['--message={{prompt}}']
    expect(promptAsValue('claude', args)).toEqual(args)
  })

  it('leaves an unknown CLI and a template with no prompt alone', () => {
    expect(promptAsValue('my-wrapper', ['-p', '{{prompt}}'])).toEqual(['-p', '{{prompt}}'])
    expect(promptAsValue('codex', [])).toEqual([])
    expect(promptAsValue('codex', ['exec', '{{title}}'])).toEqual(['exec', '{{title}}'])
  })

  it('recognizes the CLI from a full path, as resuming does', () => {
    expect(promptAsValue('/opt/homebrew/bin/codex', ['exec', '{{prompt}}'])).toEqual([
      'exec',
      '--',
      '{{prompt}}'
    ])
  })
})

/**
 * A definition the user typed themselves is corrected on the way in, so the settings screen keeps
 * showing what will actually run. It is the same repair the schema v18 migration applied once.
 */
describe('saving an agent definition', () => {
  it('stores the argument template with the prompt as a value', () => {
    const db = memoryDb()
    const agents = new AgentOperations(db, () => { }, () => { })
    const created = agents.createAgent({
      name: 'mine',
      description: '',
      command: 'claude',
      argsTemplate: ['-p', '{{prompt}}', '--model', 'opus'],
      resumeArgsTemplate: ['--resume', '{{sessionId}}', '-p', '{{prompt}}'],
      env: {},
      concurrency: 1,
      fallbackAgentId: null,
      limitPatterns: [],
      cooldownSeconds: 0,
      timeoutSeconds: 0,
      logAdapter: 'claude',
      enabled: false,
      sortOrder: 0
    })
    expect(created.argsTemplate).toEqual(['-p', '--model', 'opus', '--', '{{prompt}}'])
    expect(created.resumeArgsTemplate).toEqual(['--resume', '{{sessionId}}', '-p', '--', '{{prompt}}'])

    // The command is only in the stored row when the edit did not touch it
    const edited = agents.updateAgent(created.id, { argsTemplate: ['-p', '{{prompt}}'] })
    expect(edited.argsTemplate).toEqual(['-p', '--', '{{prompt}}'])
    db.close()
  })
})

/**
 * The seeded definitions are what most people ever run, and they are written out by hand in
 * `seed.ts` rather than passed through `promptAsValue`, so that the file reads as the invocation
 * that was actually verified. This is what keeps the two from drifting apart.
 */
describe('the definitions seeded on first launch', () => {
  it('already hand the prompt over as a value', async () => {
    const db = memoryDb()
    await seedIfEmpty(db)
    const agents = repo.listAgents(db)
    expect(agents.length).toBeGreaterThan(0)
    for (const agent of agents) {
      expect(promptAsValue(agent.command, agent.argsTemplate)).toEqual(agent.argsTemplate)
      expect(promptAsValue(agent.command, agent.resumeArgsTemplate)).toEqual(
        agent.resumeArgsTemplate
      )
    }
    db.close()
  })
})
