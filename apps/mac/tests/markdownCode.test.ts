import { describe, expect, it } from 'vitest'
import { codeToTokens, type BundledLanguage, type ThemedToken } from 'shiki'
import { isDiagramLanguage, resolveLanguage } from '../../../packages/design-system/src/markdown/language.js'
import { safeUrl } from '../../../packages/design-system/src/markdown/url.js'
import { shikiTheme } from '../../../packages/design-system/src/markdown/shikiTheme.js'
import { TOKENIZE, highlightCode } from '../../../packages/design-system/src/markdown/highlight.js'
import { palettes, syntaxTokens } from '../../../packages/design-system/src/theme/tokens.js'

/**
 * Code highlighting.
 *
 * Grammar interpretation is left to shiki, so what we check here is only **what
 * we decided ourselves**: which languages get highlighted, whether the colors
 * come from the tokens, and whether **not a single character is lost** once
 * colored.
 */

describe('language resolution', () => {
  it.each([
    ['ts', 'ts'],
    ['TypeScript', 'typescript'],
    ['bash', 'bash'],
    ['zsh', 'zsh'],
    ['yml', 'yml'],
    ['diff', 'diff'],
    ['dockerfile', 'docker'],
    ['terminal', 'shellsession'],
    ['mmd', 'mermaid']
  ])('%s → %s', (given, expected) => {
    expect(resolveLanguage(given)).toBe(expected)
  })

  it('languages we chose not to highlight resolve to null (a wrong color is worse than none)', () => {
    for (const plain of ['', 'text', 'plaintext', 'log', 'output']) {
      expect(resolveLanguage(plain)).toBeNull()
    }
  })

  it('unknown languages resolve to null instead of leaning on a similar grammar', () => {
    expect(resolveLanguage('プログラミング言語')).toBeNull()
    expect(resolveLanguage('not-a-language')).toBeNull()
  })

  it('tells apart fences that are drawn as diagrams', () => {
    expect(isDiagramLanguage('mermaid')).toBe(true)
    expect(isDiagramLanguage('MMD')).toBe(true)
    expect(isDiagramLanguage('ts')).toBe(false)
  })
})

describe('where the colors come from', () => {
  it.each(['dark', 'light'] as const)('%s colors come from the tokens', (scheme) => {
    const theme = shikiTheme(scheme)
    // As the interface type, `Object.values` degrades to any, so move into a plain record
    const syntax: Record<string, string> = { ...syntaxTokens(palettes[scheme]) }
    const accents: Record<string, string> = { ...palettes[scheme].accents }
    const allowed = new Set(
      [...Object.values(syntax), ...Object.values(accents), palettes[scheme].surface.subtle].map(
        (color) => color.toLowerCase()
      )
    )

    for (const rule of theme.settings ?? []) {
      const color = rule.settings.foreground
      if (color) expect(allowed, `color of ${String(rule.scope)}`).toContain(color.toLowerCase())
    }
  })

  it('comments recede by register, not by color (italic + tertiary)', () => {
    const rule = (shikiTheme('dark').settings ?? []).find((r) =>
      Array.isArray(r.scope) ? r.scope.includes('comment') : r.scope === 'comment'
    )
    expect(rule?.settings.foreground).toBe(palettes.dark.text.tertiary)
    expect(rule?.settings.fontStyle).toBe('italic')
  })
})

/** shiki normalizes colors to uppercase; align the notation before comparing */
function sameColor(actual: string | undefined, expected: string): boolean {
  return (actual ?? '').toLowerCase() === expected.toLowerCase()
}

describe('highlighting output', () => {
  const SAMPLES: [string, string][] = [
    ['ts', "export const a: number = 1 // 説明\nfunction f(x: string) { return `${x}!` }"],
    ['json', '{"name": "Quuu", "runs": 3, "ok": true}'],
    ['bash', 'npm run check | tee out.log  # 検算\nif [ -f x ]; then echo "$HOME/y"; fi'],
    ['python', 'def f(x):\n    """説明"""\n    return {"a": 1}  # 注記'],
    ['diff', 'diff --git a/x b/x\n@@ -1,2 +1,2 @@\n-古い行\n+新しい行\n 変わらない行'],
    ['yaml', 'name: Quuu\nitems:\n  - one # 注記'],
    ['sql', "SELECT id FROM tasks WHERE status = 'done'"]
  ]

  it.each(SAMPLES)('%s drops no characters', async (language, code) => {
    const grammar = resolveLanguage(language)
    expect(grammar).not.toBeNull()
    const lines = await highlightCode(code, grammar as string, 'dark')
    expect(lines).not.toBeNull()
    const restored = (lines ?? []).map((tokens) => tokens.map((t) => t.content).join('')).join('\n')
    expect(restored).toBe(code)
  })

  it('colors differ by kind of word', async () => {
    const syntax = syntaxTokens(palettes.dark)
    const lines = await highlightCode('const s = "文字" // 注記', 'ts', 'dark')
    const tokens = (lines ?? []).flat()
    const colorOf = (text: string): string | undefined =>
      tokens.find((t) => t.content.includes(text))?.color

    expect(sameColor(colorOf('const'), syntax.keyword), 'keyword').toBe(true)
    expect(sameColor(colorOf('文字'), syntax.string), 'string').toBe(true)
    expect(sameColor(colorOf('注記'), syntax.comment), 'comment').toBe(true)
  })

  it('diffs separate added and removed lines', async () => {
    const syntax = syntaxTokens(palettes.dark)
    const lines = await highlightCode('-古い\n+新しい', 'diff', 'dark')
    const tokens = (lines ?? []).flat()
    expect(sameColor(tokens.find((t) => t.content.includes('古い'))?.color, syntax.removed)).toBe(true)
    expect(sameColor(tokens.find((t) => t.content.includes('新しい'))?.color, syntax.added)).toBe(true)
  })

  it('switching the color scheme switches the colors', async () => {
    const dark = await highlightCode('const a = 1', 'ts', 'dark')
    const light = await highlightCode('const a = 1', 'ts', 'light')
    expect(sameColor(dark?.[0][0].color, syntaxTokens(palettes.dark).keyword)).toBe(true)
    expect(sameColor(light?.[0][0].color, syntaxTokens(palettes.light).keyword)).toBe(true)
  })

  /*
   * The renderer CSP (`script-src 'self'`) cannot assemble WebAssembly, so the
   * grammar engine is the JavaScript one instead of shiki's default oniguruma.
   * Check against the upstream engine that **the swap did not change the highlighting**.
   */
  it.each(SAMPLES)('%s matches the upstream engine', async (language, code) => {
    const grammar = resolveLanguage(language) as string
    const ours = await highlightCode(code, grammar, 'dark')
    const reference = await codeToTokens(code, {
      lang: grammar as BundledLanguage,
      theme: shikiTheme('dark'),
      // Compare **only the grammar-engine difference**; keep everything else equal
      ...TOKENIZE
    })

    const shape = (lines: ThemedToken[][]): string[] =>
      lines.map((tokens) => tokens.map((t) => `${t.content}:${t.color ?? ''}`).join('|'))

    expect(shape(ours ?? [])).toEqual(shape(reference.tokens))
  })

  it('overly long code is not highlighted (do not stall the screen)', async () => {
    expect(await highlightCode('const a = 1\n'.repeat(20_000), 'ts', 'dark')).toBeNull()
  })
})

describe('destinations allowed to open', () => {
  it.each(['https://example.com', 'http://example.com/a?b=1', 'mailto:a@example.com', 'file:///tmp/x'])(
    '%s can be opened',
    (url) => {
      expect(safeUrl(url)).toBe(url)
    }
  )

  it.each(['javascript:alert(1)', 'data:text/html,<script>', './doc.md', '#section', '', '   '])(
    '%s does not open (kept as plain text)',
    (url) => {
      expect(safeUrl(url)).toBeNull()
    }
  )

  it('surrounding whitespace is stripped before judging', () => {
    expect(safeUrl('  https://example.com  ')).toBe('https://example.com')
  })
})
