import { describe, expect, it } from 'vitest'
import { promptAsValue, resumeInvocation } from '../src/main/agents/cli.js'
import type { LogAdapter } from '../src/main/agents/cliAdapter.js'
import { classifyDetachedResult, classifyRunResult } from '../src/main/agent-adapters/result.js'
import { newParser, isStoreParser } from '../src/main/session/sessionWatcher.js'
import { instructionsSince } from '../src/main/session/delivery.js'

// Characterization at the public seams, recorded before moving any implementation.
// These inputs stay fixed when the implementations move behind per-agent adapters.
describe('agent boundary compatibility', () => {
  it.each<[LogAdapter, string, string[]]>([
    ['claude', 'claude', ['--resume', 'session-1']],
    ['codex', 'codex', ['resume', 'session-1']],
    ['cursor', 'cursor-agent', ['--resume', 'session-1']],
    ['grok', 'grok', ['--resume', 'session-1']],
    ['copilot', 'copilot', ['--resume=session-1']],
    ['agy', 'agy', ['--conversation', 'session-1']],
    ['opencode', 'opencode', ['--session', 'session-1']]
  ])('%s resumes with the same CLI and session argument', (adapter, command, args) => {
    expect(resumeInvocation({ adapter, sessionId: 'session-1' })).toMatchObject({ command, args })
    expect(resumeInvocation({ command: `/opt/bin/${command}`, sessionId: 'session-1' }))
      .toMatchObject({ command: `/opt/bin/${command}`, args })
  })

  it.each([
    ['claude', ['-p', '{{prompt}}'], ['-p', '--', '{{prompt}}']],
    ['codex', ['exec', '{{prompt}}'], ['exec', '--', '{{prompt}}']],
    ['cursor-agent', ['-p', '{{prompt}}'], ['-p', '--', '{{prompt}}']],
    ['grok', ['-p', '{{prompt}}'], ['--single={{prompt}}']],
    ['agy', ['--print', '{{prompt}}'], ['--print={{prompt}}']],
    ['copilot', ['-p', '{{prompt}}'], ['-p', '{{prompt}}']],
    ['opencode', ['run', '{{prompt}}'], ['run', '{{prompt}}']]
  ] as const)('%s preserves the spelling that passes a prompt as text', (command, before, after) => {
    expect(promptAsValue(command, before)).toEqual(after)
    expect(promptAsValue(command, after)).toEqual(after)
  })

  it.each([
    ["You've reached your Fable limit. Switch to another model.", 'limit'],
    ['ERROR: usage limit. Try again at Sep 19th, 2126 7:13 PM.\ntokens used\n1,888,438', 'limit'],
    ['Invalid API key · Please run /login', 'auth'],
    ['ordinary failure', 'nonzero-exit']
  ])('keeps the existing classification of %s', (output, kind) => {
    const input = { output, limitPatterns: [], exitCode: 1, signal: null, timedOut: false, canceled: false }
    expect(classifyRunResult(input).kind).toBe(kind)
    if (kind === 'limit') expect(classifyDetachedResult(input)).toEqual(classifyRunResult(input))
    expect(classifyRunResult({ ...input, exitCode: 0 }).kind).toBeNull()
    expect(classifyRunResult({ ...input, canceled: true }).kind).toBe('canceled')
    expect(classifyRunResult({ ...input, timedOut: true }).kind).toBe('timeout')
  })

  it('keeps injected Claude turns and tool results out of delivered human instructions', () => {
    const parser = newParser('claude')
    if (isStoreParser(parser)) throw new Error('expected a stream parser')
    const at = '2026-09-23T00:00:01.000Z'
    const entry = (uuid: string, content: unknown, extra = {}): string => JSON.stringify({
      type: 'user', uuid, timestamp: at, message: { role: 'user', content }, ...extra
    })
    parser.pushLines([
      entry('human', 'Please keep this instruction'),
      entry('meta', 'An injected reminder', { isMeta: true }),
      entry('summary', 'A generated recap', { isCompactSummary: true }),
      entry('side', 'A subagent instruction', { isSidechain: true }),
      entry('tool', [{ type: 'tool_result', tool_use_id: 'read-1', content: 'file contents' }])
    ])
    expect(instructionsSince(parser.messages, { startedAt: '2026-09-23T00:00:00.000Z', promptPreview: '' }))
      .toEqual(['Please keep this instruction'])
    expect(parser.messages.find(message => message.id === 'meta')?.role).not.toBe('user')
    expect(parser.messages.find(message => message.id === 'summary')?.role).not.toBe('user')
  })
})
