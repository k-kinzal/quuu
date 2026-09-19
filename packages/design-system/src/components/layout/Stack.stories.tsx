import type { Meta, StoryObj } from '@storybook/react-vite'
import { Text } from '../data-display/Text.js'
import { Column, Row, Spacer } from './Stack.js'

const meta: Meta = { title: 'Layout/Stack' }
export default meta

function Box({ label }: { label: string }): JSX.Element {
  return (
    <span
      style={{
        padding: '4px 10px',
        borderRadius: 6,
        background: 'currentColor',
        opacity: 0.14
      }}
    >
      <Text size="xs">{label}</Text>
    </span>
  )
}

export const Rows: StoryObj = {
  render: () => (
    <Column gap={4}>
      {[1, 2, 3, 4].map((gap) => (
        <Row key={gap} gap={gap}>
          <Text size="xs" tone="tertiary" mono sx={{ width: 56 }}>
            gap={gap}
          </Text>
          <Box label="A" />
          <Box label="B" />
          <Box label="C" />
        </Row>
      ))}
      <Row>
        <Box label="Left" />
        <Spacer />
        <Box label="Pushed to the right" />
      </Row>
    </Column>
  )
}

export const Alignment: StoryObj = {
  render: () => (
    <Column gap={3}>
      {(['start', 'center', 'end', 'baseline'] as const).map((align) => (
        <Row key={align} gap={2} align={align} sx={{ height: 56, outline: '1px dashed' }}>
          <Text size="xs" tone="tertiary" mono sx={{ width: 56 }}>
            {align}
          </Text>
          <Box label="Small" />
          <span style={{ padding: '14px 10px', borderRadius: 6, background: 'currentColor', opacity: 0.14 }}>
            <Text size="xs">Large</Text>
          </span>
        </Row>
      ))}
    </Column>
  )
}
