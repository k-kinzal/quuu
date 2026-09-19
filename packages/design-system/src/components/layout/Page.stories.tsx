import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowLeft } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Button, IconButton } from '../inputs/Button.js'
import { Checkbox } from '../inputs/Toggle.js'
import { Field, FieldHint } from '../inputs/Field.js'
import { TextInput } from '../inputs/TextInput.js'
import { GroupTitle, OrderedNotes, Page, Section } from './Page.js'
import { Panel } from './Panel.js'

const meta: Meta = { title: 'Layout/Page', parameters: { layout: 'fullscreen' } }
export default meta

export const Default: StoryObj = {
  render: () => (
    <Panel surface="canvas" grow sx={{ height: '100vh', overflowY: 'auto' }}>
      <Page
        title="General"
        description="Decides how the whole thing behaves. Only things that apply app-wide go here."
        actions={<Button color="primary">Save</Button>}
      >
        <Section title="Behavior">
          <Checkbox label="Start automatically at launch" checked onChange={() => undefined} />
          <Checkbox
            label="Keep running after closing"
            hint="Turn this off and it stops the moment you close it."
            checked={false}
            onChange={() => undefined}
          />
        </Section>

        <Section title="Interval">
          <Field label="Polling interval (ms)" hint="The default is 3000." width="sm">
            <TextInput type="number" defaultValue={3000} />
          </Field>
        </Section>

        <Section title="Rules">
          <FieldHint>When a slot frees up, the first item meeting all of the following is taken.</FieldHint>
          <OrderedNotes>
            <li>It is waiting</li>
            <li>Its scheduled time has passed</li>
            <li>Whatever precedes it has finished</li>
            <li>The cap has not been reached</li>
          </OrderedNotes>
        </Section>
      </Page>
    </Panel>
  )
}

/** One item picked out of a list and opened. The way back sits to the left of the title. */
export const Detail: StoryObj = {
  render: () => (
    <Panel surface="canvas" grow sx={{ height: '100vh', overflowY: 'auto' }}>
      <Page
        title="Alpha"
        lead={
          <IconButton
            title="Back to the list (Esc)"
            icon={<ArrowLeft size={iconSize.md} {...iconDefaults} />}
          />
        }
        actions={
          <>
            <Button color="primary">Save</Button>
            <Button variant="ghost" color="error">
              Delete
            </Button>
          </>
        }
      >
        <Section title="Basics">
          <Field label="Name">
            <TextInput defaultValue="Alpha" />
          </Field>
        </Section>
        <GroupTitle>A section that is only a heading</GroupTitle>
        <FieldHint>Used when you want the row heights aligned without drawing a rule.</FieldHint>
      </Page>
    </Panel>
  )
}
