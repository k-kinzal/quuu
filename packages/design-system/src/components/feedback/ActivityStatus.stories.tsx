import type { Meta, StoryObj } from '@storybook/react-vite'
import { ThemeProvider } from '../../theme/ThemeProvider.js'
import { Text } from '../data-display/Text.js'
import { Column } from '../layout/Stack.js'
import { ActivityStatus } from './ActivityStatus.js'

export default { title: 'Feedback/ActivityStatus', component: ActivityStatus } satisfies Meta<typeof ActivityStatus>
export const Phases: StoryObj = { render: () => <Column gap="md">
  <ActivityStatus label="Connecting" />
  <ActivityStatus label="Working" />
  <ActivityStatus label="処理中" />
</Column> }

export const InConversation: StoryObj = { render: () => <Column gap="sm">
  <Text>I'll check the remaining files and report what I find.</Text>
  <ActivityStatus label="Working" />
</Column> }

export const Narrow: StoryObj = { render: () => <div style={{ width: 220 }}>
  <ActivityStatus label="Checking the remaining documents for updates" />
</div> }

export const Comfortable: StoryObj = { render: () => <ThemeProvider density="comfortable">
  <ActivityStatus label="Working" />
</ThemeProvider> }
