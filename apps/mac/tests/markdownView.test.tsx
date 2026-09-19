// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ThemeProvider } from '../../../packages/design-system/src/theme/ThemeProvider.js'
import { Markdown } from '../../../packages/design-system/src/components/data-display/Markdown.js'

/**
 * Whether a message comes out in **the shape of the screen**.
 *
 * Parsing the notation itself is left to remark (CommonMark + GFM), so
 * what is checked here is "the presentation we chose" - which notation becomes which element,
 * whether a destination that cannot be opened is left unlinked, whether a fence becomes a code surface.
 */

afterEach(cleanup)

// jsdom has no color-scheme query. Fall back to the default (dark)
beforeAll(() => {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })
})

function show(markdown: string, props: Record<string, unknown> = {}): HTMLElement {
  const { container } = render(
    <ThemeProvider colorScheme="dark">
      <Markdown {...props}>{markdown}</Markdown>
    </ThemeProvider>
  )
  return container
}

describe('structure', () => {
  it('renders headings at the depth they were written', () => {
    show('# 大\n\n## 中\n\n### 小')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('大')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('中')
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('小')
  })

  it('renders bullet lists with their nesting intact', () => {
    const container = show('- 親\n  - 子\n- 親 2')
    const lists = container.querySelectorAll('ul')
    expect(lists).toHaveLength(2)
    expect(lists[0].children).toHaveLength(2)
    expect(lists[1]).toHaveTextContent('子')
  })

  it('keeps the start number of an ordered list', () => {
    const container = show('3. みっつ目\n4. よっつ目')
    expect(container.querySelector('ol')?.getAttribute('start')).toBe('3')
  })

  it('renders checked and unchecked boxes (GFM)', () => {
    show('- [x] 済んだ\n- [ ] まだ')
    const boxes = screen.getAllByRole<HTMLInputElement>('checkbox')
    expect(boxes.map((b) => b.checked)).toEqual([true, false])
    // It is a record of a conversation, so the state must not be editable from the screen
    expect(boxes.every((b) => b.disabled)).toBe(true)
  })

  it('keeps the columns and the alignment of a table (GFM)', () => {
    const container = show('| 名前 | 数 |\n| --- | ---: |\n| a | 1 |\n| b | 2 |')
    expect(container.querySelectorAll('thead th')).toHaveLength(2)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(container.querySelector('thead th:last-child')?.getAttribute('style')).toContain('right')
  })

  it('renders strikethrough, blockquote and rule', () => {
    const container = show('~~消した~~\n\n> 引用\n\n---')
    expect(container.querySelector('del')).toHaveTextContent('消した')
    expect(container.querySelector('blockquote')).toHaveTextContent('引用')
    expect(container.querySelector('hr')).not.toBeNull()
  })

  it('renders a newline inside a paragraph as a line break (never flattens a message written as a run of lines)', () => {
    const container = show('一行目\n二行目')
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(container.querySelectorAll('br')).toHaveLength(1)
  })

  it('does not turn an underscore inside an identifier into emphasis', () => {
    const container = show('snake_case_name を渡す')
    expect(container.querySelector('em')).toBeNull()
  })
})

describe('code', () => {
  it('turns a fence into a code surface and shows the language in its header', () => {
    const container = show('```ts\nconst a = 1\n```')
    expect(container.textContent).toContain('const a = 1')
    expect(container.textContent).toContain('ts')
    // No `pre > div` nesting (never put the surface inside the code)
    expect(container.querySelector('pre > div')).toBeNull()
  })

  it('does not give inline code a surface', () => {
    const container = show('`npm run check` を通す')
    expect(container.querySelector('code')).toHaveTextContent('npm run check')
    expect(container.querySelectorAll('pre')).toHaveLength(0)
  })

  it('does not read the inside of a fence as notation', () => {
    const container = show('```\n# 見出しではない\n- 箇条書きでもない\n```')
    expect(container.querySelector('h1')).toBeNull()
    expect(container.querySelector('ul')).toBeNull()
    expect(container.textContent).toContain('# 見出しではない')
  })

  /*
   * Only this one takes a long timeout. The diagram implementation is not loaded until it is needed (a dynamic import),
   * and nothing arrives until 600KB has been read. On its own that is about 3 seconds, but
   * running everything in parallel does not fit inside the default 5.
   * **What is checked is not the speed but that what it falls back to is code.**
   * Extending only the `findByText` side still dies on the `it` limit, so both get it.
   */
  it(
    'leaves a diagram as code when it cannot be drawn',
    async () => {
      // jsdom cannot draw a diagram (it has no layout), so it always takes the fallback path.
      // What is checked is that it "stays as code", not that it "disappears when it cannot be drawn"
      show('```mermaid\nflowchart TD\n  A --> B\n```')
      const shown = await screen.findByText(/flowchart TD/, undefined, { timeout: 25_000 })
      expect(shown).toBeInTheDocument()
    },
    30_000
  )

  it('can hand actions such as copy to the fence header', () => {
    show('```sh\nnpm test\n```', {
      codeActions: (code: string) => <button type="button">{`写す:${code}`}</button>
    })
    expect(screen.getByRole('button')).toHaveTextContent('写す:npm test')
  })
})

describe('destinations', () => {
  it('links only destinations that can be opened', () => {
    const onOpenLink = vi.fn()
    show('[説明](https://example.com) と [危険](javascript:alert(1))', { onOpenLink })
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', 'https://example.com')
  })

  it('calls the opener on press (the screen does not navigate)', () => {
    const onOpenLink = vi.fn()
    show('[説明](https://example.com)', { onOpenLink })
    screen.getByRole('link').click()
    expect(onOpenLink).toHaveBeenCalledWith('https://example.com')
  })

  it('does not make a link when there is no opener', () => {
    const container = show('[説明](https://example.com)')
    expect(container.querySelector('a')).toBeNull()
    expect(container).toHaveTextContent('説明')
  })

  it('does not fetch an image and shows only what it points at', () => {
    const container = show('![説明](https://example.com/x.png)', { onOpenLink: vi.fn() })
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('説明')
  })

  it('links a bare URL too (GFM)', () => {
    show('詳しくは https://example.com/a を見る', { onOpenLink: vi.fn() })
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/a')
  })
})

describe('raw HTML', () => {
  it('renders it as text rather than drawing it as elements', () => {
    const container = show('<b>強調したい</b>\n\n<img src="https://example.com/x.png">')
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it('does not let a script through', () => {
    const container = show('<script>alert(1)</script>')
    expect(container.querySelector('script')).toBeNull()
  })
})
