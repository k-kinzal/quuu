import type { Meta, StoryObj } from '@storybook/react-vite'
import { Column } from '../layout/Stack.js'
import { DiffView } from './DiffView.js'

const meta: Meta = { title: 'Data Display/DiffView' }
export default meta

/** A change numbers both sides: where a line was, and where it is now. */
export const Change: StoryObj = {
  render: () => (
    <Column sx={{ height: 200 }}>
      <DiffView
        language="typescript"
        lines={[
          { kind: 'hunk', oldLine: null, newLine: null, text: '@@ -12,3 +12,3 @@ createClient' },
          { kind: 'context', oldLine: 12, newLine: 12, text: 'export function createClient() {' },
          { kind: 'deleted', oldLine: 13, newLine: null, text: '  return legacy' },
          { kind: 'added', oldLine: null, newLine: 13, text: '  return current' },
          { kind: 'context', oldLine: 14, newLine: 14, text: '}' }
        ]}
      />
    </Column>
  )
}

/** A file with nothing changed in it keeps one line number per line. */
export const UnchangedFile: StoryObj = {
  render: () => (
    <Column sx={{ height: 200 }}>
      <DiffView
        language="typescript"
        lines={['export function createClient() {', '  return current', '}'].map((text, index) => ({
          kind: 'context' as const, oldLine: index + 1, newLine: index + 1, text
        }))}
      />
    </Column>
  )
}
