import type { Meta, StoryObj } from '@storybook/react-vite'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Column } from '../layout/Stack.js'
import { Text } from '../data-display/Text.js'
import { Alert, HintList, Quote } from './Alert.js'

const meta: Meta<typeof Alert> = { title: 'Feedback/Alert', component: Alert }
export default meta

/** Show nothing when things are fine. Drawing "no problems" makes the difference unreadable. */
export const Tones: StoryObj = {
  render: () => (
    <Column gap={3} sx={{ maxWidth: 560 }}>
      {(['danger', 'warning', 'info', 'success', 'neutral'] as const).map((tone) => (
        <Alert
          key={tone}
          tone={tone}
          title={`tone=${tone}`}
          icon={<CircleAlert size={iconSize.md} {...iconDefaults} />}
        >
          State what happened in one sentence. If the cause is known, write that too.
        </Alert>
      ))}
    </Column>
  )
}

/** Sets contents that are not settled yet — things held, drafts — apart from the body. */
export const Quotes: StoryObj = {
  render: () => (
    <Column gap={3} sx={{ maxWidth: 560 }}>
      <Quote>What will be sent next.</Quote>
      <Quote tone="info">What will be resent as the first attempt.</Quote>
      <Quote tone="neutral">A quote with no category.</Quote>
      <Quote clamp={2} title="The full text goes here">
        {'Long content folds to a few lines.\nSecond line.\nThe third line is hidden.\nThe fourth is hidden too.'}
      </Quote>
    </Column>
  )
}

/** Placed just before the button that sends you to another surface, stating outright whether going is needed. */
export const Hints: StoryObj = {
  render: () => (
    <Column gap={2} sx={{ maxWidth: 560 }}>
      <HintList>
        <li>
          <TriangleAlert size={iconSize.sm} {...iconDefaults} />
          <span>No target is assigned, so nothing will start running</span>
        </li>
        <li>
          <TriangleAlert size={iconSize.sm} {...iconDefaults} />
          <span>Fetching is paused</span>
        </li>
      </HintList>
      <Text size="xs" tone="tertiary">
        When nothing is paused, not one of these is shown.
      </Text>
    </Column>
  )
}
