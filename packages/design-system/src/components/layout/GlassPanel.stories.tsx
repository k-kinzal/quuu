import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChevronRight, Inbox, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react'
import { paneProfiles } from '../../layoutSpec.js'
import { IconButton } from '../inputs/Button.js'
import { Text } from '../data-display/Text.js'
import { ItemList, ItemRow } from '../data-display/ItemList.js'
import { NavItem, NavSection, SideNav, SideNavTop } from '../navigation/NavList.js'
import { AppShell, AppShellBody, AppShellFooter, AppShellMain, WindowDragArea } from './AppShell.js'
import { Panel, PanelHeader } from './Panel.js'
import { GlassPanel, GlassPanelDivider } from './GlassPanel.js'
import { CollapseHandle, Resizer } from './Resizer.js'
import { Spacer } from './Stack.js'

const meta: Meta = { title: 'Layout/GlassPanel', parameters: { layout: 'fullscreen' } }
export default meta

function Example({ collapsed = false, hidden = false, plain = false }: { collapsed?: boolean; hidden?: boolean; plain?: boolean }): JSX.Element {
  const [railCollapsed, setRailCollapsed] = useState(collapsed)
  const [listHidden, setListHidden] = useState(hidden)
  const [railWidth, setRailWidth] = useState(paneProfiles.navigation.initial)
  const [listWidth, setListWidth] = useState(paneProfiles.collection.initial)
  return (
    <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
      {/* Put color and fine detail behind it, and check that the color shows through while the detail does not stay readable. */}
      <div style={{ position: 'absolute', inset: 0, background: plain ? '#42464b' : 'linear-gradient(145deg, #203f74, #596880 42%, #78475a 64%, #372d45)' }}>
        {!plain && <div style={{ margin: '15% 5%', width: 240, height: 300, background: 'repeating-linear-gradient(0deg, #c39c6b 0 4px, #364963 4px 20px)' }} />}
      </div>
      <AppShell glass style={{ position: 'relative' }}>
        <AppShellBody>
          <GlassPanel aria-label="Side panel">
            <SideNav collapsed={railCollapsed} width={railWidth} collapsedWidth={38} surface="transparent" bordered={false}>
              <SideNavTop draggable collapsed={railCollapsed} inset={railCollapsed ? undefined : 76}>
                {!railCollapsed && <IconButton title="Collapse the nav" icon={<PanelLeftClose size={16} />} onClick={() => setRailCollapsed(true)} />}
              </SideNavTop>
              {railCollapsed && <SideNavTop collapsed><IconButton title="Bring the nav back" icon={<PanelLeftOpen size={16} />} onClick={() => setRailCollapsed(false)} /></SideNavTop>}
              <NavSection><NavItem icon={<Inbox size={16} />} label="All" badge={3} collapsed={railCollapsed} active /></NavSection>
              <Spacer />
              <NavSection pinned><NavItem icon={<Settings size={16} />} label="Settings" collapsed={railCollapsed} /></NavSection>
            </SideNav>
            <GlassPanelDivider>
              {!railCollapsed && <Resizer value={railWidth} profile="navigation" onChange={setRailWidth} />}
            </GlassPanelDivider>
            {listHidden ? (
              <CollapseHandle title="Bring the list back" surface="transparent" bordered={false} icon={<ChevronRight size={12} />} onClick={() => setListHidden(false)} />
            ) : (
              <>
                <Panel width={listWidth} surface="transparent">
                  <PanelHeader size="sm" startInset={railCollapsed ? 38 : undefined}>
                    <Text weight="bold">List</Text><WindowDragArea />
                    <IconButton title="Collapse the list" icon={<PanelLeftClose size={16} />} onClick={() => setListHidden(true)} />
                  </PanelHeader>
                  <ItemList>
                    {['Check the reference material', 'Pull the changes together', 'Settle the next schedule'].map((title, i) => <ItemRow key={title} type="button" selected={i === 0}><Text truncate>{title}</Text></ItemRow>)}
                  </ItemList>
                </Panel>
                <Resizer value={listWidth} profile="collection" onChange={setListWidth} />
              </>
            )}
          </GlassPanel>
          <AppShellMain windowHeader>
            <Panel grow surface="canvas" windowHeader>
              <PanelHeader startInset={railCollapsed && listHidden ? 20 : undefined}><Text weight="bold">Contents</Text><WindowDragArea /></PanelHeader>
            </Panel>
            <AppShellFooter>Footer of the main surface</AppShellFooter>
          </AppShellMain>
        </AppShellBody>
      </AppShell>
    </div>
  )
}

export const Expanded: StoryObj = { render: () => <Example /> }
// With a patterned wallpaper alone you miss that the material difference flattens out on a flat-color real screen.
export const PlainBackdrop: StoryObj = { render: () => <Example plain /> }
export const CollapsedNavigation: StoryObj = { render: () => <Example collapsed /> }
export const CollapsedBoth: StoryObj = { render: () => <Example collapsed hidden /> }
