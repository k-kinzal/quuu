import type { Meta, StoryObj } from '@storybook/react-vite'
import { Bot } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Column, Row } from '../layout/Stack.js'
import { Badge, Chip, Counter } from './Badge.js'
import { Text } from './Text.js'

const meta: Meta = { title: 'Data Display/Badge' }
export default meta

const TONES = ['neutral', 'accent', 'info', 'success', 'warning', 'danger'] as const

/** A mark that says only "this differs from the default". Put it on the default too and the mark becomes background and loses its meaning. */
export const Badges: StoryObj = {
  render: () => (
    <Row wrap gap={2}>
      {TONES.map((tone) => (
        <Badge key={tone} tone={tone}>
          {tone}
        </Badge>
      ))}
    </Row>
  )
}

export const Chips: StoryObj = {
  render: () => (
    <Row wrap gap={2}>
      <Chip label="Read only" />
      <Chip variant="outline" label="Pressable" onClick={() => undefined} />
      <Chip variant="outline" icon={<Bot size={iconSize.sm} {...iconDefaults} />} label="With a glyph" />
    </Row>
  )
}

/** At 0 it recedes. Never let it assert that there is nothing. */
export const Counters: StoryObj = {
  render: () => (
    <Column gap={2}>
      <Row gap={2}>
        <Text size="xs" tone="tertiary">
          Waiting
        </Text>
        <Counter>3</Counter>
      </Row>
      <Row gap={2}>
        <Text size="xs" tone="tertiary">
          Awaiting review
        </Text>
        <Counter tone="warning">2</Counter>
      </Row>
      <Row gap={2}>
        <Text size="xs" tone="tertiary">
          Failed
        </Text>
        <Counter tone="danger" zero>
          0
        </Counter>
      </Row>
    </Column>
  )
}
