import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Plus, Folder, MoreHorizontal, Send, ChevronDown } from 'lucide-react'
import { ThemeProvider } from '../theme/ThemeProvider.js'
import { Button, IconButton } from './inputs/Button.js'
import { SplitButton } from './inputs/SplitButton.js'
import { CompactComposer } from './inputs/CompactComposer.js'
import { NavItem, NavSection, SideNav } from './navigation/NavList.js'
import { ActivityBar } from './navigation/ActivityBar.js'
import { ContentTabs } from './navigation/ContentTabs.js'
import { CollapseHandle } from './layout/Resizer.js'
import { ListFrame, ListFrameButton } from './layout/ListFrame.js'
import { Row, Column } from './layout/Stack.js'
import { Text } from './data-display/Text.js'
import { Menu } from './surfaces/Menu.js'
import { RepeatableList, RepeatableRow, SwatchGroup } from './inputs/RepeatableList.js'
import { ToastStack } from './feedback/Toast.js'

const meta: Meta = { title: 'Patterns/TooltipQuality' }
export default meta

/** Keep clipped navigation, disabled actions and menu activation in the same browser contract. */
export function TooltipSpecimen(): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return <Column gap="xl">
    <Text>Every icon exposes its name on hover and keyboard focus.</Text>
    <Row gap="lg">
      <div data-tooltip="nav"><SideNav collapsed aria-label="Collapsed navigation"><NavSection>
        <NavItem collapsed active label="Project files / プロジェクト構造" icon={<Folder />} badge={3} />
        <NavItem collapsed label="Documents" title="Documents and notes" icon={<Folder />} />
      </NavSection></SideNav></div>
      <div data-tooltip="activity"><ActivityBar label="Panels" items={[{ id: 'files', label: 'Files panel', icon: <Folder />, badge: 2 }]} visibleIds={['files']} onToggle={() => undefined} onReorder={() => undefined} /></div>
      <div data-tooltip="collapse"><CollapseHandle title="Restore panel" icon={<Folder />} onClick={() => undefined} /></div>
      <div data-tooltip="icon"><IconButton title="Add item" icon={<Plus />} /></div>
      <div data-tooltip="disabled"><IconButton title="Unavailable action" icon={<Plus />} disabled /></div>
      <div data-tooltip="menu"><IconButton title="More actions" icon={<MoreHorizontal />} menu aria-expanded={anchor ? 'true' : 'false'} onClick={e => setAnchor(e.currentTarget)} /></div>
    </Row>
    <ListFrame bar={<>
      <div data-tooltip="list"><ListFrameButton title="Add row" icon={<Plus />} onClick={() => undefined} /></div>
      <div data-tooltip="list-disabled"><ListFrameButton title="Remove row" icon={<Plus />} disabled onClick={() => undefined} /></div>
    </>}><Text>Editable list</Text></ListFrame>
    <div data-tooltip="send"><CompactComposer value="Message" onChange={() => undefined} onSend={() => undefined} placeholder="Message" sendLabel="Send message" sendIcon={<Send />} /></div>
    <div data-tooltip="split"><SplitButton menuTitle="Choose action" caret={<ChevronDown />} options={[{ value: 'save', label: 'Save' }]} selected="save" onSelect={() => undefined}>Save</SplitButton></div>
    <div data-tooltip="close"><ContentTabs idBase="tooltip-tabs" label="Documents" value="first" onChange={() => undefined} onClose={() => undefined} options={[{ value: 'first', label: 'First' }, { value: 'second', label: 'Second' }]} /></div>
    <div data-tooltip="scroll" style={{ width: 200 }}><ContentTabs idBase="overflow-tabs" label="Overflow" value="first" onChange={() => undefined} options={[{ value: 'first', label: 'First long document' }, { value: 'second', label: 'Second long document' }, { value: 'third', label: 'Third long document' }]} /></div>
    <div data-tooltip="reorder"><RepeatableList onReorder={() => undefined}><RepeatableRow index={0}><Text>Reorderable item</Text></RepeatableRow></RepeatableList></div>
    <div data-tooltip="swatch"><SwatchGroup label="Color" colors={['blue']} value="blue" onChange={() => undefined} /></div>
    <div data-tooltip="dismiss"><ToastStack toasts={[{ id: 'notice', tone: 'info', message: 'A notification' }]} onSelect={() => undefined} onDismiss={() => undefined} /></div>
    <SideNav><NavSection><NavItem label="Expanded navigation" icon={<Folder />} /></NavSection></SideNav>
    <Button>Focus destination</Button>
    <Menu open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} label="More actions" items={() => [{ label: 'Inspect', onSelect: () => setAnchor(null) }]} />
  </Column>
}

export const Dark: StoryObj = { render: () => <ThemeProvider colorScheme="dark"><TooltipSpecimen /></ThemeProvider> }
export const Light: StoryObj = { render: () => <ThemeProvider colorScheme="light"><TooltipSpecimen /></ThemeProvider> }
export const Comfortable: StoryObj = { render: () => <ThemeProvider density="comfortable"><TooltipSpecimen /></ThemeProvider> }
