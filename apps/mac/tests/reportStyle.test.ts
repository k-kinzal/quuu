import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { reportPrompt } from '../src/main/report/prompt.js'

const css = readFileSync(new URL('../src/main/report/vendor/document-design/v1.0.0/document-design.css', import.meta.url), 'utf8')
const prompt = reportPrompt({
  cwd: '/tmp', title: 'Task', prompt: 'Task', revision: null,
  changes: [], commits: [], pullRequests: [], runs: [],
  page: '/tmp/reports/task/r.html', instructions: ''
})

describe('document-design report assets', () => {
  it('ships the unmodified v1.0.0 distribution with no external asset dependencies', () => {
    expect(createHash('sha256').update(css).digest('hex'))
      .toBe('05f312d9faf6de35a0995cfa9434df1cab3a93c836a533307f9e23338a527793')
    expect(css).not.toMatch(/@import\b|url\(\s*["']?(?:https?:|\/\/)/i)
    expect(css).toContain('color-scheme: light dark')
  })

  it('teaches only components and drawing tokens that exist in the bundled version', () => {
    const drawn = new Set([...css.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((match) => match[1]))
    const named = [...prompt.matchAll(/^- \.([a-z][a-z0-9- /]*) —/gm)]
      .flatMap((match) => match[1].split('/').map((part) => part.trim()))
    expect(named.length).toBeGreaterThan(0)
    for (const name of named) expect(drawn, name).toContain(name)
    for (const match of prompt.matchAll(/class="([^"]+)"/g)) {
      for (const name of match[1].split(' ')) expect(drawn, name).toContain(name)
    }
    for (const match of prompt.matchAll(/var\((--dd-[a-z-]+)\)/g)) {
      expect(css).toMatch(new RegExp(`${match[1]}\\s*:`))
    }
    expect(prompt).not.toMatch(/class="(?:page|three|holds|hold|mono)"|var\(--(?:ink|now|rule)\)/)
  })

  it('keeps figures readable and usable in the static offline viewer', () => {
    expect(prompt).toContain('inside .draw-wrap')
    expect(prompt).toContain('--dd-draw-width: 640px')
    expect(prompt).toContain('id="dd-arrow"')
    expect(prompt).toContain('<meta name="viewport"')
    expect(prompt).toContain('lang="ja"')
    expect(prompt).toContain('Captions explain what the figure establishes')
    expect(prompt).toContain('omit controls that need document-design.js')
    expect(prompt).not.toMatch(/<script\s+src=|href="https?:.*\.css/)
  })
})
