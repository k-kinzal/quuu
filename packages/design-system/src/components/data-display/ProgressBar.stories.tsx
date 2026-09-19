import type { Meta, StoryObj } from '@storybook/react-vite'
import { Column } from '../layout/Stack.js'
import { ProgressBar } from './ProgressBar.js'
import { Text } from './Text.js'

const meta: Meta<typeof ProgressBar> = {
  title: 'Data Display/ProgressBar',
  component: ProgressBar,
  parameters: { layout: 'centered' }
}
export default meta

export const Tones: StoryObj<typeof ProgressBar> = {
  render: () => (
    <Column gap={3} style={{ width: 320 }}>
      {[
        { label: 'Success', value: 92, tone: 'success' as const },
        { label: 'Warning', value: 68, tone: 'warning' as const },
        { label: 'Danger', value: 34, tone: 'danger' as const }
      ].map((item) => (
        <Column key={item.label} gap={1}>
          <Text size="xs" tabular>{item.label} · {String(item.value)}%</Text>
          <ProgressBar value={item.value} tone={item.tone} label={`${item.label} ${String(item.value)}%`} />
        </Column>
      ))}
    </Column>
  )
}
