import { useState } from 'react'
import { paneProfiles } from '../../layoutSpec.js'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChevronRight } from 'lucide-react'
import { iconDefaults, iconSize } from '../../theme/tokens.js'
import { Text } from '../data-display/Text.js'
import { Panel, PanelBody } from './Panel.js'
import { CollapseHandle, Resizer } from './Resizer.js'
import { Row } from './Stack.js'

const meta: Meta = { title: 'Layout/Resizer', parameters: { layout: 'fullscreen' } }
export default meta

/** Keep one flexible-width pane, and place one boundary at a time. */
export const Default: StoryObj = {
  render: function Render() {
    const [width, setWidth] = useState(paneProfiles.collection.initial)
    const [collapsed, setCollapsed] = useState(false)
    return (
      <Row gap={0} align="stretch" sx={{ height: 300 }}>
        {collapsed ? (
          <CollapseHandle
            title="Restore"
            icon={<ChevronRight size={iconSize.sm} {...iconDefaults} />}
            onClick={() => setCollapsed(false)}
          />
        ) : (
          <>
            <Panel width={width}>
              <PanelBody pad={3}>
                <Text size="sm">Width {width}px (drag the boundary)</Text>
                <Text
                  block
                  size="xs"
                  tone="tertiary"
                  sx={{ mt: 2, cursor: 'pointer' }}
                  onClick={() => setCollapsed(true)}
                >
                  Collapse
                </Text>
              </PanelBody>
            </Panel>
            <Resizer value={width} profile="collection" onChange={setWidth} />
          </>
        )}
        <Panel surface="canvas" grow>
          <PanelBody pad={3}>
            <Text size="sm" tone="tertiary">
              This pane takes the remainder
            </Text>
          </PanelBody>
        </Panel>
      </Row>
    )
  }
}
