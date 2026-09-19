import type { Meta, StoryObj } from '@storybook/react-vite'
import { Panel } from '../layout/Panel.js'
import { Row } from '../layout/Stack.js'
import { EmptyState, Skeleton, Spinner } from './EmptyState.js'

const meta: Meta<typeof EmptyState> = { title: 'Feedback/EmptyState', component: EmptyState }
export default meta

/** Place "the next move", not an explanation. */
export const Default: StoryObj = {
  render: () => (
    <Panel surface="canvas" sx={{ height: 300 }}>
      <EmptyState title="Nothing here yet" action={{ label: 'Add one', onClick: () => undefined }} />
    </Panel>
  )
}

/** With no next move, leave it empty. Do not fill it with prose. */
export const WithoutAction: StoryObj = {
  render: () => (
    <Panel surface="canvas" sx={{ height: 220 }}>
      <EmptyState title="Nothing matches" />
    </Panel>
  )
}

export const Loading: StoryObj = {
  render: () => (
    <Row gap={4} align="start">
      <Spinner label="Loading…" />
      <div style={{ width: 220 }}>
        <Skeleton width="80%" height={12} />
        <Skeleton width="60%" height={12} />
        <Skeleton width="90%" height={12} />
      </div>
    </Row>
  )
}
