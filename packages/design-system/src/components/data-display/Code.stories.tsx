import type { Meta, StoryObj } from '@storybook/react-vite'
import { Column, Row } from '../layout/Stack.js'
import { Code, CodeBlock, Kbd, KeyCap } from './Code.js'
import { Text } from './Text.js'

const meta: Meta = { title: 'Data Display/Code' }
export default meta

export const Inline: StoryObj = {
  render: () => (
    <Text size="sm">
      Pass <Code>--permission-mode</Code> as an argument.
    </Text>
  )
}

export const Block: StoryObj = {
  render: () => (
    <Column gap={3} sx={{ maxWidth: 520 }}>
      <CodeBlock>{'$ npm run check\n> lint\n> typecheck\n> test'}</CodeBlock>
      <CodeBlock tone="danger">{'Error: ENOENT\n  at spawn (node:child_process)'}</CodeBlock>
    </Column>
  )
}

/** Shows a pressable key with a frame rather than trusting a glyph font. */
export const Keys: StoryObj = {
  render: () => (
    <Column gap={3}>
      <Row gap={4}>
        <Text size="xs" tone="tertiary">
          <Kbd>↑↓</Kbd> Move
        </Text>
        <Text size="xs" tone="tertiary">
          <Kbd>↵</Kbd> Run
        </Text>
        <Text size="xs" tone="tertiary">
          <Kbd>esc</Kbd> Close
        </Text>
      </Row>
      <Row gap={2}>
        <KeyCap>⌘K</KeyCap>
        <KeyCap>⌘↵</KeyCap>
        <KeyCap>esc</KeyCap>
      </Row>
    </Column>
  )
}
