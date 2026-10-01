import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ThemeProvider } from '../../theme/ThemeProvider.js'
import { Button } from '../inputs/Button.js'
import { CheckboxGroup, SegmentedControl } from '../inputs/Toggle.js'
import { NumberInput, Select, TextArea, TextInput } from '../inputs/TextInput.js'
import { Page } from './Page.js'
import { InputAction, SettingRow, SettingToggle, SettingsBlock, SettingsGroup } from './Settings.js'
import { Row } from './Stack.js'

const meta: Meta = { title: 'Patterns/Settings', parameters: { layout: 'fullscreen' } }
export default meta

function Example(): JSX.Element {
  const [enabled, setEnabled] = useState(true)
  const [scheme, setScheme] = useState('system')
  const [days, setDays] = useState(14)
  const [events, setEvents] = useState(['opened'])
  const [connected, setConnected] = useState(false)
  const [port, setPort] = useState(8080)
  return <Page title="Preferences">
    <SettingsGroup title="Behavior">
      <SettingToggle label="Continue in the background" hint="Applies when the window closes" checked={enabled} onChange={setEnabled} />
      <SettingRow label="Color scheme" width="auto">
        <SegmentedControl<string> label="Color scheme" value={scheme} onChange={setScheme} options={[
          { value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }
        ]} />
      </SettingRow>
      <SettingRow label="History" hint="Keep earlier activity" width="xs">
        <NumberInput value={days} onChange={setDays} min={0} max={3650} zeroLabel="Forever" unit="days" />
      </SettingRow>
    </SettingsGroup>
    <SettingsGroup title="Workspace">
      <SettingRow label="Name"><TextInput defaultValue="Library" /></SettingRow>
      <SettingRow label="Application">
        <InputAction><Select aria-label="Application" value="default" options={[{ value: 'default', label: 'Follow the default (Text editor)' }]} /><Button>Browse…</Button></InputAction>
      </SettingRow>
      <SettingRow label="Directory" layout="stacked">
        <InputAction><TextInput mono readOnly value="/Users/example/Projects/a-long-workspace-name-with-several-packages" /><Button>Change</Button></InputAction>
      </SettingRow>
    </SettingsGroup>
    <SettingsGroup title="Instructions">
      <SettingRow label="Instructions" hint="Shared with every workspace" layout="stacked">
        <TextArea rows={4} defaultValue="Read the project overview and summarize the results." />
      </SettingRow>
      <SettingRow label="When to run" layout="stacked">
        <CheckboxGroup label="When to run" options={[{ value: 'opened', label: 'Opened' }, { value: 'closed', label: 'Closed' }, { value: 'changed', label: 'Content changed' }]} value={events} onChange={setEvents} />
      </SettingRow>
      <SettingToggle kind="checkbox" label="Include this in the saved configuration" checked={enabled} onChange={setEnabled} />
    </SettingsGroup>
    <SettingsGroup title="Connection">
      <SettingToggle label="Allow connections" checked={connected} onChange={setConnected}>
        <SettingRow label="Host"><TextInput defaultValue="127.0.0.1" /></SettingRow>
        <SettingRow label="Port" width="sm"><InputAction><NumberInput value={port} onChange={setPort} min={1} max={65535} /><Button>Apply</Button></InputAction></SettingRow>
      </SettingToggle>
      <SettingsBlock><Row justify="between" wrap><span>Workstation · Connected</span><Button>Disconnect</Button></Row></SettingsBlock>
    </SettingsGroup>
  </Page>
}
export const Default: StoryObj = { render: () => <Example /> }
export const Light: StoryObj = { render: () => <ThemeProvider colorScheme="light"><Example /></ThemeProvider> }
export const Narrow: StoryObj = { render: () => <div style={{ maxWidth: 390 }}><Example /></div> }
export const Comfortable: StoryObj = { render: () => <ThemeProvider colorScheme="light" density="comfortable"><div style={{ maxWidth: 600 }}><Example /></div></ThemeProvider> }
