import { useId, useState } from 'react'
import { ContentTabs, ContentTabPanel } from '../navigation/ContentTabs.js'
import { Composer, ComposerBox, ComposerInput, ComposerToolbar } from '../inputs/Composer.js'
import { ConversationScroll } from './ConversationLayout.js'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../inputs/Button.js'
import { TextArea } from '../inputs/TextInput.js'
import { PlainInput } from '../inputs/InlineInput.js'
import { Text } from '../data-display/Text.js'
import { PaneToolbar } from './Workbench.js'
import { WorkSurface, ExplorerLayout, ExplorerPane, EditorPane, OverlayViewport, FindBar, FloatingEditorForm } from './EditorWorkspace.js'

const meta: Meta = { title: 'Layout/EditorWorkspace', parameters: { layout: 'fullscreen' } }
export default meta

/** Only the layout is shared; the target's name, the search and the submit handling all come from the caller. */
export const WithOverlays: StoryObj = {
  render: () => (
    <WorkSurface style={{ height: '100vh' }}>
      <PaneToolbar><Text>Files</Text></PaneToolbar>
      <ExplorerLayout>
        <ExplorerPane><Text>src/example.ts</Text></ExplorerPane>
        <EditorPane>
          <OverlayViewport>
            <Text>export const example = 1</Text>
            <FindBar onSubmit={(event) => event.preventDefault()}>
              <PlainInput aria-label="Search" placeholder="Search" />
              <Button type="submit">Next</Button>
            </FindBar>
            <FloatingEditorForm onSubmit={(event) => event.preventDefault()}>
              <TextArea aria-label="Comment" placeholder="Comment" />
              <Button type="submit">Send</Button>
            </FloatingEditorForm>
          </OverlayViewport>
        </EditorPane>
      </ExplorerLayout>
    </WorkSurface>
  )
}

function PersistentInputExample(): JSX.Element {
  const id = useId()
  const [mode, setMode] = useState('conversation')
  const [text, setText] = useState('Please explain the change to the example.')
  const options = [{ value: 'conversation', label: 'Conversation' }, { value: 'files', label: 'Files' }]
  return (
    <WorkSurface style={{ height: '100vh' }}>
      <PaneToolbar><ContentTabs idBase={id} label="View" value={mode} options={options} onChange={setMode} /></PaneToolbar>
      <ContentTabPanel idBase={id} value="conversation" activeValue={mode}>
        <ConversationScroll><Text>The example now accepts an optional label.</Text></ConversationScroll>
      </ContentTabPanel>
      <ContentTabPanel idBase={id} value="files" activeValue={mode}>
        <ExplorerLayout>
          <ExplorerPane><Text>src/example.ts</Text></ExplorerPane>
          <EditorPane><ConversationScroll><Text mono>export const example = (label = '') =&gt; label</Text></ConversationScroll></EditorPane>
        </ExplorerLayout>
      </ContentTabPanel>
      <Composer>
        <ComposerBox>
          <ComposerInput aria-label="Message" value={text} onChange={(event) => setText(event.target.value)} />
          <ComposerToolbar><Button>Send</Button></ComposerToolbar>
        </ComposerBox>
      </Composer>
    </WorkSurface>
  )
}

/** Input belongs to the whole surface and stays mounted as the reading context changes. */
export const WithPersistentInput: StoryObj = { render: () => <PersistentInputExample /> }
