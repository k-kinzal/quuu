import { Markdown } from '../data-display/Markdown.js'
import { ExternalLink, FileText } from 'lucide-react'
import { ItemGroupHeader, ItemList } from '../data-display/ItemList.js'
import { ResourceItem } from '../data-display/ResourceItem.js'
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
import { DocumentBody, WorkSurface, ExplorerLayout, ExplorerPane, EditorPane, OverlayViewport, FindBar, FloatingEditorForm } from './EditorWorkspace.js'

const meta: Meta = { title: 'Layout/EditorWorkspace', parameters: { layout: 'fullscreen' } }
export default meta

/** Reused by the browser regression so narrow layouts exercise the real pointer target. */
export function ExplorerResizeSpecimen({ width = 720 }: { width?: number }): JSX.Element {
  return <WorkSurface style={{ width, height: 300 }}>
    <ExplorerLayout data-explorer-layout>
      <ExplorerPane aria-label="Files"><ItemList>
        <ResourceItem icon={<FileText />} label="understanding-the-project-structure.md" description="packages/example/docs" selected />
        <ResourceItem icon={<FileText />} label="src/example.ts" />
      </ItemList></ExplorerPane>
      <EditorPane aria-label="Selected content"><DocumentBody>
        <Text>Drag the boundary or focus it and use the arrow keys to leave more room for this content.</Text>
      </DocumentBody></EditorPane>
    </ExplorerLayout>
  </WorkSurface>
}

export const Narrow: StoryObj = { render: () => <ExplorerResizeSpecimen width={360} /> }

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

export const DocumentPreview: StoryObj = {
  render: () => <WorkSurface style={{ height: '100vh' }}>
    <ExplorerLayout>
      <ExplorerPane><ItemList>
        <ItemGroupHeader>Documentation sites</ItemGroupHeader>
        <ResourceItem icon={<ExternalLink />} label="schema-binding · API reference" description="example.github.io" />
        <ResourceItem icon={<ExternalLink />} label="schema-binding · Installation and configuration" description="example.github.io" />
        <ItemGroupHeader>Repository files</ItemGroupHeader>
        <ResourceItem icon={<FileText />} label="README.md" selected />
        <ResourceItem icon={<FileText />} label="guide.md" description="packages/schema-binding/docs" />
        <ResourceItem icon={<FileText />} label="understanding-schema-binding-and-statement-models.md" description="docs" />
      </ItemList></ExplorerPane>
      <EditorPane><DocumentBody><Markdown baseUrl="https://example.com/docs/" headingPrefix="doc-" onOpenLink={console.log}>
        {'# Project documentation\n\n[Installation](guide.md#installation)\n\n## Installation\n\n日本語の説明と **structured prose** を読みながら入力できます。\n\n| Option | Meaning |\n| --- | --- |\n| Default | Read the committed documentation |\n\n```ts\nconst message = "Hello"\n```\n\n## Installation\n\nRepeated headings have distinct anchors.'}
      </Markdown></DocumentBody></EditorPane>
    </ExplorerLayout>
    <Composer><ComposerBox><ComposerInput aria-label="New request" placeholder="Add a request while reading…" /></ComposerBox></Composer>
  </WorkSurface>
}
