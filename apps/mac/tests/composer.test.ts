import { resizeInput as autoGrow, type GrowableInput } from '@design-system/react/input-behavior'
import { describe, expect, it } from 'vitest'
import { divideDraft, isImeComposing, isSubmitKey, joinDraft, splitDraft } from '../src/renderer/src/model/composer.js'
import type { KeyLike } from '../src/renderer/src/model/composer.js'

function key(k: string, mods: Partial<Omit<KeyLike, 'key' | 'nativeEvent'>> = {}): KeyLike {
  return {
    key: k,
    metaKey: false,
    ctrlKey: false,
    ...mods,
    nativeEvent: { isComposing: false, keyCode: 0 }
  }
}

/** A keydown during composition. The IME sends both commit and cancel in this shape. */
function composing(k: string, mods: Partial<Omit<KeyLike, 'key' | 'nativeEvent'>> = {}): KeyLike {
  return { ...key(k, mods), nativeEvent: { isComposing: true, keyCode: 229 } }
}

describe('the composer commit key', () => {
  it('does not commit on Enter alone (it inserts a newline)', () => {
    expect(isSubmitKey(key('Enter'))).toBe(false)
  })

  it('commits on Cmd+Enter and on Ctrl+Enter', () => {
    expect(isSubmitKey(key('Enter', { metaKey: true }))).toBe(true)
    expect(isSubmitKey(key('Enter', { ctrlKey: true }))).toBe(true)
  })

  it('does not commit even on Cmd+Enter while composing', () => {
    expect(isSubmitKey(composing('Enter', { metaKey: true }))).toBe(false)
  })

  it('never commits on a key other than Enter', () => {
    expect(isSubmitKey(key('a', { metaKey: true }))).toBe(false)
  })

  it('treats keyCode 229 as composing even when isComposing is not set', () => {
    const legacy: KeyLike = { ...key('Enter'), nativeEvent: { isComposing: false, keyCode: 229 } }
    expect(isImeComposing(legacy)).toBe(true)
  })

  it('gives Escape during composition to the input, not to the screen', () => {
    expect(isImeComposing(composing('Escape'))).toBe(true)
    expect(isImeComposing(key('Escape'))).toBe(false)
  })
})

describe('the composer following its height', () => {
  /** An input whose scrollHeight grows with its content. */
  function input(value: string, scrollHeight: number): GrowableInput {
    return { value, scrollHeight, style: { height: '' } }
  }

  it('opens as tall as the restored draft (never collapses to one line on reopen)', () => {
    const el = input('長い指示', 320)
    autoGrow(el, 'message')
    expect(el.style.height).toBe('240px')
  })

  it('matches the content height up to the cap', () => {
    const el = input('2 行ぶん', 96)
    autoGrow(el, 'message')
    expect(el.style.height).toBe('96px')
  })

  it('returns to the default height once it is empty (after sending)', () => {
    const el = input('', 32)
    el.style.height = '240px'
    autoGrow(el, 'message')
    expect(el.style.height).toBe('')
  })

  it('does not crash before the input exists', () => {
    expect(() => autoGrow(null, 'message')).not.toThrow()
  })
})

describe('splitting the composer draft', () => {
  it('yields only a title when there is a single line', () => {
    expect(splitDraft('doc 生成用の actions を作る')).toEqual({
      title: 'doc 生成用の actions を作る',
      prompt: ''
    })
  })

  it('turns the second line onward into the prompt', () => {
    expect(splitDraft('doc を作る\nPR 時に再生成して差分をコメントする')).toEqual({
      title: 'doc を作る',
      prompt: 'PR 時に再生成して差分をコメントする'
    })
  })

  it('keeps newlines and blank lines inside the prompt', () => {
    const { title, prompt } = splitDraft('移行する\n\n手順:\n1. 調べる\n\n2. 直す')
    expect(title).toBe('移行する')
    expect(prompt).toBe('手順:\n1. 調べる\n\n2. 直す')
  })

  it('skips leading blank lines to find the first line', () => {
    expect(splitDraft('\n\n直す\n理由はこう')).toEqual({ title: '直す', prompt: '理由はこう' })
  })

  it('does not turn trailing newlines alone into a prompt', () => {
    expect(splitDraft('直す\n\n  \n')).toEqual({ title: '直す', prompt: '' })
  })

  it('normalizes CRLF', () => {
    expect(splitDraft('直す\r\n理由はこう\r\nもう 1 行')).toEqual({
      title: '直す',
      prompt: '理由はこう\nもう 1 行'
    })
  })

  it('leaves the title empty for an empty string (a state that cannot be sent)', () => {
    expect(splitDraft('   \n  ')).toEqual({ title: '', prompt: '' })
  })
})

describe('how it divides while you are typing', () => {
  it('does not divide on a single line (the shape does not change mid-typing)', () => {
    expect(divideDraft('doc を作る')).toEqual({
      title: 'doc を作る',
      body: '',
      divided: false
    })
  })

  it('divides the moment a newline is typed - the first line settles even with an empty body', () => {
    expect(divideDraft('doc を作る\n')).toEqual({ title: 'doc を作る', body: '', divided: true })
  })

  it('keeps the second line onward as the body, newlines and blank lines intact', () => {
    expect(divideDraft('移行する\n手順:\n\n1. 調べる')).toEqual({
      title: '移行する',
      body: '手順:\n\n1. 調べる',
      divided: true
    })
  })

  it('does not trim whitespace while typing (trimming makes the caret jump)', () => {
    expect(divideDraft('直す \n 理由はこう ')).toEqual({
      title: '直す ',
      body: ' 理由はこう ',
      divided: true
    })
  })

  it('skips leading blank lines - the visible first line and the line that becomes the title agree', () => {
    const lead = divideDraft('\n\n直す\n理由はこう')
    expect(lead).toEqual({ title: '直す', body: '理由はこう', divided: true })
    expect(lead.title).toBe(splitDraft('\n\n直す\n理由はこう').title)
  })

  it('does not divide while there are only blank lines (pressing Enter alone changes nothing)', () => {
    expect(divideDraft('\n').divided).toBe(false)
    expect(divideDraft('').divided).toBe(false)
  })

  it('divides at the first line with CRLF too', () => {
    expect(divideDraft('直す\r\n理由はこう')).toEqual({
      title: '直す',
      body: '理由はこう',
      divided: true
    })
  })

  it('rejoins the two halves back into the same draft', () => {
    const text = '移行する\n手順:\n\n1. 調べる'
    const lead = divideDraft(text)
    expect(joinDraft(lead.title, lead.body)).toBe(text)
  })

  it('queues from the divided state into a title and a prompt', () => {
    const lead = divideDraft('doc を作る\nPR 時に再生成する')
    expect(splitDraft(joinDraft(lead.title, lead.body))).toEqual({
      title: 'doc を作る',
      prompt: 'PR 時に再生成する'
    })
  })
})
