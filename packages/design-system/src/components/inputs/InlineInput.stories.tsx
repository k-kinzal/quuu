import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Search } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Column, Row } from '../layout/Stack.js'
import { Text } from '../data-display/Text.js'
import { Dot } from '../data-display/StatusIndicator.js'
import { AutoTextArea, InlineAddRow, InlineInput, PlainInput, SearchInput } from './InlineInput.js'

const meta: Meta = { title: 'Inputs/Inline' }
export default meta

/** The shape where what was being displayed becomes the input itself. No frame; a change of background says it. */
export const Inline: StoryObj = {
  render: () => (
    <Column gap={3} sx={{ maxWidth: 520 }}>
      {(['lg', 'md', 'sm'] as const).map((scale) => (
        <Row key={scale} gap={2}>
          <Text size="xs" tone="tertiary" mono sx={{ width: 24 }}>
            {scale}
          </Text>
          <InlineInput scale={scale} defaultValue="Press here and edit it in place" />
        </Row>
      ))}
    </Column>
  )
}

export const Search_: StoryObj = {
  name: 'Search',
  render: function Render() {
    const [q, setQ] = useState('')
    return (
      <SearchInput
        icon={<Search size={iconSize.sm} {...iconDefaults} />}
        value={q}
        placeholder="Search"
        onChange={(e) => setQ(e.target.value)}
      />
    )
  }
}

/** A writing surface. It grows with the height of its contents. */
export const AutoGrow: StoryObj = {
  render: () => (
    <Column gap={3} sx={{ maxWidth: 520 }}>
      {(['plain', 'neutral', 'info', 'warning'] as const).map((tone) => (
        <Column key={tone} gap={1}>
          <Text size="xs" tone="tertiary" mono>
            tone={tone}
          </Text>
          <AutoTextArea
            tone={tone}
            rows={2}
            defaultValue={'Content not sent yet.\nEditable in place.'}
          />
        </Column>
      ))}
    </Column>
  )
}

/** A demoted intake, so a surface never ends up with two primary inputs. */
export const AddRow: StoryObj = {
  render: () => (
    <InlineAddRow>
      <PlainInput placeholder="Add just a name…" />
      <Dot color="#4ea8de" />
    </InlineAddRow>
  )
}
