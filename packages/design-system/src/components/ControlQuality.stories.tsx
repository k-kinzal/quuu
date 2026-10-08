import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Search, Plus, RefreshCw, ThumbsUp } from 'lucide-react'
import { ThemeProvider } from '../theme/ThemeProvider.js'
import { Button, IconButton } from './inputs/Button.js'
import { ReactionButton } from './inputs/ReactionButton.js'
import { FilterChip } from './inputs/FilterChip.js'
import { SearchInput, InlineInput, AutoTextArea } from './inputs/InlineInput.js'
import { NumberInput, Select, TextArea, TextInput } from './inputs/TextInput.js'
import { Checkbox, Switch, SegmentedControl } from './inputs/Toggle.js'
import { ComposerBox, ComposerInput } from './inputs/Composer.js'
import { ContentTabs } from './navigation/ContentTabs.js'
import { Row, Column } from './layout/Stack.js'
import { Text } from './data-display/Text.js'

const meta: Meta = { title: 'Patterns/ControlQuality' }
export default meta

/** Render the real components together; the browser regression uses this same specimen. */
export function ControlSpecimen(): JSX.Element {
  const [reaction, setReaction] = useState(false)
  const [filter, setFilter] = useState(false)
  const [value, setValue] = useState('first')
  const [checked, setChecked] = useState(false)
  return <Column gap="xl">
    <Text>Filters — same geometry, including selected and disabled</Text>
    <Row gap="md" wrap>
      <div data-control="search"><SearchInput aria-label="Search" placeholder="Search / 名前で絞り込む" icon={<Search />} /></div>
      <div data-control="filter"><FilterChip label="Category" value={filter ? 'Selected' : undefined} onClick={() => setFilter(!filter)} /></div>
      <div data-control="selected"><FilterChip label="Category" value="Selected" onClick={() => undefined} /></div>
      <div data-control="button-xs"><Button size="xs">Clear</Button></div>
      <div data-control="search-disabled"><SearchInput aria-label="Disabled search" placeholder="Disabled search" disabled /></div>
      <div data-control="filter-disabled"><FilterChip label="Disabled" disabled onClick={() => undefined} /></div>
    </Row>
    <Row gap="md" wrap>
      <div data-control="reaction"><ReactionButton title="Like message" icon={<ThumbsUp />} selected={reaction} onClick={() => setReaction(!reaction)} /></div>
      <div data-control="reaction-selected"><ReactionButton title="Liked message" icon={<ThumbsUp />} selected /></div>
      <div data-control="reaction-disabled"><ReactionButton title="Unavailable reaction" icon={<ThumbsUp />} disabled /></div>
      <div data-control="reaction-loading"><ReactionButton title="Saving reaction" icon={<ThumbsUp />} loading /></div>
    </Row>
    <Text>Fields — one frame for entry and selection</Text>
    <Row gap="md" wrap>
      <div data-control="text"><TextInput aria-label="Name" placeholder="Name / 名前" /></div>
      <div data-control="number"><NumberInput aria-label="Count" value={12} onChange={() => undefined} unit="items" /></div>
      <div data-control="select"><Select aria-label="Choice" value={value} options={[{ value: 'first', label: 'First' }, { value: 'second', label: 'Second / 二番目' }]} onChange={e => setValue(e.target.value)} /></div>
      <div data-control="button-md"><Button size="md">Apply</Button></div>
    </Row>
    <Row gap="md" wrap>
      <div data-control="error"><TextInput aria-label="Invalid name" error defaultValue="Invalid" /></div>
      <div data-control="text-disabled"><TextInput aria-label="Disabled name" disabled defaultValue="Disabled" /></div>
      <div data-control="select-disabled"><Select aria-label="Disabled choice" value="first" disabled options={[{ value: 'first', label: 'First' }]} /></div>
      <div data-control="readonly"><TextInput aria-label="Read only" readOnly defaultValue="Read only" /></div>
    </Row>
    <div data-control="textarea"><TextArea aria-label="Description" defaultValue={'Multiple lines\n複数行の文章'} /></div>
    <Text>Actions, toggles, navigation and writing surfaces — shared focus language</Text>
    <Row gap="md" wrap>
      <div data-control="button"><Button>Save</Button></div>
      <div data-control="icon"><IconButton title="Add" icon={<Plus />} /></div>
      <div data-control="icon-loading"><IconButton title="Refreshing" loading loadingAnimation="rotate" icon={<RefreshCw />} /></div>
      <Button variant="outline">Preview</Button><Button variant="ghost">Cancel</Button><Button disabled>Unavailable</Button>
      <div data-control="checkbox"><Checkbox label="Include" checked={checked} onChange={setChecked} /></div>
      <div data-control="switch"><Switch label="Enabled" checked={checked} onChange={setChecked} /></div>
      <div data-control="segments"><SegmentedControl<string> label="Mode" value={value} onChange={setValue} options={[{ value: 'first', label: 'First' }, { value: 'second', label: 'Second' }]} /></div>
    </Row>
    <div data-control="tabs"><ContentTabs idBase="quality" label="Contents" value={value} onChange={setValue} options={[{ value: 'first', label: 'First' }, { value: 'second', label: 'Second' }]} /></div>
    <div data-control="inline"><InlineInput aria-label="Title" defaultValue="An editable title" /></div>
    <div data-control="prose"><AutoTextArea aria-label="Notes" defaultValue="Notes written in place" /></div>
    <div data-control="composer"><ComposerBox><ComposerInput aria-label="Message" placeholder="Write a message" /></ComposerBox></div>
  </Column>
}

export const Dark: StoryObj = { render: () => <ThemeProvider colorScheme="dark"><ControlSpecimen /></ThemeProvider> }
export const Light: StoryObj = { render: () => <ThemeProvider colorScheme="light"><ControlSpecimen /></ThemeProvider> }
export const ComfortableDark: StoryObj = { render: () => <ThemeProvider colorScheme="dark" density="comfortable"><ControlSpecimen /></ThemeProvider> }
export const ComfortableLight: StoryObj = { render: () => <ThemeProvider colorScheme="light" density="comfortable"><ControlSpecimen /></ThemeProvider> }
export const Narrow: StoryObj = { render: () => <div style={{ width: 360 }}><ControlSpecimen /></div> }
