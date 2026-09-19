import type { Meta, StoryObj } from '@storybook/react-vite'
import { Column, Row } from '../layout/Stack.js'
import { Paragraph, Text } from './Text.js'

const meta: Meta<typeof Text> = { title: 'Data Display/Text', component: Text }
export default meta

const TONES = [
  'primary',
  'secondary',
  'tertiary',
  'accent',
  'info',
  'success',
  'warning',
  'danger'
] as const

export const Tones: StoryObj = {
  render: () => (
    <Column gap={2}>
      {TONES.map((tone) => (
        <Row key={tone} gap={3}>
          <Text size="xs" tone="tertiary" mono sx={{ width: 80 }}>
            {tone}
          </Text>
          <Text tone={tone}>A state never leans on color alone; the word and the shape come with it</Text>
        </Row>
      ))}
      <Row gap={3}>
        <Text size="xs" tone="tertiary" mono sx={{ width: 80 }}>
          color
        </Text>
        <Text color="#8f86b8">A color not in tone is passed from the app&apos;s own tokens</Text>
      </Row>
    </Column>
  )
}

export const Weights: StoryObj = {
  render: () => (
    <Row gap={4}>
      <Text weight="regular">regular</Text>
      <Text weight="medium">medium</Text>
      <Text weight="bold">bold</Text>
      <Text italic>italic</Text>
      <Text strike tone="tertiary">
        strike
      </Text>
    </Row>
  )
}

/** Always give a truncated element a `title`. Truncation hides information, so leave a way to get it back. */
export const Truncation: StoryObj = {
  render: () => (
    <Column gap={3} sx={{ width: 260 }}>
      <Text truncate title="Elide the tail. Names and titles are cut here">
        Elide the tail — for things read from the head, like names and titles
      </Text>
      <Text truncate="start" mono title="/very/long/path/to/a/file/name.ts">
        /very/long/path/to/a/file/name.ts
      </Text>
      <Text tabular>0123456789 — aligned by digit</Text>
    </Column>
  )
}

export const Body: StoryObj = {
  render: () => (
    <Column gap={3}>
      <Paragraph>
        A surface where prose is the main thing caps its line length. A surface where
        logs and commands are the main thing follows the surface width — wrapping at a
        fixed measure chops paths and commands apart and makes them hard to scan.
      </Paragraph>
      <Text preWrap selectable mono size="sm">
        {'Selectable body text.\nLine breaks come out as they are.'}
      </Text>
    </Column>
  )
}
