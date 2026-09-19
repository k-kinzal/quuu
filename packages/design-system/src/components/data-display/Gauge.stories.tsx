import type { Meta, StoryObj } from '@storybook/react-vite'
import { Column, Row } from '../layout/Stack.js'
import { Gauge } from './Gauge.js'
import { Text } from './Text.js'

const meta: Meta<typeof Gauge> = { title: 'Data Display/Gauge', component: Gauge }
export default meta

/**
 * A number is exact but you cannot notice it change. The cells change shape, so "it
 * filled up" enters your field of view even when you are not looking at it.
 */
export const Kinds: StoryObj = {
  render: () => (
    <Column gap={3}>
      {(
        [
          ['In use', 'filled'],
          ['Free', 'empty'],
          ['Free but unusable', 'outlined'],
          ['Out of scope', 'muted']
        ] as const
      ).map(([label, kind]) => (
        <Row key={kind} gap={3}>
          <Text size="xs" tone="tertiary" sx={{ width: 160 }}>
            {label}
          </Text>
          <Gauge label={label} cells={Array.from({ length: 6 }, () => ({ kind }))} />
        </Row>
      ))}
    </Column>
  )
}

export const Mixed: StoryObj = {
  render: () => (
    <Row gap={3}>
      <Text size="xs" tone="tertiary">
        2 / 6
      </Text>
      <Gauge
        label="How the slots are filled"
        cells={[
          { kind: 'filled', title: 'Running' },
          { kind: 'filled', title: 'Running' },
          { kind: 'outlined', title: 'Reserved' },
          { kind: 'empty' },
          { kind: 'empty' },
          { kind: 'muted', title: 'Out of scope' }
        ]}
      />
    </Row>
  )
}
