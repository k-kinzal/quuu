import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../inputs/Button.js'
import { MenuNav, MenuNavItem, MenuNavTitle } from '../navigation/NavList.js'
import { AppShell, AppShellBody, AppShellMain } from './AppShell.js'
import { ConversationWorkspace } from './ConversationWorkspace.js'
import { MotionLayout, motionRegion } from './MotionLayout.js'
import { Page, Section } from './Page.js'
import { Panel, PanelHeader, PanelHeading } from './Panel.js'

const meta: Meta = { title: 'Layout/WindowControls', parameters: { layout: 'fullscreen' } }
export default meta

export type WindowScreen = 'new' | 'settings' | 'page' | 'thread'

/** The same shell accepts a new screen without any per-screen inset or rail-state props. */
export function WindowControlsSpecimen({ screen = 'new', collapsed = true, inset = 84 }: {
  screen?: WindowScreen; collapsed?: boolean; inset?: number
}): JSX.Element {
  return <AppShell windowControlsInset={inset} glass style={{ height: 440, position: 'relative' }}>
    <AppShellBody>
      <MotionLayout motionKey={String(collapsed)} contextKey={screen}>
        <div data-window-rail {...motionRegion('rail', 'left')}
          style={{ width: collapsed ? 42 : 208, flexShrink: 0 }} />
        <AppShellMain windowHeader>
          {screen === 'settings' ? <AppShellBody>
            <MenuNav>
              <MenuNavTitle><span data-window-content>Settings</span></MenuNavTitle>
              {Array.from({ length: 30 }, (_, i) => <MenuNavItem key={i} label={`Category ${i + 1}`} icon={<span />} onClick={() => { }} />)}
            </MenuNav>
            <Panel grow><PanelHeader><PanelHeading>Selected category</PanelHeading></PanelHeader></Panel>
          </AppShellBody> : screen === 'page' ? <Panel grow scroll data-window-scroll>
            <Page title="Details" lead={<Button data-window-content>Back</Button>}>
              {Array.from({ length: 12 }, (_, i) => <Section title={`Group ${i + 1}`} key={i}>
                <PanelHeader data-lower-header><PanelHeading>Nested section</PanelHeading></PanelHeader>
              </Section>)}
            </Page>
          </Panel> : screen === 'thread' ? <ConversationWorkspace threadOpen>
            <Panel windowHeader data-conversation-channel>
              <PanelHeader><PanelHeading>Channel</PanelHeading></PanelHeader>
            </Panel>
            <Panel windowHeader data-conversation-thread>
              <PanelHeader><Button data-window-content>Back to channel</Button><PanelHeading>Thread</PanelHeading></PanelHeader>
            </Panel>
          </ConversationWorkspace> : <Panel grow windowHeader>
            <PanelHeader><Button data-window-content>New screen</Button><PanelHeading>Title</PanelHeading></PanelHeader>
            <PanelHeader data-lower-header><PanelHeading>Body toolbar</PanelHeading></PanelHeader>
          </Panel>}
        </AppShellMain>
      </MotionLayout>
    </AppShellBody>
    {inset > 0 && <div aria-hidden style={{ position: 'absolute', left: 14, top: 14, display: 'flex', gap: 9, pointerEvents: 'none' }}>
      {['#ff5f57', '#febc2e', '#28c840'].map(background => <span key={background} style={{ width: 14, height: 14, borderRadius: '50%', background }} />)}
    </div>}
  </AppShell>
}

export const Automatic: StoryObj = {
  render: function Render() {
    const [collapsed, setCollapsed] = useState(true)
    const [screen, setScreen] = useState<WindowScreen>('new')
    return <>
      <WindowControlsSpecimen collapsed={collapsed} screen={screen} />
      <Button onClick={() => setCollapsed(!collapsed)}>Toggle navigation</Button>
      {(['new', 'settings', 'page', 'thread'] as const).map(value => <Button key={value} onClick={() => setScreen(value)}>{value}</Button>)}
    </>
  }
}
