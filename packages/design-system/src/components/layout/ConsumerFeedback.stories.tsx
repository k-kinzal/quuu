import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { paneProfiles, type PaneWidth } from '../../layoutSpec.js'
import { Text } from '../data-display/Text.js'
import { DataList, DescriptionList } from '../data-display/DescriptionList.js'
import { HistoryChain } from '../data-display/HistoryList.js'
import { ToastStack } from '../feedback/Toast.js'
import { AppShell, AppShellBody, AppShellFooter } from './AppShell.js'
import { Panel, PanelHeader, PanelBody, Toolbar } from './Panel.js'
import { Resizer } from './Resizer.js'

const meta: Meta = { title: 'Layout/ConsumerFeedback', parameters: { layout: 'fullscreen' } }
export default meta

/** Put the parts side by side and check that the per-use dimensions and the shared source of truth do not diverge. */
export const Composition: StoryObj = {
  render: function Render() {
    const [width, setWidth] = useState<PaneWidth>(paneProfiles.navigation.initial)
    return (
      <AppShell sx={{ height: '100vh' }}>
        <AppShellBody>
          <Panel width={width} surface="subtle">
            <PanelHeader><Text>Navigation</Text></PanelHeader>
            <PanelBody><Text>Width {width}</Text></PanelBody>
          </Panel>
          <Resizer profile="navigation" value={width} onChange={setWidth} />
          <Panel grow>
            <PanelHeader><Text>Attributes and history</Text></PanelHeader>
            <Toolbar placement="panel"><Text>Filter</Text></Toolbar>
            <PanelBody pad={4}>
              <DescriptionList labels="short"><dt>Name</dt><dd>The column still starts in the same place with a long name</dd><dt>Email</dt><dd>example@example.test</dd></DescriptionList>
              <HistoryChain>Related history</HistoryChain>
              <DataList placement="history"><dt>Command</dt><dd>example --verbose</dd><dt>Location</dt><dd>/Projects/example</dd></DataList>
            </PanelBody>
          </Panel>
        </AppShellBody>
        <AppShellFooter>The band along the bottom</AppShellFooter>
        <ToastStack placement="aboveFooter" toasts={[{id:'preview',tone:'info',message:'Changes applied'}]} onSelect={() => undefined} />
      </AppShell>
    )
  }
}
