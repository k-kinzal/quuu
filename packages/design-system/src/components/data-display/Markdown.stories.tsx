import type { Meta, StoryObj } from '@storybook/react-vite'
import { Column } from '../layout/Stack.js'
import { Markdown } from './Markdown.js'

const meta: Meta = { title: 'Data Display/Markdown' }
export default meta

const DOCUMENT = [
  '## Rebuilt the surface hierarchy',
  '',
  'Fixed the neutral hue at **H=264** and re-spaced lightness into even steps.',
  'The verification lives in `tests/tokens.test.ts`.',
  '',
  '| Step | Before | After | Delta |',
  '| --- | --- | ---: | ---: |',
  '| canvas | `#131417` | `#1f2023` | +5.5 |',
  '| subtle | `#191b1f` | `#25272b` | +5.2 |',
  '',
  '### Procedure',
  '',
  '1. Convert hex to OKLCH and measure hue drift',
  '2. Re-space lightness into perceptually even steps',
  '   - Keep surface deltas within 2–5 points',
  '   - Layer them together with 1px rules',
  '3. Verify colors used as text at 4.5:1',
  '',
  '- [x] Fixed the neutral hue',
  '- [ ] Light selection color is close to hover',
  '',
  '> Telling surfaces apart is the job of the 1px rule, not of value gaps.',
  '',
  'See the [design conventions](https://example.com/design) for details.',
  '',
  '---',
  '',
  '#### Notes',
  '',
  'Identifiers like `snake_case_name` are shown verbatim.'
].join('\n')

export const Document: StoryObj = {
  render: () => (
    <Column sx={{ maxWidth: 620 }}>
      <Markdown onOpenLink={(href) => console.log(href)}>{DOCUMENT}</Markdown>
    </Column>
  )
}

export const LocalPaths: StoryObj = {
  render: () => (
    <Column sx={{ maxWidth: 620 }}>
      <Markdown onOpenLink={console.log} onOpenPath={console.log}>
        {[
          '## Output locations',
          '出力先：/tmp/ochinpopo-training/combined_train。',
          '',
          '`/tmp/ochinpopo-training/combined_train`',
          '',
          '`~/Documents/日本語 data #1%20?`',
          '',
          '[Open output folder](/tmp/ochinpopo-training/combined_train)',
          '',
          '[Website](https://example.com) and `cat /tmp/output`.',
          '',
          '```sh',
          'ls /tmp/ochinpopo-training/combined_train',
          '```'
        ].join('\n')}
      </Markdown>
    </Column>
  )
}

/** Do the corners of the spec (reference links, footnotes, nesting, code inside tables) hold up? */
export const Corners: StoryObj = {
  render: () => (
    <Column sx={{ maxWidth: 620 }}>
      <Markdown onOpenLink={(href) => console.log(href)}>
        {[
          'A reference-style link[^1] points to the [design conventions][doc].',
          '',
          '1. Put a paragraph inside a list item',
          '',
          '   A continuation paragraph. Still inside the same item.',
          '',
          '   - Nested further',
          '     - One level more',
          '2. The next item',
          '',
          '| Notation | Example |',
          '| --- | --- |',
          '| Code | `a \\| b` |',
          '| Emphasis | **bold** and *italic* |',
          '',
          '[^1]: Footnotes are collected after the body.',
          '',
          '[doc]: https://example.com/design'
        ].join('\n')}
      </Markdown>
    </Column>
  )
}

/** Fenced code shows the language in its heading and colors by token kind. */
export const Code: StoryObj = {
  render: () => (
    <Column sx={{ maxWidth: 620 }}>
      <Markdown>
        {[
          '```ts',
          "import { palettes } from './tokens.js'",
          '',
          '/** Is the (perceptual) lightness gap between surfaces wide enough to tell neighbors apart? */',
          'export function steps(scheme: ColorScheme): number[] {',
          "  const surfaces = ['canvas', 'subtle', 'default'] as const",
          '  return surfaces.map((k) => oklch(palettes[scheme].surface[k]).l * 100)',
          '}',
          '```',
          '',
          '```sh',
          'npm run check   # lint + typecheck + test',
          '```',
          '',
          '```diff',
          "-    canvas: '#131417',",
          "+    canvas: '#1f2023',",
          '```',
          '',
          '```elvish',
          'A language we cannot highlight is shown as-is',
          '```'
        ].join('\n')}
      </Markdown>
    </Column>
  )
}

/** `mermaid` fences become diagrams. Ones broken as notation stay as code. */
export const Diagrams: StoryObj = {
  render: () => (
    <Column sx={{ maxWidth: 620 }}>
      <Markdown>
        {[
          '```mermaid',
          'flowchart TD',
          '  A[Fetch] --> B{Conditions met?}',
          '  B -->|Yes| C[Run]',
          '  B -->|No| D[Wait]',
          '  C --> E([Awaiting review])',
          '  D --> B',
          '```',
          '',
          '```mermaid',
          'sequenceDiagram',
          '  participant H as Human',
          '  participant T as App',
          '  participant A as Agent',
          '  H->>T: Queue',
          '  loop Until a slot opens',
          '    T->>A: Launch',
          '    A-->>T: Awaiting review',
          '  end',
          '  Note over H,T: Completion is a human decision',
          '```',
          '',
          '```mermaid',
          'stateDiagram-v2',
          '  [*] --> queued',
          '  queued --> running: slot opens',
          '  running --> review: exits cleanly',
          '  review --> [*]: human confirms',
          '```',
          '',
          '```mermaid',
          'flowchart TD',
          '  A[unclosed --> B',
          '```'
        ].join('\n')}
      </Markdown>
    </Column>
  )
}
