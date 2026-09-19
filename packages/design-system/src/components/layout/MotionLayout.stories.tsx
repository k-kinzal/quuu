import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '../inputs/Button.js'
import { ContentTabs, ContentTabPanel } from '../navigation/ContentTabs.js'
import { Reveal } from '../surfaces/Reveal.js'
import { Text } from '../data-display/Text.js'
import { GlassPanel } from './GlassPanel.js'
import { Panel, PanelHeader, PanelHeading, PanelBody } from './Panel.js'
import { AppShell, AppShellBody, AppShellMain } from './AppShell.js'
import { MotionLayout, motionRegion, motionAnchor } from './MotionLayout.js'
import { Row } from './Stack.js'
import { PaneStack, WorkbenchPane, WorkbenchPaneBody } from './Workbench.js'
import { paneProfiles } from '../../layoutSpec.js'

const meta: Meta = { title: 'Layout/Motion', parameters: { layout: 'fullscreen' } }
export default meta

function Example(): JSX.Element {
  const [detail, setDetail] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [listHidden, setListHidden] = useState(false)
  const [inspector, setInspector] = useState(false)
  const [bottom, setBottom] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState('first')
  const list = (compact: boolean): JSX.Element => (
    <Panel {...motionRegion('collection', 'left')} width={compact ? paneProfiles.collection.initial : undefined} grow={!compact} surface={compact ? 'transparent' : 'canvas'}>
      <PanelHeader><PanelHeading>Collection</PanelHeading></PanelHeader>
      <PanelBody pad={3}>
        {['First item', 'Second item', 'Third item'].map((label) => <p key={label}><Button {...motionAnchor(label)} onClick={() => setDetail(true)}>{label}</Button>{!compact && <Text>Supporting columns in the full collection</Text>}</p>)}
      </PanelBody>
    </Panel>
  )
  return (
    <div style={{ height: '100vh' }}>
      <AppShell>
        <PanelHeader>
          <Row gap="sm">
            <Button onClick={() => setCollapsed(!collapsed)}>Toggle navigation</Button>
            <Button onClick={() => setDetail(!detail)}>Toggle detail</Button>
            <Button onClick={() => setListHidden(!listHidden)}>Toggle collection</Button>
            <Button onClick={() => setInspector(!inspector)}>Toggle inspector</Button>
            <Button onClick={() => setBottom(!bottom)}>Toggle lower pane</Button>
          </Row>
        </PanelHeader>
        <AppShellBody>
          <MotionLayout motionKey={`${collapsed}:${detail}:${listHidden}`}>
            <GlassPanel>
              <Panel {...motionRegion('navigation', 'left')} width={collapsed ? 52 : paneProfiles.navigation.initial} surface="transparent">
                <PanelHeader><PanelHeading>{collapsed ? 'N' : 'Navigation'}</PanelHeading></PanelHeader>
              </Panel>
              {detail && !listHidden && list(true)}
            </GlassPanel>
            <AppShellMain>
              {!detail ? list(false) : (
                <Panel {...motionRegion('detail')} surface="canvas" grow>
                  <PanelHeader><Button onClick={() => setDetail(false)}>Back</Button><PanelHeading>Detail</PanelHeading></PanelHeader>
                  <MotionLayout motionKey={`${inspector}:${bottom}`}>
                    <PaneStack>
                      <WorkbenchPane {...motionRegion('body', 'left')}>
                        <WorkbenchPaneBody pad={3}>
                          <ContentTabs idBase="motion-tabs" label="Content" value={tab} onChange={setTab} options={[{ value: 'first', label: 'First tab' }, { value: 'second', label: 'Second tab' }]} />
                          <ContentTabPanel idBase="motion-tabs" value="first" activeValue={tab}><Text>Tab content switches immediately.</Text></ContentTabPanel>
                          <ContentTabPanel idBase="motion-tabs" value="second" activeValue={tab}><Text>The second tab also switches immediately.</Text></ContentTabPanel>
                          <Button onClick={() => setExpanded(!expanded)}>Toggle disclosure</Button>
                          <Reveal open={expanded}><Text>Disclosure content slides down and closes upwards.</Text></Reveal>
                        </WorkbenchPaneBody>
                      </WorkbenchPane>
                      {bottom && <WorkbenchPane {...motionRegion('lower', 'bottom')}><WorkbenchPaneBody pad={3}><Text>The lower pane slides up.</Text></WorkbenchPaneBody></WorkbenchPane>}
                    </PaneStack>
                    {inspector && <Panel {...motionRegion('inspector')} width={paneProfiles.inspector.initial}><PanelBody pad={3}><Text>The inspector slides in from the right.</Text></PanelBody></Panel>}
                    <Panel width={52}><Text>Tools</Text></Panel>
                  </MotionLayout>
                </Panel>
              )}
            </AppShellMain>
          </MotionLayout>
        </AppShellBody>
      </AppShell>
    </div>
  )
}

export const Interactive: StoryObj = { render: () => <Example /> }
