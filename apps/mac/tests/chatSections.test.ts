import { describe, expect, it } from 'vitest'
import type { SessionMessage, SessionRole } from '../src/main/session/types.js'
import { buildSections, buildTurns, promptHeadline } from '../src/renderer/src/model/summarize.js'

/**
 * Group the conversation as "one instruction = one bundle".
 *
 * The headline is the one line saying which instruction the bundle responds to.
 * Break this and you lose your place in a long conversation.
 */

let seq = 0
const msg = (role: SessionRole, text: string, sidechain = false): SessionMessage => ({
  id: `m${++seq}`,
  role,
  isSidechain: sidechain,
  timestamp: null,
  blocks: [{ kind: 'text', text }],
  model: null
})

const sections = (messages: SessionMessage[]): ReturnType<typeof buildSections> =>
  buildSections(buildTurns(messages))

const call = (name: string): SessionMessage => ({
  ...msg('assistant', ''),
  blocks: [{ kind: 'tool', tool: { id: `${name}-${seq}`, name, input: {}, target: null, result: null, isError: false, images: [] } }]
})

describe('bundles per instruction', () => {
  it('each instruction starts a bundle, and responses join that bundle', () => {
    const result = sections([
      msg('user', '配色を作り直して'),
      msg('assistant', '測ります'),
      msg('assistant', '直しました'),
      msg('user', '罫も揃えて'),
      msg('assistant', '揃えました')
    ])

    expect(result).toHaveLength(2)
    expect(result[0].headline).toBe('配色を作り直して')
    // Consecutive messages from the same speaker fold into one turn, so one response
    expect(result[0].rest).toHaveLength(1)
    expect(result[1].headline).toBe('罫も揃えて')
    expect(result[1].rest).toHaveLength(1)
  })

  it('an instruction to a subagent does not start a bundle', () => {
    // A user message inside a delegation is not "an instruction we issued".
    // Splitting here shatters one request into several bundles and breaks the headline
    const result = sections([
      msg('user', '配色を作り直して'),
      msg('user', '色を測れ', true),
      msg('assistant', '測りました', true),
      msg('assistant', '直しました')
    ])

    expect(result).toHaveLength(1)
    expect(result[0].headline).toBe('配色を作り直して')
    // Three items: the delegation round-trip (instruction, response) plus the main-line response
    expect(result[0].rest).toHaveLength(3)
  })

  it('anything before the first instruction becomes a headline-less bundle', () => {
    // An imported session can start with agent output or log lines
    const result = sections([msg('system', '取り込みました'), msg('user', '続けて')])

    expect(result).toHaveLength(2)
    expect(result[0].head).toBeNull()
    expect(result[0].headline).toBe('')
    expect(result[1].headline).toBe('続けて')
  })

  it('an empty conversation makes no bundles', () => {
    expect(sections([])).toEqual([])
  })
})

describe('the one-line headline', () => {
  it('takes only the first paragraph, folding newlines into one line', () => {
    // Joining bullet lists and pasted logs pushes the point out of the visible width
    expect(promptHeadline('ヘッダを直して\nついでに罫も\n\n- 1 行にする\n- 省略あり')).toBe(
      'ヘッダを直して ついでに罫も'
    )
  })

  it('drops tags injected by the runtime — they are not what the human wrote', () => {
    expect(
      promptHeadline('<system-reminder>覚えておくこと</system-reminder>\nヘッダを直して')
    ).toBe('ヘッダを直して')
  })

  it('says nothing when the instruction is machine words only', () => {
    expect(promptHeadline('<command-name>/clear</command-name>')).toBe('')
  })
})

describe('names that survive paging', () => {
  it('keeps an item\'s name when the page loaded in front of it lengthens its turn', () => {
    // One response many messages long, as on a real run: a page boundary falls inside it
    const all = [msg('user', 'Do it'), call('Read'), msg('assistant', 'Looked'), msg('assistant', 'Then'), call('Edit'), call('Bash')]
    const [ask, read, looked, then, edit, bash] = all
    const names = (messages: SessionMessage[]): string[] =>
      buildTurns(messages).flatMap((turn) => turn.items.map((item) => item.id))

    expect(names(all.slice(3))).toEqual([`${then.id}:0`, `${edit.id}:0`, `${bash.id}:0`])
    // The prose that opened the window folds into the paragraph before it; every other item keeps its name
    expect(names(all)).toEqual([`${ask.id}:0`, `${read.id}:0`, `${looked.id}:0`, `${edit.id}:0`, `${bash.id}:0`])
  })
})
