import { useState } from 'react'
import { paneProfiles } from '../../layoutSpec.js'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChevronRight, Inbox, Search, Settings } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Counter } from '../data-display/Badge.js'
import { ItemGroupHeader, ItemList, ItemRow } from '../data-display/ItemList.js'
import { StatusIndicator } from '../data-display/StatusIndicator.js'
import { Text } from '../data-display/Text.js'
import { SearchInput } from '../inputs/InlineInput.js'
import { NavItem, NavSection, SideNav, SideNavTop } from '../navigation/NavList.js'
import { StatusBarItem } from '../navigation/StatusBar.js'
import { EmptyState } from '../feedback/EmptyState.js'
import {
  AppShell,
  AppShellBody,
  AppShellMain,
  AppShellFooter,
  AppShellHeader,
  AppShellNoDrag,
  WindowDragArea
} from './AppShell.js'
import { Panel, PanelBody, PanelHeader } from './Panel.js'
import { GlassPanel, GlassPanelDivider } from './GlassPanel.js'
import { CollapseHandle, Resizer } from './Resizer.js'
import { Spacer } from './Stack.js'

const meta: Meta = { title: 'Layout/AppShell', parameters: { layout: 'fullscreen' } }
export default meta

/** Just the skeleton assembled. Content belongs to each pane. */
export const Default: StoryObj = {
  render: function Render() {
    const [listWidth, setListWidth] = useState(paneProfiles.collection.initial)
    const [collapsed, setCollapsed] = useState(false)

    return (
      <AppShell style={{ height: '100vh' }}>
        <AppShellHeader inset={84}>
          <Text size="sm" weight="bold" tone="secondary" sx={{ letterSpacing: '0.04em' }}>
            design-system
          </Text>
          <Spacer />
          <AppShellNoDrag>
            <SearchInput
              icon={<Search size={iconSize.sm} {...iconDefaults} />}
              placeholder="Search"
            />
          </AppShellNoDrag>
        </AppShellHeader>

        <AppShellBody>
          <SideNav width={208}>
            <NavSection sx={{ marginTop: 1 }}>
              <NavItem
                icon={<Inbox size={iconSize.md} {...iconDefaults} />}
                label="All"
                badge={4}
                active
              />
            </NavSection>
            <Spacer />
            <NavSection pinned>
              <NavItem icon={<Settings size={iconSize.md} {...iconDefaults} />} label="Settings" />
            </NavSection>
          </SideNav>

          {collapsed ? (
            <CollapseHandle
              title="Restore the list"
              icon={<ChevronRight size={iconSize.sm} {...iconDefaults} />}
              onClick={() => setCollapsed(false)}
            />
          ) : (
            <>
              <Panel width={listWidth} bordered="right">
                <PanelHeader size="sm">
                  <Text size="sm" weight="bold">
                    List
                  </Text>
                  <Spacer />
                  <Text size="xs" tone="tertiary" tabular>
                    3
                  </Text>
                </PanelHeader>
                <ItemList>
                  <ItemGroupHeader>Awaiting review</ItemGroupHeader>
                  {['Decide the tokens', 'Align the components', 'Rewrite the guidelines'].map((t, i) => (
                    <ItemRow key={t} type="button" selected={i === 0} title={t}>
                      <StatusIndicator shape="diamond" tone="warning" label="Awaiting review" />
                      <Text size="sm" truncate sx={{ flex: '1 1 auto' }}>
                        {t}
                      </Text>
                    </ItemRow>
                  ))}
                </ItemList>
              </Panel>
              <Resizer value={listWidth} profile="collection" onChange={setListWidth} />
            </>
          )}

          <Panel surface="canvas" grow>
            <PanelHeader size="lg">
              <Text size="lg" weight="bold">
                Primary pane
              </Text>
              <Spacer />
              <Text
                size="xs"
                tone="tertiary"
                sx={{ cursor: 'pointer' }}
                onClick={() => setCollapsed(!collapsed)}
              >
                {collapsed ? 'Restore the list' : 'Collapse the list'}
              </Text>
            </PanelHeader>
            <PanelBody>
              <EmptyState title="This is the flexible-width pane" />
            </PanelBody>
          </Panel>
        </AppShellBody>

        <AppShellFooter>
          <StatusBarItem>
            <Text tone="tertiary">Running</Text>
            <Counter>1</Counter>
          </StatusBarItem>
          <Spacer />
          <Text size="xs" tone="tertiary">
            Bottom band
          </Text>
        </AppShellFooter>
      </AppShell>
    )
  }
}

/**
 * The shape without a window band.
 *
 * What lines up at the top is pane headers, not a band, and the auxiliary panes
 * (nav, list) **let the background show through**. In a desktop app the OS draws
 * the blur behind them, so here we lay down a wallpaper instead to judge how much
 * shows through and how readable the text stays.
 *
 * The space left at the top left is where the OS window controls live.
 */
export const Translucent: StoryObj = {
  render: function Render() {
    return (
      <div style={{ position: 'relative', height: '100vh', overflow: 'hidden' }}>
        {/* Stand-in for a wallpaper. There is no OS blur here, so the pane's own `backdrop-filter` does the work */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(60% 80% at 20% 20%, #4a6ea8 0%, transparent 60%),' +
              'radial-gradient(50% 60% at 80% 10%, #a8577a 0%, transparent 55%),' +
              'linear-gradient(160deg, #1b2330 0%, #3a2f46 100%)'
          }}
        />
        <AppShell style={{ position: 'relative', height: '100%' }}>
          <AppShellBody>
            <GlassPanel>
              <SideNav width={208} surface="transparent" bordered={false}>
                {/* With no window band, this gap becomes the surface that grabs the window (the left end is where the traffic lights live) */}
                <SideNavTop draggable inset={76} />
                <NavSection>
                  <NavItem
                    icon={<Inbox size={iconSize.md} {...iconDefaults} />}
                    label="All"
                    badge={4}
                    active
                  />
                  <NavItem icon={<Settings size={iconSize.md} {...iconDefaults} />} label="Settings" />
                </NavSection>
              </SideNav>

              <GlassPanelDivider />
              <Panel width={268} surface="transparent">
                <PanelHeader size="sm">
                  <Text size="sm" weight="bold">
                    List
                  </Text>
                  <WindowDragArea />
                  <Text size="xs" tone="tertiary" tabular>
                    3
                  </Text>
                </PanelHeader>
                <ItemList>
                  <ItemGroupHeader surface="glass">Awaiting review</ItemGroupHeader>
                  {['Decide the tokens', 'Align the components', 'Rewrite the guidelines'].map((t, i) => (
                    <ItemRow key={t} type="button" selected={i === 0} title={t}>
                      <StatusIndicator shape="diamond" tone="warning" label="Awaiting review" />
                      <Text size="sm" truncate sx={{ flex: '1 1 auto' }}>
                        {t}
                      </Text>
                    </ItemRow>
                  ))}
                </ItemList>
              </Panel>
            </GlassPanel>
            <AppShellMain>
              {/* Reading surfaces don't show through. Paint the paper opaque, and let the quality of the ground say which pane is the star */}
              <Panel surface="canvas" grow>
                <PanelHeader size="lg">
                  <Text size="lg" weight="bold">
                    Primary pane
                  </Text>
                  <WindowDragArea />
                </PanelHeader>
                <PanelBody>
                  <EmptyState title="Reading surfaces are painted opaque" />
                </PanelBody>
              </Panel>
              <AppShellFooter>
                <StatusBarItem>
                  <Text tone="tertiary">Running</Text>
                  <Counter>1</Counter>
                </StatusBarItem>
              </AppShellFooter>
            </AppShellMain>
          </AppShellBody>
        </AppShell>
      </div>
    )
  }
}
