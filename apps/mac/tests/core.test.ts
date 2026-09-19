import { describe, expect, it } from 'vitest'
import { expandArgs, expandTemplate, unknownVars } from '../src/main/execution/templating.js'
import type { TemplateVars } from '../src/main/execution/templating.js'
import { classifyRunResult } from '../src/main/execution/errorClassifier.js'

const vars: TemplateVars = {
  prompt: 'Queue を Stream にする\n改行を含む',
  title: 'Stream 化',
  sessionId: '11111111-2222-3333-4444-555555555555',
  projectPath: '/Users/me/Projects/app',
  projectName: 'app',
  taskId: 'tsk_1',
  runId: 'run_1'
}

describe('argument templates', () => {
  it('expands placeholders', () => {
    expect(expandTemplate('{{projectName}}', vars)).toBe('app')
    expect(expandTemplate('--session-id={{sessionId}}', vars)).toBe(`--session-id=${vars.sessionId}`)
  })

  it('keeps a prompt containing newlines as a single argument', () => {
    const args = expandArgs(['-p', '{{prompt}}'], vars)
    expect(args).toHaveLength(2)
    expect(args[1]).toBe(vars.prompt)
    expect(args[1]).toContain('\n')
  })

  it('leaves unknown variables as-is', () => {
    expect(expandTemplate('{{nope}}', vars)).toBe('{{nope}}')
    expect(unknownVars(['{{prompt}}', '{{nope}}'])).toEqual(['nope'])
  })

  it('accepts placeholders with inner whitespace', () => {
    expect(expandTemplate('{{ projectName }}', vars)).toBe('app')
  })
})

describe('run result classification', () => {
  const base = { signal: null, limitPatterns: [], timedOut: false, canceled: false }

  it('exit code 0 is success', () => {
    expect(classifyRunResult({ ...base, exitCode: 0, output: 'done' }).kind).toBeNull()
  })

  it('detects limit messages', () => {
    expect(
      classifyRunResult({
        ...base,
        exitCode: 1,
        output: 'Error: Claude AI usage limit reached. Resets at 3pm'
      }).kind
    ).toBe('limit')

    expect(classifyRunResult({ ...base, exitCode: 1, output: 'HTTP 429 Too Many Requests' }).kind).toBe(
      'limit'
    )
    expect(classifyRunResult({ ...base, exitCode: 1, output: 'Overloaded' }).kind).toBe('limit')
  })

  it('reports the line that announced the limit, not the CLI epilogue after it', () => {
    // Codex signs off with its token count, which is what a human used to be shown as the reason
    const result = classifyRunResult({
      ...base,
      exitCode: 1,
      output: "ERROR: You've hit your usage limit. Try again at Sep 19th, 2126 7:13 PM.\ntokens used\n1,888,438"
    })
    expect(result.kind).toBe('limit')
    expect(result.message).toContain('usage limit')
    expect(result.message).not.toBe('1,888,438')
    // The stated moment is carried out with it (the reading itself is limitWindow's test)
    expect(result.retryAt).toBe(new Date(2126, 8, 19, 19, 13, 0, 0).toISOString())
  })

  it('leaves the lift time unknown when the limit message never named one', () => {
    expect(classifyRunResult({ ...base, exitCode: 1, output: 'Overloaded' }).retryAt).toBeNull()
  })

  it('distinguishes auth errors from limits', () => {
    expect(
      classifyRunResult({ ...base, exitCode: 1, output: 'Invalid API key · Please run /login' }).kind
    ).toBe('auth')
  })

  it('supports custom patterns', () => {
    expect(
      classifyRunResult({
        ...base,
        exitCode: 1,
        output: '独自の上限に達しました',
        limitPatterns: ['独自の上限']
      }).kind
    ).toBe('limit')
  })

  it('an invalid regex does not crash and falls back to literal matching', () => {
    expect(
      classifyRunResult({
        ...base,
        exitCode: 1,
        output: 'my [broken pattern here',
        limitPatterns: ['[broken']
      }).kind
    ).toBe('limit')
  })

  it('cancellation and timeout are classified first', () => {
    expect(classifyRunResult({ ...base, exitCode: null, output: '', canceled: true }).kind).toBe(
      'canceled'
    )
    expect(classifyRunResult({ ...base, exitCode: null, output: '', timedOut: true }).kind).toBe(
      'timeout'
    )
  })

  it('picks the error message out of JSON output', () => {
    const result = classifyRunResult({
      ...base,
      exitCode: 1,
      output: '{"type":"result","is_error":true,"message":"context length exceeded"}'
    })
    expect(result.kind).toBe('nonzero-exit')
    expect(result.message).toBe('context length exceeded')
  })

  it('everything else is treated as an abnormal exit', () => {
    const result = classifyRunResult({ ...base, exitCode: 2, output: 'something went wrong' })
    expect(result.kind).toBe('nonzero-exit')
    expect(result.message).toContain('something went wrong')
  })
})
