import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ClaudeSessionParser } from '../src/main/session/claudeParser.js'
import { CodexSessionParser } from '../src/main/session/codexParser.js'
import { SessionWatcher } from '../src/main/session/sessionWatcher.js'
import type { AppendedEvent } from '../src/main/session/sessionWatcher.js'
import { expectedSessionLogPath, resolveSessionLogPath, slugForCwd } from '../src/main/session/claudePaths.js'

const line = (obj: unknown): string => `${JSON.stringify(obj)}\n`

const SAMPLE = [
  line({ type: 'ai-title', sessionId: 's1', aiTitle: 'Queue を Stream にする' }),
  line({
    type: 'user',
    uuid: 'u1',
    timestamp: '2026-08-16T01:00:00.000Z',
    sessionId: 's1',
    message: { role: 'user', content: 'Queue ではなく Stream にしたい' }
  }),
  line({
    type: 'assistant',
    uuid: 'a1',
    timestamp: '2026-08-16T01:00:02.000Z',
    message: {
      role: 'assistant',
      model: 'claude-opus-5',
      content: [
        { type: 'thinking', thinking: 'まず現状を読む' },
        { type: 'text', text: '確認します。' },
        { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: '/src/queue.ts' } }
      ]
    }
  }),
  line({
    type: 'user',
    uuid: 'u2',
    timestamp: '2026-08-16T01:00:03.000Z',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'export class Queue {}' }]
    }
  }),
  line({ type: 'last-prompt', sessionId: 's1', leafUuid: 'u2', lastPrompt: 'x' }),
  line({
    type: 'assistant',
    uuid: 'a2',
    timestamp: '2026-08-16T01:00:05.000Z',
    message: { role: 'assistant', model: 'claude-opus-5', content: [{ type: 'text', text: '完了しました。' }] }
  })
].join('')

describe('parsing Claude session logs', () => {
  it('turns user / assistant / tool into chronological messages', () => {
    const parser = new ClaudeSessionParser()
    parser.pushLines(SAMPLE.split('\n'))

    expect(parser.title).toBe('Queue を Stream にする')
    expect(parser.messages).toHaveLength(3)

    expect(parser.messages[0].role).toBe('user')
    expect(parser.messages[0].blocks[0]).toEqual({
      kind: 'text',
      text: 'Queue ではなく Stream にしたい'
    })

    const assistant = parser.messages[1]
    expect(assistant.role).toBe('assistant')
    expect(assistant.model).toBe('claude-opus-5')
    expect(assistant.blocks.map((b) => b.kind)).toEqual(['thinking', 'text', 'tool'])
  })

  it('folds tool_result into the preceding tool_use', () => {
    const parser = new ClaudeSessionParser()
    parser.pushLines(SAMPLE.split('\n'))

    const toolBlock = parser.messages[1].blocks.find((b) => b.kind === 'tool')
    expect(toolBlock).toBeDefined()
    if (toolBlock?.kind !== 'tool') throw new Error('not a tool block')
    expect(toolBlock.tool.name).toBe('Read')
    expect(toolBlock.tool.result).toBe('export class Queue {}')
    expect(toolBlock.tool.isError).toBe(false)
  })

  it('does not display attachment / last-prompt / queue-operation', () => {
    const parser = new ClaudeSessionParser()
    parser.pushLines([
      line({ type: 'attachment', uuid: 'x', attachment: {} }),
      line({ type: 'queue-operation', operation: 'add', content: 'y' })
    ])
    expect(parser.messages).toHaveLength(0)
  })

  it('skips broken lines and keeps processing', () => {
    const parser = new ClaudeSessionParser()
    parser.pushLines([
      '{ this is not json',
      line({ type: 'user', uuid: 'u', message: { role: 'user', content: 'ok' } })
    ])
    expect(parser.messages).toHaveLength(1)
  })

  it('returns the index where changes start for incremental appends', () => {
    const parser = new ClaudeSessionParser()
    parser.pushLines([
      line({
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }]
        }
      })
    ])
    expect(parser.messages).toHaveLength(1)

    // A tool_result arriving later rewrites an existing message, so the index moves back
    const result = parser.pushLines([
      line({
        type: 'user',
        uuid: 'u1',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'a.ts', is_error: false }]
        }
      })
    ])
    expect(result.changedFromIndex).toBe(0)
  })

  it('marks subagent utterances', () => {
    const parser = new ClaudeSessionParser()
    parser.pushLines([
      line({
        type: 'assistant',
        uuid: 'a1',
        isSidechain: true,
        message: { role: 'assistant', content: [{ type: 'text', text: 'sub' }] }
      })
    ])
    expect(parser.messages[0].isSidechain).toBe(true)
  })

  it('distinguishes tool results that errored', () => {
    const parser = new ClaudeSessionParser()
    parser.pushLines([
      line({
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: {} }]
        }
      }),
      line({
        type: 'user',
        uuid: 'u1',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'boom', is_error: true }]
        }
      })
    ])
    const block = parser.messages[0].blocks[0]
    if (block.kind !== 'tool') throw new Error('not a tool block')
    expect(block.tool.isError).toBe(true)
  })
})

/**
 * CLIs write context as user-role lines. Displayed as-is, text no human
 * wrote would appear on screen as a human utterance.
 */
describe('injected lines are not shown as human utterances', () => {
  it('does not turn isMeta lines into utterances', () => {
    const parser = new ClaudeSessionParser()
    parser.pushLines([
      line({
        type: 'user',
        uuid: 'm1',
        isMeta: true,
        message: {
          role: 'user',
          content:
            '[Image: original 2940x1666, displayed at 2000x1133. Multiply coordinates by 1.47 to map to original image.]'
        }
      }),
      line({
        type: 'user',
        uuid: 'm2',
        isMeta: true,
        message: { role: 'user', content: 'Continue from where you left off.' }
      }),
      line({
        type: 'user',
        uuid: 'u1',
        message: { role: 'user', content: 'ここを直してください' }
      })
    ])

    expect(parser.messages).toHaveLength(1)
    expect(parser.messages[0].blocks[0]).toEqual({ kind: 'text', text: 'ここを直してください' })
  })

  it('keeps tool results even on isMeta lines', () => {
    const parser = new ClaudeSessionParser()
    parser.pushLines([
      line({
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'tu1', name: 'Bash', input: { command: 'ls' } }]
        }
      }),
      line({
        type: 'user',
        uuid: 'm1',
        isMeta: true,
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'a.ts' }]
        }
      })
    ])

    const block = parser.messages[0].blocks[0]
    if (block.kind !== 'tool') throw new Error('not a tool block')
    expect(block.tool.result).toBe('a.ts')
  })

  it('does not turn a compaction recap into an utterance', () => {
    const parser = new ClaudeSessionParser()
    parser.pushLines([
      line({
        type: 'user',
        uuid: 'c1',
        /*
         * When context runs out the CLI writes its recap of the conversation
         * back under the user role. Quoting the human inside it makes it read
         * like them, so the flags the CLI marks it with are what tells them apart.
         */
        isCompactSummary: true,
        isVisibleInTranscriptOnly: true,
        message: {
          role: 'user',
          content:
            'This session is being continued from a previous conversation that ran out of context.\n\nSummary:\n1. Primary Request and Intent:\n   - 「ここを直してください」'
        }
      }),
      line({
        type: 'user',
        uuid: 'u1',
        message: { role: 'user', content: '続きをお願いします' }
      })
    ])

    expect(parser.messages).toHaveLength(1)
    expect(parser.messages[0].blocks[0]).toEqual({ kind: 'text', text: '続きをお願いします' })
  })

  it('context wholly wrapped in tags is not an utterance', () => {
    const parser = new ClaudeSessionParser()
    parser.pushLines([
      line({
        type: 'user',
        uuid: 'x1',
        message: {
          role: 'user',
          content: '<task-notification>\n<task-id>abc</task-id>\n</task-notification>'
        }
      }),
      line({
        type: 'user',
        uuid: 'x2',
        // A single-line tag a human wrote is kept (injections are always multi-line)
        message: { role: 'user', content: '<div>これを直して</div>' }
      })
    ])

    expect(parser.messages).toHaveLength(1)
    expect(parser.messages[0].blocks[0]).toEqual({ kind: 'text', text: '<div>これを直して</div>' })
  })

  it('concatenated chunks of tags are not an utterance either', () => {
    const parser = new ClaudeSessionParser()
    parser.pushLines([
      line({
        type: 'user',
        uuid: 'y1',
        /*
         * An injection is not always a single tag. Cursor concatenates the
         * environment info and the skill list into one utterance (observed).
         */
        message: {
          role: 'user',
          content:
            '<user_info>\nOS: darwin\n</user_info>\n<agent_skills>\n<available>\nx\n</available>\n</agent_skills>'
        }
      }),
      line({
        type: 'user',
        uuid: 'y2',
        // Text outside the tags means a human wrote it, so it is kept
        message: { role: 'user', content: '<note>\n参考\n</note>\nこれを直して' }
      })
    ])

    expect(parser.messages).toHaveLength(1)
    expect(parser.messages[0].blocks[0]).toEqual({
      kind: 'text',
      text: '<note>\n参考\n</note>\nこれを直して'
    })
  })

  it("does not turn Codex's environment info and AGENTS.md preamble into utterances", () => {
    const parser = new CodexSessionParser()
    const item = (text: string): string =>
      line({
        type: 'response_item',
        timestamp: '2026-08-17T01:00:00.000Z',
        payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] }
      })

    parser.pushLines([
      item('# AGENTS.md instructions for /Users/me/Projects/taskd\n\n<INSTRUCTIONS>\n読め\n</INSTRUCTIONS>'),
      item('<environment_context>\n  <cwd>/Users/me/Projects/taskd</cwd>\n</environment_context>'),
      item('CI が落ちています。直してください。')
    ])

    expect(parser.messages).toHaveLength(1)
    expect(parser.messages[0].blocks[0]).toEqual({
      kind: 'text',
      text: 'CI が落ちています。直してください。'
    })
    // The title, too, comes from the user's own prompt, not the injection
    expect(parser.title).toBe('CI が落ちています。直してください。')
  })

  it("does not treat Codex's concatenated compound preamble as the user's utterance and keeps the prompt that follows", () => {
    const parser = new CodexSessionParser()
    const item = (text: string): string =>
      line({
        type: 'response_item',
        timestamp: '2026-08-24T11:00:31.102Z',
        payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] }
      })
    const prompt = 'mixed の許可ルールについて、まず反例を調べてください。'

    parser.pushLines([
      item(
        [
          '<recommended_plugins>\n- plugin-a\n</recommended_plugins>',
          '# AGENTS.md instructions for /Users/me/Projects/taskd\n\n<INSTRUCTIONS>\n読め\n</INSTRUCTIONS>',
          '<environment_context>\n  <cwd>/Users/me/Projects/taskd</cwd>\n</environment_context>'
        ].join('\n')
      ),
      item(prompt)
    ])

    expect(parser.messages).toHaveLength(1)
    expect(parser.messages[0]).toMatchObject({
      role: 'user',
      blocks: [{ kind: 'text', text: prompt }]
    })
    expect(parser.title).toBe(prompt)
  })
})

describe('session log path resolution', () => {
  it('replaces non-alphanumerics in cwd with -', () => {
    expect(slugForCwd('/Users/me/Projects/app')).toBe('-Users-me-Projects-app')
    expect(slugForCwd('/Users/me/.claude')).toBe('-Users-me--claude')
    expect(slugForCwd('/Users/me/Projects/ai-toolkit/.claude/worktrees/doc-gen')).toBe(
      '-Users-me-Projects-ai-toolkit--claude-worktrees-doc-gen'
    )
  })

  it('searches every directory when the log is not at the expected path', () => {
    const root = mkdtempSync(join(tmpdir(), 'taskd-claude-'))
    process.env.QUUU_CLAUDE_PROJECTS_DIR = root
    try {
      const other = join(root, '-somewhere-else')
      mkdirSync(other, { recursive: true })
      writeFileSync(join(other, 'abc-123.jsonl'), '')

      expect(existsSync(expectedSessionLogPath('/Users/me/Projects/app', 'abc-123'))).toBe(false)
      expect(resolveSessionLogPath('/Users/me/Projects/app', 'abc-123')).toBe(
        join(other, 'abc-123.jsonl')
      )
    } finally {
      delete process.env.QUUU_CLAUDE_PROJECTS_DIR
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('session tailing', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'taskd-watch-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('opens an existing log and returns the tail window', () => {
    const path = join(dir, 's1.jsonl')
    writeFileSync(path, SAMPLE)

    const watcher = new SessionWatcher()
    const snapshot = watcher.open({ runId: 'run1', sessionId: 's1', logPath: path, mode: 'claude' })
    watcher.close()

    expect(snapshot.exists).toBe(true)
    expect(snapshot.title).toBe('Queue を Stream にする')
    expect(snapshot.messages).toHaveLength(3)
    expect(snapshot.hasMore).toBe(false)
  })

  it('can open before the log exists', () => {
    const watcher = new SessionWatcher()
    const snapshot = watcher.open({
      runId: 'run2',
      sessionId: 's2',
      logPath: join(dir, 'missing.jsonl'),
      mode: 'claude'
    })
    watcher.close()

    expect(snapshot.exists).toBe(false)
    expect(snapshot.messages).toHaveLength(0)
  })

  it('fires appended when the log grows', async () => {
    const path = join(dir, 's3.jsonl')
    writeFileSync(path, SAMPLE)

    const watcher = new SessionWatcher()
    watcher.open({ runId: 'run3', sessionId: 's3', logPath: path, mode: 'claude' })

    const appended = new Promise<{ messages: unknown[] }>((resolve) => {
      watcher.once('appended', resolve)
    })

    appendFileSync(
      path,
      line({
        type: 'assistant',
        uuid: 'a3',
        message: { role: 'assistant', content: [{ type: 'text', text: '追記されたメッセージ' }] }
      })
    )

    // Even if fs.watch misses it, polling always catches up
    const event = await appended
    watcher.close()
    expect(event.messages).toHaveLength(1)
  }, 10000)

  it('switches to a log the CLI writes under a different ID as soon as it is found', async () => {
    // A file with the ID Quuu assigned never gets created. Switch the watch
    // target once the real file is found, so the conversation still appears
    // while the view sits open waiting.
    const real = join(dir, 'cli-9999.jsonl')

    const watcher = new SessionWatcher()
    const snapshot = watcher.open({
      runId: 'run9',
      sessionId: 'quuu-9999',
      logPath: join(dir, 'quuu-9999.jsonl'),
      mode: 'claude',
      resolve: () => (existsSync(real) ? { sessionId: 'cli-9999', logPath: real } : null)
    })
    expect(snapshot.exists).toBe(false)

    const appended = new Promise<AppendedEvent>((resolve) => {
      watcher.once('appended', resolve)
    })
    writeFileSync(real, SAMPLE)

    const event = await appended
    watcher.close()
    expect(event.runId).toBe('run9')
    expect(event.sessionId).toBe('cli-9999')
    expect(event.messages).toHaveLength(3)
  }, 10000)

  it('moving from provisional stdout to the structured log replaces the old log and read target wholesale, then keeps appending', async () => {
    const raw = join(dir, 'startup.log')
    const structured = join(dir, 'structured.jsonl')
    writeFileSync(raw, 'CLI を起動しています\n')
    const watcher = new SessionWatcher()
    try {
      const initial = watcher.open({
        runId: 'switch-run', sessionId: 'pending', logPath: raw, mode: 'stdout', resolveWhilePresent: true,
        resolve: () => existsSync(structured) ? { sessionId: 's1', logPath: structured, mode: 'claude' } : null
      })
      expect(initial.messages[0].id).toBe('stdout_0')
      const replaced = new Promise<AppendedEvent>(resolve => watcher.once('appended', resolve))
      writeFileSync(structured, SAMPLE)
      const event = await replaced
      expect(event.replacement).toMatchObject({ logPath: structured, exists: true, totalMessages: 3 })
      expect(event.messages.some(message => message.id.startsWith('stdout_'))).toBe(false)
      const appended = new Promise<AppendedEvent>(resolve => watcher.once('appended', resolve))
      appendFileSync(structured, line({ type: 'assistant', uuid: 'after-switch', message: { role: 'assistant', content: [{ type: 'text', text: '次の応答' }] } }))
      const next = await appended
      expect(next.replacement).toBeUndefined()
      expect(next.messages[0].id).toBe('after-switch')
    } finally { watcher.close() }
  }, 10000)

  it('catches up via polling even when fs.watch never fires', async () => {
    const path = join(dir, 's4.jsonl')
    writeFileSync(path, SAMPLE)

    const watcher = new SessionWatcher()
    watcher.open({ runId: 'run4', sessionId: 's4', logPath: path, mode: 'claude' })
    // Stop the file watchers so only polling remains
    watcher.stopFileWatchersForTest()

    const appended = new Promise<{ messages: unknown[] }>((resolve) => {
      watcher.once('appended', resolve)
    })
    appendFileSync(
      path,
      line({
        type: 'assistant',
        uuid: 'a4',
        message: { role: 'assistant', content: [{ type: 'text', text: 'ポーリング経由' }] }
      })
    )

    const event = await appended
    watcher.close()
    expect(event.messages).toHaveLength(1)
  }, 10000)
})
