import type { Meta, StoryObj } from '@storybook/react-vite'
import { CirclePlay, Lock, TriangleAlert } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Counter } from '../data-display/Badge.js'
import { Gauge } from '../data-display/Gauge.js'
import { Text } from '../data-display/Text.js'
import { AppShellFooter } from '../layout/AppShell.js'
import { Spacer } from '../layout/Stack.js'
import { useTheme } from '../../theme/ThemeProvider.js'
import { PillButton, StatusBarItem, StatusBarNotice } from './StatusBar.js'

const meta: Meta = { title: 'Navigation/StatusBar', parameters: { layout: 'fullscreen' } }
export default meta

/** Not a surface for reading but one for "noticing a change". Numbers are monospaced and fixed-width. */
export const Default: StoryObj = {
  render: function Render() {
    const theme = useTheme()
    return (
      <AppShellFooter>
        <StatusBarItem title="Slots in use / total">
          <Text tone="tertiary">Running</Text>
          <Counter>1</Counter>
          <Text tone="tertiary">/ 4</Text>
          <Gauge
            label="Slots"
            cells={[
              { kind: 'filled' },
              { kind: 'outlined' },
              { kind: 'empty' },
              { kind: 'muted' }
            ]}
          />
        </StatusBarItem>

        <StatusBarItem onClick={() => undefined}>
          <Text tone="tertiary">Waiting</Text>
          <Counter>1</Counter>
        </StatusBarItem>

        <StatusBarItem onClick={() => undefined}>
          <Text tone="tertiary">Awaiting review</Text>
          <Counter tone="warning">2</Counter>
        </StatusBarItem>

        <StatusBarItem onClick={() => undefined}>
          <Text tone="tertiary">Failed</Text>
          <Counter tone="danger" zero>
            0
          </Counter>
        </StatusBarItem>

        <StatusBarItem accent={theme.palette.primary.main} onClick={() => undefined}>
          <Lock size={iconSize.sm} {...iconDefaults} />
          <Text tone="tertiary">Reserved</Text>
          <Counter>1</Counter>
        </StatusBarItem>

        <Spacer />

        <StatusBarNotice>
          <TriangleAlert size={iconSize.sm} {...iconDefaults} />
          <Text truncate>Beta is unavailable until 10:36</Text>
        </StatusBarNotice>

        <PillButton type="button">
          <CirclePlay size={iconSize.sm} {...iconDefaults} />
          Active
        </PillButton>
      </AppShellFooter>
    )
  }
}

/** An out-of-the-ordinary state draws a line along the top edge of the bar. */
export const Paused: StoryObj = {
  render: function Render() {
    const theme = useTheme()
    return (
      <AppShellFooter accent={theme.palette.warning.main}>
        <StatusBarItem>
          <Text tone="tertiary">Running</Text>
          <Counter zero>0</Counter>
        </StatusBarItem>
        <Spacer />
        <StatusBarNotice>
          <TriangleAlert size={iconSize.sm} {...iconDefaults} />
          <Text truncate>Paused</Text>
        </StatusBarNotice>
      </AppShellFooter>
    )
  }
}
