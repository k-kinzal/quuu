import type { Meta, StoryObj } from '@storybook/react-vite'
import { Column } from '../layout/Stack.js'
import { SourceBlock } from './SourceBlock.js'
import { Text } from './Text.js'

const meta: Meta = { title: 'Data Display/SourceBlock' }
export default meta

const SAMPLES: [string, string][] = [
  [
    'ts',
    [
      "import { palettes } from './tokens.js'",
      '',
      '/** Is the lightness gap between surfaces wide enough to tell neighbours apart? */',
      'export function steps(scheme: ColorScheme): number[] {',
      "  const surfaces = ['canvas', 'subtle'] as const",
      '  return surfaces.map((k) => oklch(palettes[scheme].surface[k]).l * 100)',
      '}'
    ].join('\n')
  ],
  ['sh', 'npm run check | tee out.log   # lint + typecheck + test\ngit status --short'],
  ['json', '{\n  "name": "app",\n  "concurrency": 2,\n  "enabled": true\n}'],
  ['yaml', 'name: app\nagents:\n  - name: Claude Opus\n    concurrency: 2 # execution slots'],
  ['diff', "diff --git a/tokens.ts b/tokens.ts\n@@ -1,3 +1,3 @@\n-  canvas: '#131417',\n+  canvas: '#1f2023',\n   border: 1"],
  ['sql', "SELECT id, status FROM tasks WHERE status = 'review' ORDER BY updated_at DESC"]
]

export const Languages: StoryObj = {
  render: () => (
    <Column gap={4} sx={{ maxWidth: 560 }}>
      {SAMPLES.map(([language, code]) => (
        <SourceBlock key={language} code={code} language={language} />
      ))}
    </Column>
  )
}

/** Anything whose language is unknown, and any output from a failure, is emitted without color. */
export const Plain: StoryObj = {
  render: () => (
    <Column gap={4} sx={{ maxWidth: 560 }}>
      <Text size="xs" tone="tertiary">
        No language
      </Text>
      <SourceBlock code={'2026-08-17 14:03:11  fetched: 3\n2026-08-17 14:03:12  launched: run_0007'} />
      <Text size="xs" tone="tertiary">
        Output from a failure
      </Text>
      <SourceBlock
        tone="danger"
        code={'Error: ENOENT: no such file or directory\n  at spawn (node:child_process)'}
      />
    </Column>
  )
}
