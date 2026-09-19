import type { Meta, StoryObj } from '@storybook/react-vite'
import { ThemeProvider } from '../../theme/ThemeProvider.js'
import { StatusIndicator } from '../data-display/StatusIndicator.js'
import { Text } from '../data-display/Text.js'
import { Button, IconButton } from '../inputs/Button.js'
import { Column, Row } from '../layout/Stack.js'
import { Spinner } from './EmptyState.js'

const meta: Meta<typeof Spinner> = { title: 'Feedback/LoadingDots', component: Spinner }
export default meta

function Examples(): JSX.Element {
  return <Column gap="lg">
    <Row gap="lg"><Spinner /><Spinner label="Loading…" /><Spinner label="読み込み中…" /></Row>
    <Row gap="md">
      <Button loading>Save</Button>
      <Button loading loadingPosition="start">Save</Button>
      <IconButton loading title="Refresh" icon="↻" />
    </Row>
    <Column gap="md">
      {Array.from({ length: 8 }, (_, index) => <Row key={index} gap="md">
        <StatusIndicator shape="spinner" tone="info" label="In progress" />
        <Text size="sm">Background operation {index + 1}</Text>
      </Row>)}
    </Column>
  </Column>
}

/** A full cycle takes 3.6 seconds. Check a busy list as well as the isolated mark. */
export const Compact: StoryObj = { render: () => <Examples /> }
export const Light: StoryObj = { globals: { colorScheme: 'light' }, render: () => <Examples /> }
export const Comfortable: StoryObj = {
  render: () => <ThemeProvider density="comfortable"><Examples /></ThemeProvider>
}
