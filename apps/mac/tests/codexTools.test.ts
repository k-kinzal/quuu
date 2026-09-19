import { describe, expect, it } from 'vitest'
import { readPlanSteps } from '../src/main/session/plan.js'
import { summarizePlan } from '../src/renderer/src/model/planSummary.js'
import { CodexSessionParser } from '../src/main/session/codexParser.js'
import { readCodexOutput, readCodexTool } from '../src/main/session/codexTools.js'
import { describeTool, inputLanguage } from '../src/renderer/src/model/session.js'
import { toolKind } from '../src/renderer/src/model/summarize.js'
import type { ToolCall } from '../src/main/session/types.js'

/**
 * Whether a Codex conversation reads as richly as a Claude one.
 *
 * Codex writes a tool call as a **fragment of JavaScript**, and every tool name is `exec`.
 * Without unpacking it the conversation surface becomes a row of "exec", "exec", "exec",
 * and not one line says what was run or what was rewritten (that is exactly what happened).
 */

const line = (payload: unknown): string =>
  JSON.stringify({ type: 'response_item', timestamp: '2026-08-22T01:00:00.000Z', payload })

describe('reading a Codex tool call', () => {
  it('pulls the command that was run out of the exec JavaScript', () => {
    const read = readCodexTool(
      'exec',
      'const r = await tools.exec_command({cmd:"npm run check",workdir:"/x",yield_time_ms:10000});\ntext(r.output);\n'
    )
    expect(read.name).toBe('exec_command')
    expect(read.target).toBe('npm run check')
    // What you see when you open it is the very fragment that ran
    expect(read.input).toContain('tools.exec_command')
  })

  it('takes a command containing newlines as one unbroken value', () => {
    const read = readCodexTool(
      'exec',
      'const r = await tools.exec_command({cmd:"set -eu\\nnpm test\\n",workdir:"/x"});'
    )
    expect(read.target).toBe('set -eu\nnpm test\n')
  })

  it('pulls the target of a diff out of the patch, the only place it is written', () => {
    const patch = [
      '*** Begin Patch',
      '*** Update File: src/dashboard/query.ts',
      '@@',
      '-ORDER BY created_at ASC',
      '+ORDER BY updated_at DESC',
      '*** End Patch'
    ].join('\n')

    expect(readCodexTool('apply_patch', patch)).toMatchObject({
      name: 'apply_patch',
      target: 'src/dashboard/query.ts'
    })
    // Even when the argument is a variable, the patch body is inside the same fragment
    expect(
      readCodexTool('exec', `const patch = \`${patch}\`;\nawait tools.apply_patch(patch);`).target
    ).toBe('src/dashboard/query.ts')
  })

  it('reads a diff even when it is embedded as a JavaScript string', () => {
    /*
     * The most common shape in practice. A raw fragment carries a newline as the two characters `\n`, so
     * nothing at all can be pulled out without reading it back as a string
     */
    const script =
      'const patch = "*** Begin Patch\\n*** Update File: src/store.rs\\n@@\\n-古い\\n+新しい\\n*** End Patch";\n' +
      'const r = await tools.apply_patch(patch);'
    expect(readCodexTool('exec', script).target).toBe('src/store.rs')
  })

  it('reads a plan out of the fragment and says it with the in-progress line and the progress', () => {
    const plan = (body: string): string => `const p = await tools.update_plan({${body}});\ntext(p);`
    expect(summarizePlan(readCodexTool('exec', plan('plan:[{step:"読む",status:"completed"},{step:"直す",status:"in_progress"}]')).plan ?? [])).toBe(
      '直す (1/2)'
    )
    // Both shapes arrive: keys wrapped in quotes, and an explanation in front
    expect(
      summarizePlan(readCodexTool('exec', plan('"explanation":"説明","plan":[{"step":"読む","status":"completed"},{"step":"直す","status":"in_progress"}]')).plan ?? [])
    ).toBe('直す (1/2)')
  })

  it('says a diff touching several files as the first one plus a count of the rest', () => {
    const patch = [
      '*** Begin Patch',
      '*** Update File: a.ts',
      '*** Add File: b.ts',
      '*** Delete File: c.ts',
      '*** End Patch'
    ].join('\n')
    expect(readCodexTool('apply_patch', patch).target).toBe('a.ts and 2 more')
  })

  it('normalizes the old shape (arguments as a JSON string) to the same shape', () => {
    const read = readCodexTool(
      'shell_command',
      JSON.stringify({ command: 'npm test -- dashboard', workdir: '/x' })
    )
    expect(read).toMatchObject({ name: 'exec_command', target: 'npm test -- dashboard' })
  })

  it('shows the command that ran inside, not the bash -lc wrapper', () => {
    const read = readCodexTool('shell', { command: ['bash', '-lc', 'rg -n TODO src'] })
    expect(read.target).toBe('rg -n TODO src')
  })

  it('invents neither a name nor a target for a fragment it cannot read', () => {
    const read = readCodexTool('exec', 'someOtherThing()\n')
    expect(read.name).toBe('exec')
    expect(read.target).toBe('someOtherThing()')
  })

  it('strips the result preamble (Script completed / Wall time / Output:)', () => {
    expect(readCodexOutput('Script completed\nWall time 0.4 seconds\nOutput:\nsrc/x.ts:42')).toMatchObject({
      text: 'src/x.ts:42',
      isError: false
    })
    // The failure marker lives only here. Unless it is picked up while stripping, a failure looks like a success
    expect(readCodexOutput('Script failed\nWall time 6.2 seconds\nOutput:\nFAIL tests/x').isError).toBe(
      true
    )
    expect(readCodexOutput('前置きの無い出力')).toMatchObject({ text: '前置きの無い出力', isError: false })
    // For something started in the background, this line alone carries the number
    expect(readCodexOutput('Script running with cell ID 11\nWall time 11.0 seconds\nOutput:\n').cellId).toBe('11')
  })
})

describe('a whole Codex rollout log', () => {
  const rollout = [
    line({
      type: 'reasoning',
      summary: [],
      content: [{ type: 'reasoning_text', text: '並び順の出どころを探す' }]
    }),
    line({
      type: 'custom_tool_call',
      call_id: 'c1',
      name: 'exec',
      input: 'const r = await tools.exec_command({cmd:"rg -n ORDER src",workdir:"/x"});'
    }),
    line({
      type: 'custom_tool_call_output',
      call_id: 'c1',
      output: [
        { type: 'input_text', text: 'Script completed\nWall time 0.4 seconds\nOutput:\n' },
        { type: 'input_text', text: 'src/query.ts:42' }
      ]
    }),
    line({
      type: 'function_call',
      call_id: 'c2',
      name: 'wait',
      arguments: JSON.stringify({ cell_id: '11', yield_time_ms: 30000 })
    }),
    line({
      type: 'custom_tool_call',
      call_id: 'c3',
      name: 'exec',
      input: 'const r = await tools.exec_command({cmd:"npm test"});'
    }),
    line({
      type: 'custom_tool_call_output',
      call_id: 'c3',
      output: 'Script failed\nWall time 6.2 seconds\nOutput:\nAssertionError'
    })
  ]

  it('reads it as thinking when the summary is empty but a body is there', () => {
    const parser = new CodexSessionParser()
    parser.pushLines(rollout)
    expect(parser.messages[0].blocks[0]).toEqual({
      kind: 'thinking',
      text: '並び順の出どころを探す'
    })
  })

  it('gives a call its target and binds the result to it without the preamble', () => {
    const parser = new CodexSessionParser()
    parser.pushLines(rollout)
    const tools = parser.messages
      .flatMap((m) => m.blocks)
      .filter((b): b is Extract<typeof b, { kind: 'tool' }> => b.kind === 'tool')
      .map((b) => b.tool)

    expect(tools.map((t) => [t.name, t.target])).toEqual([
      ['exec_command', 'rg -n ORDER src'],
      ['wait', null],
      ['exec_command', 'npm test']
    ])
    expect(tools[0].result).toBe('src/query.ts:42')
    expect(tools[0].isError).toBe(false)
    // A failed run does not end up looking like a successful one
    expect(tools[2]).toMatchObject({ isError: true, result: 'AssertionError' })
  })

  it('makes a waiting row readable through the command that started it', () => {
    /*
     * `wait` writes only a number. Without binding, rows saying just "waiting" pile up
     * (measured: 13% of all calls were these)
     */
    const parser = new CodexSessionParser()
    parser.pushLines([
      line({
        type: 'custom_tool_call',
        call_id: 'c1',
        name: 'exec',
        input: 'const r = await tools.exec_command({cmd:"cargo build"});'
      }),
      line({
        type: 'custom_tool_call_output',
        call_id: 'c1',
        output: 'Script running with cell ID 11\nWall time 11.0 seconds\nOutput:\n'
      }),
      line({
        type: 'function_call',
        call_id: 'c2',
        name: 'wait',
        arguments: JSON.stringify({ cell_id: '11', yield_time_ms: 30000 })
      })
    ])
    const tools = parser.messages
      .flatMap((m) => m.blocks)
      .filter((b): b is Extract<typeof b, { kind: 'tool' }> => b.kind === 'tool')
      .map((b) => b.tool)
    expect(tools[1]).toMatchObject({ name: 'wait', target: 'cargo build' })
  })

  it('makes a search one settled entry, since its call and its result share a line', () => {
    const parser = new CodexSessionParser()
    parser.pushLines([
      line({ type: 'web_search_call', call_id: 's1', action: { query: 'oklch とは' } })
    ])
    const block = parser.messages[0].blocks[0]
    expect(block).toMatchObject({ kind: 'tool' })
    if (block.kind !== 'tool') return
    expect(block.tool).toMatchObject({ name: 'web_search', target: 'oklch とは', result: '' })
  })
})

describe('a row reads the same whichever CLI wrote it', () => {
  const tool = (patch: Partial<ToolCall>): ToolCall => ({
    id: 't1',
    name: 'Bash',
    input: {},
    target: null,
    result: 'ok',
    isError: false,
    images: [],
    ...patch,
    plan: patch.plan ?? readPlanSteps(patch.input)
  })

  it('lines up rows that did the same thing under the same verb and the same kind', () => {
    for (const name of ['Bash', 'exec_command', 'shell_command', 'run_in_terminal']) {
      expect(toolKind(name)).toBe('shell')
      expect(describeTool(tool({ name }), null).verb).toBe('Run')
    }
    for (const name of ['Edit', 'apply_patch', 'edit_file']) {
      expect(toolKind(name)).toBe('write')
      expect(describeTool(tool({ name }), null).verb).toBe('Edit')
    }
  })

  it('falls back to the target the parser unpacked when no key yields one', () => {
    const d = describeTool(
      tool({ name: 'exec_command', target: '/x/y/npm run check', input: 'script' }),
      null
    )
    expect(d.target).toBe('/x/y/npm run check')
    expect(d.full).toBe('/x/y/npm run check')
  })

  it('shows a path relative to cwd (even when the CLI wrote an absolute one)', () => {
    const d = describeTool(
      tool({ name: 'apply_patch', target: '/Users/me/p/src/x.ts' }),
      '/Users/me/p'
    )
    expect(d.target).toBe('src/x.ts')
  })

  it('moves the name to the target side for an unknown tool (it never widens the verb column)', () => {
    const d = describeTool(tool({ name: 'mcp__chrome-devtools__click' }), null)
    expect(d.verb).toBe('Call')
    expect(d.target).toContain('mcp__chrome-devtools__click')
  })

  it('says a plan as "what it is doing now" plus the progress', () => {
    const codex = describeTool(
      tool({
        name: 'update_plan',
        input: {
          plan: [
            { step: '並び順を読む', status: 'completed' },
            { step: '降順へ変える', status: 'in_progress' },
            { step: 'テストを足す', status: 'pending' }
          ]
        }
      }),
      null
    )
    expect(codex.verb).toBe('Plan')
    expect(codex.target).toBe('降順へ変える (1/3)')

    // Claude's TodoWrite takes the same shape. Without this alignment the look changes per CLI
    const claude = describeTool(
      tool({
        name: 'TodoWrite',
        input: { todos: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }] }
      }),
      null
    )
    expect(claude.verb).toBe('Plan')
    expect(claude.target).toBe('b (1/2)')
  })

  it('colors what is inside when opened (diffs, fragments, named values)', () => {
    expect(inputLanguage('*** Begin Patch\n*** Update File: a.ts\n')).toBe('diff')
    expect(inputLanguage('const r = await tools.exec_command({cmd:"ls"});')).toBe('js')
    expect(inputLanguage({ file_path: 'a.ts' })).toBe('json')
    expect(inputLanguage('ただの文字列')).toBe('')
  })
})
