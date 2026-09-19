import type { Meta, StoryObj } from '@storybook/react-vite'
import { Column, Row } from '../layout/Stack.js'
import { Text } from './Text.js'
import { Dot, StatusIndicator, type StatusShape, type StatusTone } from './StatusIndicator.js'

const meta: Meta<typeof StatusIndicator> = {
  title: 'Data Display/StatusIndicator',
  component: StatusIndicator
}
export default meta

const SHAPES: StatusShape[] = [
  'ring',
  'dot',
  'quarter',
  'half',
  'spinner',
  'diamond',
  'square',
  'pause',
  'cross',
  'check'
]
const TONES: StatusTone[] = ['neutral', 'accent', 'info', 'success', 'warning', 'danger']

/**
 * Ten shapes. Which state gets which shape is the app's decision (the design system
 * holds no domain words).
 */
export const Shapes: StoryObj = {
  render: () => (
    <Row wrap gap={4}>
      {SHAPES.map((shape) => (
        <Column key={shape} gap={1} align="center" sx={{ width: 72 }}>
          <StatusIndicator shape={shape} label={shape} />
          <Text size="xs" tone="tertiary" mono>
            {shape}
          </Text>
        </Column>
      ))}
    </Row>
  )
}

export const Tones: StoryObj = {
  render: () => (
    <Column gap={3}>
      {TONES.map((tone) => (
        <Row key={tone} gap={3}>
          <Text size="xs" tone="tertiary" mono sx={{ width: 72 }}>
            {tone}
          </Text>
          <Row gap={3}>
            {SHAPES.map((shape) => (
              <StatusIndicator key={shape} shape={shape} tone={tone} label={`${tone} ${shape}`} />
            ))}
          </Row>
        </Row>
      ))}
    </Column>
  )
}

/** How it looks placed within a row. Shown with its word, so the shape does not carry the meaning alone. */
export const InContext: StoryObj = {
  render: () => (
    <Column gap={2}>
      {(
        [
          ['ring', 'neutral', 'Draft'],
          ['pause', 'neutral', 'On hold'],
          ['quarter', 'neutral', 'Waiting'],
          ['spinner', 'info', 'Running'],
          ['diamond', 'warning', 'Awaiting review'],
          ['cross', 'danger', 'Failed'],
          ['check', 'success', 'Done']
        ] as const
      ).map(([shape, tone, label]) => (
        <Row key={label} gap={2}>
          <StatusIndicator shape={shape} tone={tone} label={label} />
          <Text size="sm">{label}</Text>
        </Row>
      ))}
    </Column>
  )
}

export const Dots: StoryObj = {
  render: () => (
    <Row gap={3}>
      <Dot color="#4ea8de" />
      <Dot color="#e2a03f" />
      <Dot color="#4caf7d" size={9} />
      <Dot muted />
      <Dot />
    </Row>
  )
}
