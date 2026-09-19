import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowUp, Check, ChevronDown, MessageCircle } from 'lucide-react'
import { ThemeProvider } from '../theme/ThemeProvider.js'
import { useTheme } from '../theme/ThemeProvider.js'
import type { ColorScheme, Density } from '../theme/tokens.js'
import { Column, Row } from './layout/Stack.js'
import { InsetGroupFrame, InsetFieldRow } from './layout/InsetGroup.js'
import { Text } from './data-display/Text.js'
import {
  NotificationAnchor,
  NotificationBadge,
  TranscriptCode
} from './data-display/Annotations.js'
import {
  HistoryRow,
  HistoryTime,
  HistoryTarget,
  HistoryResult,
  HistoryDuration
} from './data-display/HistoryList.js'
import {
  TranscriptTurn,
  TranscriptTurnText,
  TranscriptPendingBody,
  TranscriptThinkingBody
} from './data-display/Transcript.js'
import { Markdown } from './data-display/Markdown.js'
import { CompactComposer } from './inputs/CompactComposer.js'
import { SurfaceTextLine } from './inputs/SurfaceInput.js'
import { ActionPill } from './inputs/ActionPill.js'
import { SelectionSheet } from './surfaces/SelectionSheet.js'
import { EdgeProgress } from './feedback/EdgeProgress.js'

export default { title: 'Patterns/Feedback', parameters: { layout: 'padded' } } satisfies Meta

function Example({ scheme, density }: { scheme: ColorScheme; density: Density }): JSX.Element {
  return (
    <ThemeProvider colorScheme={scheme} density={density}>
      <Examples />
    </ThemeProvider>
  )
}
function Examples(): JSX.Element {
  const theme = useTheme()
  const [value, setValue] = useState('Type what to send')
  const [sheet, setSheet] = useState(false)
  const [selected, setSelected] = useState('All')
  return (
    <Column gap="xl">
      <Row>
        <ActionPill
          label={selected}
          indicator={<ChevronDown size={theme.iconSize.sm} />}
          onClick={() => setSheet(true)}
        />
        <NotificationAnchor>
          <MessageCircle size={theme.iconSize.lg} />
          <NotificationBadge count={120} />
        </NotificationAnchor>
      </Row>
      <InsetGroupFrame>
        <InsetFieldRow>
          <SurfaceTextLine value={value} onChange={setValue} placeholder="Name" />
        </InsetFieldRow>
      </InsetGroupFrame>
      <HistoryRow selected>
        <HistoryTime>12:34</HistoryTime>
        <HistoryTarget>A target with a long name, plus the string identifying that run</HistoryTarget>
        <HistoryResult color={theme.palette.success.main}>Succeeded</HistoryResult>
        <HistoryDuration>10h 02m</HistoryDuration>
      </HistoryRow>
      <TranscriptTurn>
        <TranscriptTurnText role="user">
          <Markdown>Body text including long code and tables, read at the same padding and the same text rank.</Markdown>
        </TranscriptTurnText>
      </TranscriptTurn>
      <TranscriptPendingBody color={theme.palette.info.main}>
        <Text>Content waiting to be sent</Text>
      </TranscriptPendingBody>
      <TranscriptThinkingBody>
        <Markdown subdued>Supplementary **Markdown**. Shown one rank below the body.</Markdown>
      </TranscriptThinkingBody>
      <TranscriptCode
        code={'function example() {\n  return "the same indentation"\n}'}
        language="typescript"
      />
      <CompactComposer
        value={value}
        onChange={setValue}
        onSend={() => setValue('')}
        placeholder="Keep writing"
        sendLabel="Send"
        sendIcon={<ArrowUp size={theme.iconSize.md} />}
      />
      <EdgeProgress variant="determinate" value={40} />
      {sheet && (
        <SelectionSheet
          options={[
            { value: 'All', label: 'All', count: 120 },
            { value: 'Unread', label: 'Unread', count: 8 }
          ]}
          isSelected={(v) => v === selected}
          onSelect={setSelected}
          onClose={() => setSheet(false)}
          selectedIcon={<Check size={theme.iconSize.md} />}
          closeLabel="Close"
        />
      )}
    </Column>
  )
}
export const CompactDark: StoryObj = { render: () => <Example scheme="dark" density="compact" /> }
export const CompactLight: StoryObj = { render: () => <Example scheme="light" density="compact" /> }
export const ComfortableDark: StoryObj = {
  render: () => <Example scheme="dark" density="comfortable" />
}
export const ComfortableLight: StoryObj = {
  render: () => <Example scheme="light" density="comfortable" />
}
