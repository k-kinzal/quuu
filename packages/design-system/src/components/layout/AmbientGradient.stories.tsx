import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { AmbientGradient } from './AmbientGradient.js'
import { AppShell, AppShellBody, AppShellMain } from './AppShell.js'
import { GlassPanel } from './GlassPanel.js'
import { Panel, PanelBody, PanelHeader, PanelHeading } from './Panel.js'
import { Button } from '../inputs/Button.js'
import { TextInput } from '../inputs/TextInput.js'
import { Text } from '../data-display/Text.js'
import { Column } from './Stack.js'
import { paneProfiles } from '../../layoutSpec.js'
import { palettes } from '../../theme/tokens.js'

const meta: Meta = { title: 'Layout/AmbientGradient', parameters: { layout: 'fullscreen' } }
export default meta

function Example({ translucent = false }: { translucent?: boolean }): JSX.Element {
  const [enabled, setEnabled] = useState(true)
  const [value, setValue] = useState('Text selection and typing stay available')
  return (
    <div style={{ height: '100vh', background: translucent ? `linear-gradient(130deg, ${palettes.dark.accents.blue}, ${palettes.dark.surface.canvas}, ${palettes.dark.accents.violet})` : undefined }}>
      <AppShell>
        <AppShellBody>
          <GlassPanel>
            <Panel width={paneProfiles.navigation.initial} surface="transparent">
              <PanelHeader><PanelHeading>Navigation</PanelHeading></PanelHeader>
              <PanelBody pad={3}><Text>Translucent material</Text></PanelBody>
            </Panel>
          </GlassPanel>
          <AppShellMain>
            <PanelHeader><PanelHeading>Ambient color</PanelHeading></PanelHeader>
            <PanelBody pad={3}>
              <Column gap="lg">
        <Text>Read for a while: the colors merge and separate over two to three minutes. The entire field stays at 3.5% opacity.</Text>
                <TextInput aria-label="Sample input" value={value} onChange={(event) => setValue(event.target.value)} />
                <Button onClick={() => setEnabled(!enabled)}>{enabled ? 'Hide ambient color' : 'Show ambient color'}</Button>
                <Text tone="secondary">Reduced motion and forced colors remove the decoration. Hidden windows pause it.</Text>
              </Column>
            </PanelBody>
          </AppShellMain>
        </AppShellBody>
      </AppShell>
      {enabled && <AmbientGradient />}
    </div>
  )
}

export const Dark: StoryObj = { globals: { colorScheme: 'dark' }, render: () => <Example /> }
export const Light: StoryObj = { globals: { colorScheme: 'light' }, render: () => <Example /> }
export const Translucent: StoryObj = { render: () => <Example translucent /> }
