import type { Meta, StoryObj } from '@storybook/react-vite'
import { Column } from '../layout/Stack.js'
import { Diagram } from './Diagram.js'
import { SourceBlock } from './SourceBlock.js'
import { Text } from './Text.js'

const meta: Meta = { title: 'Data Display/Diagram' }
export default meta

const FLOW = [
  'flowchart TD',
  '  A[Fetch] --> B{Slot available?}',
  '  B -->|Available| C[Launch]',
  '  B -->|Full| D[Wait]',
  '  C --> E{Exited cleanly?}',
  '  E -->|Yes| F([Awaiting review])',
  '  E -->|Limit| G[Fall back to another agent]',
  '  G --> C',
  '  D --> B'
].join('\n')

const SHAPES = [
  'flowchart LR',
  '  A[Rect] --> B(Rounded)',
  '  B --> C([Stadium])',
  '  C --> D{Diamond}',
  '  D --> E((Circle))',
  '  E --> F[[Subroutine]]',
  '  F --> G[(Database)]',
  '  G --> H{{Hexagon}}'
].join('\n')

const SEQUENCE = [
  'sequenceDiagram',
  '  participant H as Human',
  '  participant T as App',
  '  participant A as Agent',
  '  H->>T: Queue a task',
  '  loop Until a slot opens',
  '    T->>A: Launch',
  '    A-->>T: Exits cleanly',
  '  end',
  '  alt Review passes',
  '    H->>T: Mark done',
  '  else Send back',
  '    H->>T: Append and continue',
  '    T->>A: Resume the same session',
  '  end',
  '  Note over H,T: Completion is a human decision. Agents reach review at most'
].join('\n')

const STATE = [
  'stateDiagram-v2',
  '  [*] --> draft',
  '  draft --> queued: enqueue',
  '  queued --> running: slot opens',
  '  running --> review: exits cleanly',
  '  running --> failed: exits abnormally',
  '  review --> done: human confirms',
  '  done --> [*]'
].join('\n')

const CLASSES = [
  'classDiagram',
  '  class Task {',
  '    +id: string',
  '    +status: TaskStatus',
  '    +enqueue()',
  '  }',
  '  class Run {',
  '    +pid: number',
  '    +exitCode: number',
  '  }',
  '  Task "1" --> "*" Run : runs'
].join('\n')

export const Flowchart: StoryObj = {
  render: () => <Diagram source={FLOW} label="Scheduler flow" />
}

export const Shapes: StoryObj = {
  render: () => <Diagram source={SHAPES} />
}

export const Sequence: StoryObj = {
  render: () => <Diagram source={SEQUENCE} />
}

/** Kinds beyond flowchart and sequence render upstream as-is too. */
export const OtherKinds: StoryObj = {
  render: () => (
    <Column gap={4}>
      <Text size="xs" tone="tertiary">
        State transitions
      </Text>
      <Diagram source={STATE} />
      <Text size="xs" tone="tertiary">
        Classes
      </Text>
      <Diagram source={CLASSES} />
    </Column>
  )
}

/** What is broken as notation stays code, never a diagram. */
export const Broken: StoryObj = {
  render: () => (
    <Diagram
      source={'flowchart TD\n  A[unclosed --> B'}
      fallback={() => <SourceBlock code={'flowchart TD\n  A[unclosed --> B'} language="mermaid" />}
    />
  )
}
