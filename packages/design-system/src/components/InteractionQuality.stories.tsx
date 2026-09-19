import { useId, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowUp, Check, FileText, Folder, Plus, Search, X } from 'lucide-react'
import {
  Button, Column, Composer, ComposerBox, ComposerContext, ComposerInput, ComposerToolbar,
  ContentTabPanel, ContentTabs, ContextChip, GlassPanel, IconButton, ItemBody, ItemGroupHeader,
  ItemList, ItemMarker, ItemRow, ItemSubline, Panel, PanelHeader, PanelHeading, Row,
  SegmentedControl, Spacer, Text, ThemeProvider, TranscriptThinkingBody, TranscriptThinkingToggle,
  TranscriptToolCluster, TranscriptToolLine, TranscriptToolVerb, TranscriptTurn, TranscriptTurnBody,
  TranscriptTurnHead, TranscriptTurnRole, TranscriptTurnRule, TranscriptTurnText, WindowDragArea
} from '../index.js'

const meta: Meta = { title: 'Patterns/InteractionQuality', parameters: { layout: 'fullscreen' } }
export default meta

function Specimen({ narrow = false }: { narrow?: boolean }): JSX.Element {
  const id = useId()
  const [tab, setTab] = useState('document')
  const [choice, setChoice] = useState('Standard')
  const [selected, select] = useState(0)
  const [thinking, setThinking] = useState(false)
  const [tool, setTool] = useState(false)
  const [input, setInput] = useState('')
  return (
    <div style={{ height: '100vh', display: 'flex', background: 'linear-gradient(135deg, #34495f, #525b66 40%, #66545d)' }}>
      <GlassPanel>
        <Panel width={268} surface="transparent">
          <PanelHeader size="sm"><PanelHeading>Documents</PanelHeading><Text size="xs" tone="tertiary" tabular>6</Text><WindowDragArea /><IconButton title="Add a document" icon={<Plus size={16} />} /></PanelHeader>
          <ItemList inset>
            {['Recently opened', 'Saved'].map((group, groupIndex) => <div key={group}>
              <ItemGroupHeader surface="glass">{group}<Spacer /><Text tabular>3</Text></ItemGroupHeader>
              {['Readability check', 'How a long file name looks when the number of digits changes', 'Pull the next schedule together'].map((title, index) => <ItemRow key={title} lines={2} selected={selected === groupIndex * 3 + index} onClick={() => select(groupIndex * 3 + index)}>
                <ItemMarker><FileText size={14} /></ItemMarker><ItemBody><Text size="sm" truncate>{title}</Text><ItemSubline><Text truncate>Design notes</Text><Spacer /><Text tabular>{index ? '12h 05m' : '2 min ago'}</Text></ItemSubline></ItemBody>
              </ItemRow>)}
            </div>)}
          </ItemList>
        </Panel>
      </GlassPanel>
      <Panel grow surface="canvas">
        <PanelHeader><PanelHeading>Readability check</PanelHeading><WindowDragArea /><IconButton title="Search" icon={<Search size={16} />} /><Button startIcon={<Check size={14} />}>Save</Button></PanelHeader>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: narrow ? 380 : '100%', maxWidth: '100%', marginInline: 'auto' }}>
          <ContentTabs idBase={id} label="Document contents" value={tab} onChange={setTab} options={[
            { value: 'document', label: 'Document', icon: <FileText size={14} /> },
            { value: 'history', label: 'History', count: 12 },
            { value: 'disabled', label: 'Sharing', disabled: true }
          ]} />
          <ContentTabPanel idBase={id} value="document" activeValue={tab}>
            <div style={{ padding: 20, flex: 1, minHeight: 0, overflow: 'auto' }}>
              <TranscriptTurn><TranscriptTurnHead><TranscriptTurnRole user>You</TranscriptTurnRole><TranscriptTurnRule /><Text>10:24</Text></TranscriptTurnHead><TranscriptTurnBody><TranscriptTurnText role="user">Line the headings up with the controls and make the content easier to read.</TranscriptTurnText></TranscriptTurnBody></TranscriptTurn>
              <TranscriptTurn><TranscriptTurnHead><TranscriptTurnRole>Assistant</TranscriptTurnRole><TranscriptTurnRule /><Text>10:25</Text></TranscriptTurnHead><TranscriptTurnBody>
                <TranscriptThinkingToggle aria-expanded={thinking} aria-controls={`${id}-thinking`} onClick={() => setThinking(!thinking)}>Reasoning</TranscriptThinkingToggle>
                {thinking && <TranscriptThinkingBody id={`${id}-thinking`}>Checking the letterforms, the visual weight of the glyphs, and the hit areas, in that order.</TranscriptThinkingBody>}
                <TranscriptTurnText>The heading axis is aligned. With a long name or a short one, the controls at the right edge stay in the same place.</TranscriptTurnText>
                <TranscriptToolCluster tone="neutral"><TranscriptToolLine aria-expanded={tool} aria-controls={`${id}-tool`} onClick={() => setTool(!tool)}><TranscriptToolVerb data-verb>Read</TranscriptToolVerb><span data-target>documents/design-guidelines.md</span></TranscriptToolLine>{tool && <TranscriptThinkingBody id={`${id}-tool`}>Checked in order: headings, selection, input, secondary information.</TranscriptThinkingBody>}</TranscriptToolCluster>
                <TranscriptTurnText>A selected item still reads as selected under hover. Keyboard focus is told apart by its outline.</TranscriptTurnText>
              </TranscriptTurnBody></TranscriptTurn>
              <Row gap="md"><Button>Save</Button><Button variant="outline">Preview</Button><Button variant="ghost">Discard</Button><Button disabled>Send</Button></Row>
            </div>
          </ContentTabPanel>
          <ContentTabPanel idBase={id} value="history" activeValue={tab}><Column gap="md"><Text>Today 10:25</Text><Text>Updated the heading alignment and the input field</Text></Column></ContentTabPanel>
          <Composer><ComposerBox><ComposerContext><ContextChip icon={<Folder size={14} />} onClick={() => undefined}>Design notes</ContextChip><SegmentedControl<string> label="Display density" options={['Brief', 'Standard', 'Detailed'].map(value => ({ value, label: value }))} value={choice} onChange={setChoice} /></ComposerContext><ComposerInput aria-label="Message" placeholder="Keep writing…" value={input} onChange={event => setInput(event.target.value)} /><ComposerToolbar><IconButton title="Attach" icon={<Plus size={16} />} /><Spacer /><Button color="primary" disabled={!input.trim()} startIcon={<ArrowUp size={14} />}>Send</Button></ComposerToolbar></ComposerBox></Composer>
        </div>
      </Panel>
    </div>
  )
}

export const Overview: StoryObj = { render: () => <Specimen /> }
export const Narrow: StoryObj = { render: () => <Specimen narrow /> }
export const Light: StoryObj = { render: () => <ThemeProvider colorScheme="light"><Specimen /></ThemeProvider> }

function OverflowExample(): JSX.Element {
  const id = useId()
  const [value, setValue] = useState('0')
  return <div style={{ width: 420, padding: 20 }}><Row><ContentTabs idBase={id} label="Open documents" appearance="document" value={value} onChange={setValue} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i), label: i === 1 ? 'notes-on-the-document-with-a-very-long-name.md' : `document-${i + 1}.md`, icon: <FileText size={14} />, disabled: i === 3 }))} /><IconButton title="Close" icon={<X size={14} />} /></Row>{Array.from({ length: 12 }, (_, i) => <ContentTabPanel key={i} idBase={id} value={String(i)} activeValue={value}><Text>Document {i + 1}</Text></ContentTabPanel>)}</div>
}
export const Overflow: StoryObj = { render: () => <OverflowExample /> }

export const Comfortable: StoryObj = { render: () => <ThemeProvider density="comfortable"><Specimen narrow /></ThemeProvider> }
