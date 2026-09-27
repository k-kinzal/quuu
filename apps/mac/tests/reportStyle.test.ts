import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { projectReportPrompt, reportPrompt } from '../src/main/report/prompt.js'

const vendored = (file: string): string =>
  readFileSync(new URL(`../src/main/report/vendor/document-design/${file}`, import.meta.url), 'utf8')
const css = vendored('v1.1.0/document-design.css')
const taskPrompt = reportPrompt({
  cwd: '/tmp', title: 'Task', prompt: 'Task', revision: null, uncommitted: null,
  changes: [], commits: [], pullRequests: [], runs: [],
  page: '/tmp/reports/task/r.html', instructions: ''
})
const prompts = [
  { kind: 'task', prompt: taskPrompt },
  { kind: 'project', prompt: projectReportPrompt({
    cwd: '/tmp', title: 'Project', page: '/tmp/reports/project/r.html', instructions: ''
  }) }
]

describe('document-design report assets', () => {
  it('ships the unmodified v1.1.0 distribution with no external asset dependencies', () => {
    expect(createHash('sha256').update(css).digest('hex'))
      .toBe('8874255e9deb2d159016522e985015be6a5d7a88c90c077704b5d762567b7ebd')
    expect(css).not.toMatch(/@import\b|url\(\s*["']?(?:https?:|\/\/)/i)
    expect(css).toContain('color-scheme: light dark')
  })

  it('carries the MIT license and provenance beside the stylesheet it names', () => {
    const license = vendored('v1.1.0/LICENSE')
    const notice = vendored('v1.1.0/NOTICE.txt')
    expect(license).toMatch(/^MIT License\n\nCopyright \(c\) 2026 k-kinzal\n/)
    expect(notice).toContain(license)
    expect(notice).toContain('ee789d04fb775b735c3217d74019642485c9a297')
    expect(notice).toContain('8874255e9deb2d159016522e985015be6a5d7a88c90c077704b5d762567b7ebd')
  })

  it('keeps the v1.0.0 stylesheet that earlier reports link to byte for byte', () => {
    expect(createHash('sha256').update(vendored('v1.0.0/document-design.css')).digest('hex'))
      .toBe('05f312d9faf6de35a0995cfa9434df1cab3a93c836a533307f9e23338a527793')
  })

  it.each(prompts)('teaches only bundled components and drawing tokens for $kind reports', ({ prompt }) => {
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

  it.each(prompts)('sets print options and citations the stylesheet defines for $kind reports', ({ prompt }) => {
    expect(prompt).toContain('<html lang="..." data-dd-paper="a4" data-dd-print-urls="sources">')
    expect(css).toContain('[data-dd-paper="a4"]')
    expect(css).toContain('[data-dd-print-urls="sources"]')
    expect(css).toContain('.sheet .hero > .figures')
    expect(css).toContain('.timeline-item.is-open')
    expect(prompt).toContain('<a class="cite" href="#source-1">1</a>')
    expect(prompt).toContain('<li id="source-1">')
  })

  it.each(prompts)('keeps $kind figures readable and usable in the static offline viewer', ({ prompt }) => {
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
